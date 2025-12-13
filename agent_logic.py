import os
import json
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
import re
import uuid
from typing import Annotated, TypedDict, List, Literal
from operator import add
from sklearn.cluster import KMeans

from langchain_core.documents import Document
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain.chains.query_constructor.schema import AttributeInfo
from langchain.chains.query_constructor.base import (
    StructuredQueryOutputParser,
    get_query_constructor_prompt
)
from langchain.chains.query_constructor.ir import Comparator, Operator
from langchain.retrievers.self_query.base import SelfQueryRetriever
from langchain_community.query_constructors.qdrant import QdrantTranslator
from langchain_qdrant import QdrantVectorStore
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.store.memory import InMemoryStore
from langgraph.store.base import BaseStore
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

# =============================================================================
# 1. ANALYSIS & MATCHING LOGIC (Recommendation Route)
# =============================================================================

class CompanyMatcher:
    def __init__(self, excel_path: str):
        self.df = pd.read_excel(excel_path)
        self.summary_df = self._prepare_summary_data()

    def _prepare_summary_data(self):
        # Ensure correct types
        if 'trade date' in self.df.columns:
            self.df['trade date'] = pd.to_datetime(self.df['trade date'])
            self.df['month'] = self.df['trade date'].dt.to_period('M').astype(str)
        elif 'Trade date' in self.df.columns:
            self.df['trade date'] = pd.to_datetime(self.df['Trade date'])
            self.df['month'] = self.df['trade date'].dt.to_period('M').astype(str)

        # Group by Buyer
        summary_df = self.df.groupby('Buyer').agg(
            total_in_USD=('amount', 'sum'),
            total_in_Volume=('qty', 'sum'),
            Location=('Buyer country', 'first')
        ).reset_index()

        # Binary Indicators
        def check_label(buyer, label_type):
            buyer_labels = self.df[self.df['Buyer'] == buyer]['label'].str.lower().unique()
            return 1 if label_type in buyer_labels else 0

        summary_df['is_fabric'] = summary_df['Buyer'].apply(lambda x: check_label(x, 'fabric'))
        summary_df['is_filament'] = summary_df['Buyer'].apply(lambda x: check_label(x, 'filament'))
        summary_df['is_fiber'] = summary_df['Buyer'].apply(lambda x: check_label(x, 'fiber'))
        summary_df['is_clothing'] = summary_df['Buyer'].apply(lambda x: check_label(x, 'clothing'))

        # Strongest Biz
        def get_strongest_biz(buyer):
            buyer_df = self.df[self.df['Buyer'] == buyer]
            relevant_labels = ['fabric', 'filament', 'fiber', 'clothing']
            biz_stats = buyer_df[buyer_df['label'].str.lower().isin(relevant_labels)].groupby('label')['amount'].sum()
            if biz_stats.empty: return 'None'
            return biz_stats.idxmax()

        summary_df['strongest_in_USD'] = summary_df['Buyer'].apply(get_strongest_biz)

        # Scale Logic (Big vs Small) via KMeans
        X = summary_df[['total_in_Volume']].values
        if len(X) >= 2:
            kmeans = KMeans(n_clusters=2, random_state=42)
            summary_df['Cluster'] = kmeans.fit_predict(X)
            cluster_means = summary_df.groupby('Cluster')['total_in_Volume'].mean()
            big_cluster_label = cluster_means.idxmax()
            summary_df['Scale'] = summary_df['Cluster'].apply(lambda x: 'Big' if x == big_cluster_label else 'Small')
        else:
             summary_df['Scale'] = 'Small' # Default if not enough data

        return summary_df

    def find_matches(self, user_data: dict):
        """
        Find top 3 matching companies using 6-component scoring system.
        Includes LLM-based location correction as per analyze_trade_data.ipynb.
        """
        summary_df = self.summary_df.copy()
        
        # === 1. ROBUST LOCATION MATCHING (LLM CORRECTION) ===
        # This follows lines 610-618 of analyze_trade_data.ipynb
        try:
            llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)
            correction_prompt = f"Correct the spelling of this location to a standard country name: '{user_data['Location']}'. Return ONLY the name."
            corrected_location = llm.invoke(correction_prompt).content.strip()
            print(f"📍 Location interpreted as: {corrected_location} (Original: {user_data['Location']})")
            user_data['Location'] = corrected_location
        except Exception as e:
            print(f"⚠️  Warning: Could not verify location spelling ({e}). Using original.")
        
        scores = []
        for _, row in summary_df.iterrows():
            # 1. Location Score (1 point)
            score_loc = 1.0 if str(user_data['Location']).lower() == str(row['Location']).lower() else 0.0
            
            # 2. Scale Score (1 point)
            score_scale = 1.0 if user_data['Scale'] == row['Scale'] else 0.0
            
            # 3. Strongest Business Score (1 point)
            score_strongest = 1.0 if str(user_data['strongest_in_USD']).lower() == str(row['strongest_in_USD']).lower() else 0.0
            
            # 4. Business Activities Score (Max 1 point)
            matches = 0
            matches += 1 if user_data['is_fabric'] == row['is_fabric'] else 0
            matches += 1 if user_data['is_filament'] == row['is_filament'] else 0
            matches += 1 if user_data['is_fiber'] == row['is_fiber'] else 0
            matches += 1 if user_data['is_clothing'] == row['is_clothing'] else 0
            score_activity = matches / 4.0

            # 5. Total USD Score (1 point, approx +/- 10%)
            lower_usd = user_data['total_in_USD'] * 0.9
            upper_usd = user_data['total_in_USD'] * 1.1
            score_usd = 1.0 if lower_usd <= row['total_in_USD'] <= upper_usd else 0.0
            
            #6. Total Volume Score (1 point, approx +/- 10%)
            lower_vol = user_data['total_in_Volume'] * 0.9
            upper_vol = user_data['total_in_Volume'] * 1.1
            score_vol = 1.0 if lower_vol <= row['total_in_Volume'] <= upper_vol else 0.0
            
            # Total: Max 6.0 points
            total_score = score_loc + score_scale + score_strongest + score_activity + score_usd + score_vol
            
            scores.append({
                'Buyer': row['Buyer'],
                'Total Score': total_score,
                'Location': row['Location'],
                'Scale': row['Scale'],
                'Strongest': row['strongest_in_USD'],
                'Breakdown': f"Loc: {score_loc}, Scale: {score_scale}, Strong: {score_strongest}, Act: {score_activity:.2f}, USD: {score_usd}, Vol: {score_vol}"
            })
            
        return pd.DataFrame(scores).sort_values('Total Score', ascending=False).head(3)

    # --- Plotting Functions for a Matched Company ---

    def plot_performance(self, company):
        company_df = self.df[self.df['Buyer'] == company]
        if company_df.empty: return None

        monthly_data = company_df.groupby('month')[['amount', 'qty']].sum().reset_index().sort_values('month')

        fig, ax1 = plt.subplots(figsize=(10, 5))
        
        color = 'tab:blue'
        ax1.set_xlabel('Month')
        ax1.set_ylabel('Total Amount (USD)', color=color)
        sns.lineplot(data=monthly_data, x='month', y='amount', marker='o', color=color, ax=ax1, label='Amount')
        ax1.tick_params(axis='y', labelcolor=color)
        ax1.grid(True)

        ax2 = ax1.twinx()
        color = 'tab:orange'
        ax2.set_ylabel('Quantity (Units)', color=color)
        sns.lineplot(data=monthly_data, x='month', y='qty', marker='s', color=color, ax=ax2, label='Quantity')
        ax2.tick_params(axis='y', labelcolor=color)
        ax2.grid(False)

        plt.title(f'Performance: {company}')
        fig.tight_layout()
        return fig

    def plot_pie_distribution(self, company, category='Product'):
        """
        Plot pie charts showing distribution by category (Product or label).
        Args:
            company: Company name to analyze
            category: Grouping category - 'Product' or 'label' (interactive parameter)
        """
        company_df = self.df[self.df['Buyer'] == company]
        if company_df.empty: return None

        grouped = company_df.groupby(category)[['amount', 'qty']].sum().sort_values('amount', ascending=False)
        
        top_n = 5
        if len(grouped) > top_n:
            top = grouped.head(top_n)
            others = grouped.iloc[top_n:].sum()
            others.name = 'Others'
            # Create a DataFrame for 'Others' to append correctly
            others_df = pd.DataFrame([others], index=['Others'])
            plot_data = pd.concat([top, others_df])
        else:
            plot_data = grouped

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 8))
        
        # Pie Chart 1: Amount Distribution
        ax1.pie(plot_data['amount'], labels=plot_data.index, autopct='%1.1f%%', startangle=140)
        ax1.set_title(f'Share of Total Amount (USD) by {category}')
        
        # Pie Chart 2: Volume Distribution
        ax2.pie(plot_data['qty'], labels=plot_data.index, autopct='%1.1f%%', startangle=140)
        ax2.set_title(f'Share of Total Volume (Units) by {category}')
        
        plt.suptitle(f'Distribution Analysis for {company}', fontsize=16)
        plt.tight_layout()
        return fig

    def plot_top_suppliers(self, company, type_filter='General'):
        """
        Plot top 3 suppliers by Amount and Volume, with optional type filtering.
        Args:
            company: Company name to analyze
            type_filter: Filter by label type - 'General', 'Fabric', 'Filament', 'Fiber', or 'Clothing' (interactive parameter)
        """
        company_df = self.df[self.df['Buyer'] == company]
        
        # Filter by Type (Label)
        if type_filter != 'General':
            # Case-insensitive matching
            company_df = company_df[company_df['label'].str.lower() == type_filter.lower()]
        
        if company_df.empty: 
            print(f"No data found for {company} with type '{type_filter}'")
            return None
        
        # Group by Supplier
        supplier_stats = company_df.groupby('Supplier')[['amount', 'qty']].sum()
        
        # Get Top 3 by Amount
        top_amount = supplier_stats.sort_values('amount', ascending=False).head(3)
        
        # Get Top 3 by Volume
        top_volume = supplier_stats.sort_values('qty', ascending=False).head(3)
        
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

        # Bar Chart 1: Top 3 Suppliers by Amount
        sns.barplot(x=top_amount['amount'], y=top_amount.index, hue=top_amount.index, palette='viridis', ax=ax1, legend=False)
        ax1.set_title(f'Top 3 Suppliers by Amount (USD) - {type_filter}')
        ax1.set_xlabel('Total Amount (USD)')
        ax1.set_ylabel('Supplier')

        # Bar Chart 2: Top 3 Suppliers by Volume
        sns.barplot(x=top_volume['qty'], y=top_volume.index, hue=top_volume.index, palette='magma', ax=ax2, legend=False)
        ax2.set_title(f'Top 3 Suppliers by Volume (Units) - {type_filter}')
        ax2.set_xlabel('Total Quantity (Units)')
        ax2.set_ylabel('Supplier')
        
        plt.suptitle(f'Supplier Analysis for {company}', fontsize=16)
        plt.tight_layout()
        return fig


# =============================================================================
# 2. SEARCH AGENT LOGIC (Search Route) - Enhanced Version
# =============================================================================
input_file = "report_by_label.json"
print(f"📖 Loading data from: {input_file}")

with open(input_file, 'r', encoding='utf-8') as f:
    label_reports = json.load(f)

print(f"✅ Loaded {len(label_reports)} label reports\n")


# --- Step 1: Normalize metadata field names ---
def normalize_metadata(meta: dict):
    """Normalize metadata keys to ensure consistency"""
    rename_map = {
        "weight_sum": "total_weight",
        "weight_mean": "avg_weight",
        "qty_sum": "total_quantity",
        "qty_mean": "avg_quantity",
        "amount_sum": "total_amount",
        "amount_mean": "avg_amount"
    }
    new_meta = {}
    for k, v in meta.items():
        new_key = rename_map.get(k, k)
        new_meta[new_key] = v
    return new_meta


# --- Step 2: Create summaries for each label report ---
def create_summary(report: dict) -> str:
    """Generate a natural language summary for each report"""
    label = report.get("label", "Unknown")
    total_txn = report.get("total_transactions", 0)
    total_weight = report.get("weight_sum", 0)
    avg_weight = report.get("weight_mean", 0)
    total_qty = report.get("qty_sum", 0)
    avg_qty = report.get("qty_mean", 0)
    total_amount = report.get("amount_sum", 0)
    avg_amount = report.get("amount_mean", 0)

    summary = f"""
Trade Report Summary for {label.upper()}:

This report covers {total_txn} transactions for {label} products.

Weight Statistics:
- Total weight: {total_weight:,.2f} kg
- Average weight per transaction: {avg_weight:,.2f} kg

Quantity Statistics:
- Total quantity: {total_qty:,.2f} units
- Average quantity per transaction: {avg_qty:,.2f} units

Financial Statistics:
- Total trade amount: ${total_amount:,.2f} USD
- Average amount per transaction: ${avg_amount:,.2f} USD

Product Category: {label}
Transaction Volume: {total_txn} shipments
""".strip()

    return summary


# --- Step 3: Prepare documents with summaries and metadata ---
print("📝 Creating vector documents...")
vector_docs = []

for report in label_reports:
    summary = create_summary(report)

    metadata = {
        "label": report["label"],
        "total_transactions": report["total_transactions"],
        "weight_sum": report["weight_sum"],
        "weight_mean": report["weight_mean"],
        "qty_sum": report["qty_sum"],
        "qty_mean": report["qty_mean"],
        "amount_sum": report["amount_sum"],
        "amount_mean": report["amount_mean"],
        "source": "trade_report_by_label"
    }

    vector_doc = Document(
        page_content=summary,
        metadata=normalize_metadata(metadata)
    )
    vector_docs.append(vector_doc)

print(f"✅ Created {len(vector_docs)} vector documents\n")


# --- Step 4: Initialize embeddings ---
print("🔤 Initializing embeddings...")
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
print("✅ Embeddings initialized\n")


# --- Step 5: Create in-memory Qdrant vector store ---
print("🗄️  Creating Qdrant vector store...")
vectorstore = QdrantVectorStore.from_documents(
    documents=vector_docs,
    embedding=embeddings,
    collection_name="trade_label_reports",
    location=":memory:"
)
print(f"✅ Qdrant vector store created with {len(vector_docs)} documents\n")


# --- Step 6: Define document description ---
mo_ta_bao_cao = """Báo cáo thương mại theo nhãn sản phẩm có cấu trúc như sau:
- LABEL (nhãn): Loại sản phẩm (fabric, clothing, filament, fiber, other)
- TOTAL_TRANSACTIONS (số giao dịch): Tổng số lượng giao dịch
- TOTAL_WEIGHT (tổng trọng lượng): Tổng trọng lượng tính bằng kg
- AVG_WEIGHT (trọng lượng trung bình): Trọng lượng trung bình mỗi giao dịch (kg)
- TOTAL_QUANTITY (tổng số lượng): Tổng số lượng sản phẩm
- AVG_QUANTITY (số lượng trung bình): Số lượng trung bình mỗi giao dịch
- TOTAL_AMOUNT (tổng giá trị): Tổng giá trị giao dịch tính bằng USD
- AVG_AMOUNT (giá trị trung bình): Giá trị trung bình mỗi giao dịch (USD)

Khi tìm kiếm:
- Để lọc theo loại sản phẩm cụ thể → dùng eq("label", "tên_loại")
- Để tìm theo giá trị lớn hơn/nhỏ hơn → dùng gt/gte/lt/lte
- Để tìm theo từ khóa trong label → dùng operator "like"
- Để kết hợp nhiều điều kiện → dùng "and()" hoặc "or()"
"""


# --- Step 7: Define metadata fields ---
metadata_fields = [
    AttributeInfo(
        name="label",
        description="Loại sản phẩm: fabric (vải), clothing (quần áo), filament (sợi tổng hợp), fiber (sợi), other (khác)",
        type="string",
    ),
    AttributeInfo(
        name="total_transactions",
        description="Tổng số giao dịch của loại sản phẩm này",
        type="integer",
    ),
    AttributeInfo(
        name="total_weight",
        description="Tổng trọng lượng tất cả giao dịch (kg)",
        type="float",
    ),
    AttributeInfo(
        name="avg_weight",
        description="Trọng lượng trung bình mỗi giao dịch (kg)",
        type="float",
    ),
    AttributeInfo(
        name="total_quantity",
        description="Tổng số lượng sản phẩm",
        type="float",
    ),
    AttributeInfo(
        name="avg_quantity",
        description="Số lượng trung bình mỗi giao dịch",
        type="float",
    ),
    AttributeInfo(
        name="total_amount",
        description="Tổng giá trị giao dịch (USD)",
        type="float",
    ),
    AttributeInfo(
        name="avg_amount",
        description="Giá trị trung bình mỗi giao dịch (USD)",
        type="float",
    ),
]


# --- Step 8: Initialize LLM for query construction ---
print("🤖 Initializing LLM...")
llm_query = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)
print("✅ LLM initialized\n")


# --- Step 9: Create query constructor prompt with examples ---
print("📋 Creating query constructor prompt...")
prompt_truy_van_thuong_mai = get_query_constructor_prompt(
    mo_ta_bao_cao,
    metadata_fields,
    allowed_comparators=[
        Comparator.EQ,
        Comparator.LT,
        Comparator.LTE,
        Comparator.GT,
        Comparator.GTE,
        Comparator.LIKE,
    ],
    allowed_operators=[Operator.AND, Operator.OR],
    examples=[
        # --- Examples with label filtering ---
        ("Show me fabric data", {"query": "fabric products", "filter": 'eq("label", "Fabric")'}),
        ("Get clothing report", {"query": "clothing products", "filter": 'eq("label", "Clothing")'}),
        ("What about fiber?", {"query": "fiber products", "filter": 'eq("label", "Fiber")'}),
        ("Tell me about filament", {"query": "filament products", "filter": 'eq("label", "Filament")'}),

        # --- Examples with numeric comparisons ---
        ("Which category has more than 50 transactions?", {"query": "high transaction volume", "filter": 'gt("total_transactions", 50)'}),
        ("Labels with total amount over 2 million", {"query": "high value trades", "filter": 'gt("total_amount", 2000000)'}),
        ("Products with average weight less than 5000 kg", {"query": "lightweight products", "filter": 'lt("avg_weight", 5000)'}),
        ("Categories with at least 20 transactions", {"query": "minimum transactions", "filter": 'gte("total_transactions", 20)'}),
        ("Labels with average amount over 90000", {"query": "high average value", "filter": 'gt("avg_amount", 90000)'}),

        # --- Examples with OR operator ---
        ("Get clothing or fiber data", {"query": "clothing fiber products", "filter": 'or(eq("label", "clothing"), eq("label", "fiber"))'}),
        ("Show fabric or filament reports", {"query": "fabric filament", "filter": 'or(eq("label", "fabric"), eq("label", "filament"))'}),
        ("Categories with less than 30 or more than 80 transactions", {"query": "extreme transaction volumes", "filter": 'or(lt("total_transactions", 30), gt("total_transactions", 80))'}),

        # --- Examples with AND operator ---
        ("Fabric with more than 90 transactions", {"query": "high volume fabric", "filter": 'and(eq("label", "fabric"), gt("total_transactions", 90))'}),
        ("Clothing with total amount over 4 million", {"query": "high value clothing", "filter": 'and(eq("label", "clothing"), gt("total_amount", 4000000))'}),
        ("Labels with avg weight over 5000 and total transactions over 60", {"query": "heavy high volume", "filter": 'and(gt("avg_weight", 5000), gt("total_transactions", 60))'}),

        # --- Examples with LIKE operator ---
        ("Products containing 'fab' in name", {"query": "products with fab", "filter": 'like("label", "fab")'}),
        ("Labels with 'cloth' in the name", {"query": "cloth related", "filter": 'like("label", "cloth")'}),

        # --- Complex examples ---
        ("High value fabric or clothing (over 4M)", {"query": "high value fabric clothing", "filter": 'and(or(eq("label", "fabric"), eq("label", "clothing")), gt("total_amount", 4000000))'}),
        ("Lightweight categories with high transaction count", {"query": "lightweight high volume", "filter": 'and(lt("avg_weight", 6000), gt("total_transactions", 65))'}),

        # --- General queries without filters ---
        ("What are the most profitable products?", {"query": "most profitable products highest total amount", "filter": None}),
        ("Summary of all trade data", {"query": "complete trade summary all categories", "filter": None}),
        ("Compare different product categories", {"query": "comparison of product categories", "filter": None}),
    ],
)
print("✅ Query constructor prompt created\n")


# --- Step 10: Initialize parser ---
print("🔧 Initializing structured query parser...")
parser_thuong_mai = StructuredQueryOutputParser.from_components(
    allowed_comparators=[
        Comparator.EQ,
        Comparator.LT,
        Comparator.LTE,
        Comparator.GT,
        Comparator.GTE,
        Comparator.LIKE,
    ],
    allowed_operators=[Operator.AND, Operator.OR],
)
print("✅ Parser initialized\n")


# --- Step 11: Combine prompt, LLM, and parser ---
print("⚙️  Creating query constructor chain...")
llm_constructor_thuong_mai = prompt_truy_van_thuong_mai | llm_query | parser_thuong_mai
print("✅ Query constructor chain created\n")


# --- Step 12: Create SelfQueryRetriever ---
print("🔍 Creating SelfQueryRetriever...")
base_retriever = SelfQueryRetriever(
    query_constructor=llm_constructor_thuong_mai,
    vectorstore=vectorstore,
    structured_query_translator=QdrantTranslator(metadata_key="metadata"),
    verbose=True,
    search_kwargs={"k": 5}
)


# --- Step 13: Create Smart Retriever Wrapper with LLM-based Superlative Detection ---
class SmartTradeRetriever:
    """
    Wrapper around SelfQueryRetriever that uses LLM to detect superlative queries
    (most, least, highest, lowest, top, bottom) and returns only the top result.
    """

    def __init__(self, base_retriever, llm=None):
        self.base_retriever = base_retriever
        self.llm = llm or ChatOpenAI(model="gpt-3.5-turbo", temperature=0)

    def _is_superlative_query(self, query: str) -> dict:
        """
        Use LLM to detect if query is asking for superlative (most/least/highest/lowest/top/bottom).
        Returns dict with 'is_superlative', 'direction', and 'metric'.
        """

        # Create a prompt to classify the query
        classification_prompt = f"""Analyze this trade data query and determine if it's asking for a superlative (most, least, highest, lowest, top, best, worst, etc.).

Available metrics for sorting:
- total_amount: Total trade value in USD
- avg_amount: Average value per transaction in USD
- total_transactions: Number of transactions
- total_weight: Total weight in kg
- avg_weight: Average weight per transaction in kg
- total_quantity: Total quantity of products
- avg_quantity: Average quantity per transaction

Query: "{query}"

CRITICAL DISTINCTION:
- COUNTING/FILTERING queries (how many, list all, show categories) → is_superlative: FALSE (return ALL matches)
- SUPERLATIVE queries (which ONE is best/top/most) → is_superlative: TRUE (return only top 1)

Instructions:
1. If asking for THE SINGLE best/worst/top/bottom/most/highest result → is_superlative: "true"
2. If asking "how many", "list", "show all", "which categories" (plural) → is_superlative: "false"
3. If asking about filtering/counting (">", "<", "more than", "less than") → is_superlative: "false"
4. Direction should be "desc" for most/highest/top/best or "asc" for least/lowest/bottom/worst

Examples - SUPERLATIVE (return top 1):
- "What products make the most money?" → is_superlative: true, metric: total_amount, direction: desc
- "Which category earns the highest revenue?" → is_superlative: true, metric: total_amount, direction: desc
- "Show me the top earner" → is_superlative: true, metric: total_amount, direction: desc
- "What's the least profitable category?" → is_superlative: true, metric: total_amount, direction: asc
- "Which has the most transactions?" → is_superlative: true, metric: total_transactions, direction: desc
- "Heaviest product category" → is_superlative: true, metric: total_weight, direction: desc

Examples - NOT SUPERLATIVE (return all matches):
- "How many categories have more than 50 transactions?" → is_superlative: false
- "Show categories with high transactions" → is_superlative: false
- "List products with total amount over 2 million" → is_superlative: false
- "Tell me about fabric" → is_superlative: false
- "Which categories have over 60 transactions?" → is_superlative: false (plural = multiple)

Respond ONLY with valid JSON in this exact format:
{{"is_superlative": "true" or "false", "metric": "metric_name", "direction": "desc" or "asc"}}"""

        try:
            response = self.llm.invoke(classification_prompt)
            result_text = response.content.strip()

            # Parse JSON response
            import json
            result = json.loads(result_text)

            # Convert string booleans to actual booleans
            is_superlative = result.get('is_superlative', 'false').lower() == 'true'

            return {
                'is_superlative': is_superlative,
                'metric': result.get('metric', 'total_amount'),
                'direction': result.get('direction', 'desc')
            }
        except Exception as e:
            # Fallback to non-superlative if LLM fails
            print(f"⚠️  LLM classification failed: {e}, defaulting to non-superlative")
            return {'is_superlative': False}

    def invoke(self, query: str):
        """
        Invoke retriever with smart handling of superlative queries.
        """
        superlative_info = self._is_superlative_query(query)

        # Get all results from base retriever
        results = self.base_retriever.invoke(query)

        if not results:
            return results

        # If it's a superlative query, return only the top result
        if superlative_info['is_superlative']:
            metric = superlative_info['metric']
            direction = superlative_info['direction']

            # Sort by the metric
            sorted_results = sorted(
                results,
                key=lambda doc: doc.metadata.get(metric, 0),
                reverse=(direction == 'desc')
            )

            # Return only the top result
            return [sorted_results[0]]

        # For non-superlative queries, return all results
        return results


# Create smart retriever with LLM-based classification
retriever_thuong_mai = SmartTradeRetriever(base_retriever, llm=llm_query)

input_file_supplier = "report_by_supplier.json"
print(f"📖 Loading supplier data from: {input_file_supplier}")

with open(input_file_supplier, 'r', encoding='utf-8') as f:
    supplier_reports = json.load(f)

print(f"✅ Loaded {len(supplier_reports)} supplier reports\n")

# --- Step 1: Normalize metadata for supplier data ---
def normalize_supplier_metadata(meta: dict):
    """Normalize supplier metadata keys"""
    rename_map = {
        "weight_sum": "total_weight",
        "weight_mean": "avg_weight",
        "qty_sum": "total_quantity",
        "qty_mean": "avg_quantity",
        "amount_sum": "total_amount",
        "amount_mean": "avg_amount"
    }
    new_meta = {}
    for k, v in meta.items():
        new_key = rename_map.get(k, k)
        new_meta[new_key] = v
    return new_meta

# --- Step 2: Create summaries for each supplier ---
def create_supplier_summary(report: dict) -> str:
    """Generate a natural language summary for each supplier"""
    supplier = report.get("Supplier", "Unknown")
    location=report.get("location", "Unknown")
    total_txn = report.get("total_transactions", 0)
    total_weight = report.get("weight_sum", 0)
    avg_weight = report.get("weight_mean", 0)
    total_qty = report.get("qty_sum", 0)
    avg_qty = report.get("qty_mean", 0)
    total_amount = report.get("amount_sum", 0)
    avg_amount = report.get("amount_mean", 0)

    summary = f"""
Trade Report Summary for Supplier: {supplier}

This supplier has completed {total_txn} transactions.

Weight Statistics:
- Total weight: {total_weight:,.2f} kg
- Average weight per transaction: {avg_weight:,.2f} kg

Quantity Statistics:
- Total quantity: {total_qty:,.2f} units
- Average quantity per transaction: {avg_qty:,.2f} units

Financial Statistics:
- Total trade amount: ${total_amount:,.2f} USD
- Average amount per transaction: ${avg_amount:,.2f} USD

Supplier Name: {supplier}
Transaction Volume: {total_txn} shipments
""".strip()

    return summary

# --- Step 3: Prepare documents with summaries and metadata ---
print("📝 Creating vector documents for suppliers...")
supplier_vector_docs = []

for report in supplier_reports:
    summary = create_supplier_summary(report)

    metadata = {
        "supplier": report["Supplier"],
        "location": report["location"],
        "total_transactions": report["total_transactions"],
        "weight_sum": report["weight_sum"],
        "weight_mean": report["weight_mean"],
        "qty_sum": report["qty_sum"],
        "qty_mean": report["qty_mean"],
        "amount_sum": report["amount_sum"],
        "amount_mean": report["amount_mean"],
        "source": "trade_report_by_supplier"
    }

    vector_doc = Document(
        page_content=summary,
        metadata=normalize_supplier_metadata(metadata)
    )
    supplier_vector_docs.append(vector_doc)

print(f"✅ Created {len(supplier_vector_docs)} vector documents\n")

# --- Step 4: Initialize embeddings (reuse if already initialized) ---
if 'embeddings' not in globals():
    print("🔤 Initializing embeddings...")
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    print("✅ Embeddings initialized\n")
else:
    print("✅ Using existing embeddings\n")

# --- Step 5: Create Qdrant vector store for suppliers ---
print("🗄️  Creating Qdrant vector store for suppliers...")
vectorstore_supplier = QdrantVectorStore.from_documents(
    documents=supplier_vector_docs,
    embedding=embeddings,
    collection_name="trade_supplier_reports",
    location=":memory:"
)
print(f"✅ Qdrant vector store created with {len(supplier_vector_docs)} supplier documents\n")

# --- Step 6: Define document description ---
mo_ta_bao_cao_supplier = """Báo cáo thương mại theo nhà cung cấp có cấu trúc như sau:
- SUPPLIER (nhà cung cấp): Tên nhà cung cấp
- LOCATION (vị trí): Vị trí nhà cung cấp
- TOTAL_TRANSACTIONS (số giao dịch): Tổng số lượng giao dịch
- TOTAL_WEIGHT (tổng trọng lượng): Tổng trọng lượng tính bằng kg
- AVG_WEIGHT (trọng lượng trung bình): Trọng lượng trung bình mỗi giao dịch (kg)
- TOTAL_QUANTITY (tổng số lượng): Tổng số lượng sản phẩm
- AVG_QUANTITY (số lượng trung bình): Số lượng trung bình mỗi giao dịch
- TOTAL_AMOUNT (tổng giá trị): Tổng giá trị giao dịch tính bằng USD
- AVG_AMOUNT (giá trị trung bình): Giá trị trung bình mỗi giao dịch (USD)

Khi tìm kiếm:
- Để lọc theo tên nhà cung cấp → dùng eq("supplier", "tên_nhà_cung_cấp") hoặc like("supplier", "từ_khóa")
- Để lọc theo vị trí nhà cung cấp → dùng eq("location", "vị_trí") hoặc like("location", "từ_khóa")
- Để tìm theo giá trị lớn hơn/nhỏ hơn → dùng gt/gte/lt/lte
- Để kết hợp nhiều điều kiện → dùng "and()" hoặc "or()"
"""

# --- Step 7: Define metadata fields for suppliers ---
supplier_metadata_fields = [
    AttributeInfo(
        name="supplier",
        description="Tên nhà cung cấp (ví dụ: Asia Pacific Textiles, Northern Thread Industries, Vietnam Textile Co Ltd, etc.)",
        type="string",
    ),
    AttributeInfo(
        name="location",
        description="Vị trí nhà cung cấp (ví dụ: Asia Pacific, Vietnam, etc.)",
        type="string",
    ),
    AttributeInfo(
        name="total_transactions",
        description="Tổng số giao dịch của nhà cung cấp",
        type="integer",
    ),
    AttributeInfo(
        name="total_weight",
        description="Tổng trọng lượng tất cả giao dịch (kg)",
        type="float",
    ),
    AttributeInfo(
        name="avg_weight",
        description="Trọng lượng trung bình mỗi giao dịch (kg)",
        type="float",
    ),
    AttributeInfo(
        name="total_quantity",
        description="Tổng số lượng sản phẩm",
        type="float",
    ),
    AttributeInfo(
        name="avg_quantity",
        description="Số lượng trung bình mỗi giao dịch",
        type="float",
    ),
    AttributeInfo(
        name="total_amount",
        description="Tổng giá trị giao dịch (USD)",
        type="float",
    ),
    AttributeInfo(
        name="avg_amount",
        description="Giá trị trung bình mỗi giao dịch (USD)",
        type="float",
    ),
]

# --- Step 8: Initialize LLM (reuse if exists) ---
if 'llm_query' not in globals():
    print("🤖 Initializing LLM...")
    llm_query = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)
    print("✅ LLM initialized\n")
else:
    print("✅ Using existing LLM\n")

# --- Step 9: Create query constructor prompt with supplier examples ---
print("📋 Creating query constructor prompt for suppliers...")
prompt_supplier = get_query_constructor_prompt(
    mo_ta_bao_cao_supplier,
    supplier_metadata_fields,
    allowed_comparators=[
        Comparator.EQ,
        Comparator.LT,
        Comparator.LTE,
        Comparator.GT,
        Comparator.GTE,
        Comparator.LIKE,
    ],
    allowed_operators=[Operator.AND, Operator.OR],
    examples=[
        ("Show me data for Asia Pacific Textiles", {"query": "Asia Pacific Textiles supplier data", "filter": 'eq("supplier", "Asia Pacific Textiles")'}),
         (
        "Show suppliers from Vietnam or China",
        {"query": "Vietnam China suppliers", "filter": 'or(eq("country", "Vietnam"), eq("country", "China"))'}
    ),
        (
        "High value suppliers in Singapore",
        {"query": "high value Singapore", "filter": 'and(eq("country", "Singapore"), gt("total_amount", 1000000))'}
    ),
        (
        "Find US suppliers with more than 50 transactions",
        {"query": "US high volume", "filter": 'and(eq("country", "US"), gt("total_transactions", 50))'}
    ),

        ("Get Northern Thread Industries report", {"query": "Northern Thread Industries", "filter": 'eq("supplier", "Northern Thread Industries")'}),
        ("Tell me about Vietnam Textile Co Ltd", {"query": "Vietnam Textile", "filter": 'like("supplier", "Vietnam Textile")'}),
        ("Suppliers with 'Fabric' in name", {"query": "fabric suppliers", "filter": 'like("supplier", "Fabric")'}),
        ("Show me all Vietnam suppliers", {"query": "Vietnam suppliers", "filter": 'like("supplier", "Vietnam")'}),
        ("Which suppliers have more than 20 transactions?", {"query": "high volume suppliers", "filter": 'gt("total_transactions", 20)'}),
        ("Suppliers with total amount over 2 million", {"query": "high value suppliers", "filter": 'gt("total_amount", 2000000)'}),
        ("Suppliers with average amount over 90000", {"query": "high average value suppliers", "filter": 'gt("avg_amount", 90000)'}),
        ("Find suppliers with less than 15 transactions", {"query": "low volume suppliers", "filter": 'lt("total_transactions", 15)'}),
        ("Suppliers with more than 20 transactions and total amount over 2M", {"query": "high volume high value", "filter": 'and(gt("total_transactions", 20), gt("total_amount", 2000000))'}),
        ("Vietnam suppliers with more than 15 transactions", {"query": "high volume vietnam", "filter": 'and(like("supplier", "Vietnam"), gt("total_transactions", 15))'}),
        ("Show Asia Pacific Textiles or Southern Fabric Co", {"query": "multiple suppliers", "filter": 'or(eq("supplier", "Asia Pacific Textiles"), eq("supplier", "Southern Fabric Co"))'}),
        ("Suppliers with less than 15 or more than 25 transactions", {"query": "extreme volumes", "filter": 'or(lt("total_transactions", 15), gt("total_transactions", 25))'}),
        ("Who are the top suppliers?", {"query": "top suppliers highest revenue", "filter": None}),
        ("Compare all suppliers", {"query": "supplier comparison all data", "filter": None}),
        ("What suppliers do we work with?", {"query": "all suppliers list", "filter": None}),
    ],
)
print("✅ Query constructor prompt created\n")

# --- Step 10: Initialize parser ---
print("🔧 Initializing structured query parser for suppliers...")
parser_supplier = StructuredQueryOutputParser.from_components(
    allowed_comparators=[
        Comparator.EQ,
        Comparator.LT,
        Comparator.LTE,
        Comparator.GT,
        Comparator.GTE,
        Comparator.LIKE,
    ],
    allowed_operators=[Operator.AND, Operator.OR],
)
print("✅ Parser initialized\n")

# --- Step 11: Combine prompt, LLM, and parser ---
print("⚙️  Creating query constructor chain for suppliers...")
llm_constructor_supplier = prompt_supplier | llm_query | parser_supplier
print("✅ Query constructor chain created\n")

# --- Step 12: Create SelfQueryRetriever for suppliers ---
print("🔍 Creating SelfQueryRetriever for suppliers...")
base_retriever_supplier = SelfQueryRetriever(
    query_constructor=llm_constructor_supplier,
    vectorstore=vectorstore_supplier,
    structured_query_translator=QdrantTranslator(metadata_key="metadata"),
    verbose=True,
    search_kwargs={"k": 5}
)

# --- Step 13: Create Smart Supplier Retriever ---
class SmartSupplierRetriever:
    """Smart retriever for supplier data with superlative detection"""

    def __init__(self, base_retriever, llm=None):
        self.base_retriever = base_retriever
        self.llm = llm or ChatOpenAI(model="gpt-3.5-turbo", temperature=0)

    def _is_superlative_query(self, query: str) -> dict:
        """Detect if query asks for superlative (top/best/worst/most/least)"""

        classification_prompt = f"""Analyze this supplier query and determine if it's asking for a superlative.

Available metrics:
- total_amount: Total trade value in USD
- avg_amount: Average value per transaction in USD
- total_transactions: Number of transactions
- total_weight: Total weight in kg
- avg_weight: Average weight per transaction in kg
- total_quantity: Total quantity of products
- avg_quantity: Average quantity per transaction

Query: "{query}"

CRITICAL DISTINCTION:
- COUNTING/FILTERING queries (how many, list all, show companies) → is_superlative: FALSE (return ALL matches)
- SUPERLATIVE queries (which ONE is best/top/most) → is_superlative: TRUE (return only top 1)

Instructions:
1. If asking for THE SINGLE best/worst/top/bottom/most/highest result → is_superlative: "true"
2. If asking "how many", "list", "show all", "which companies" (plural) → is_superlative: "false"
3. If asking about filtering/counting (">", "<", "more than", "less than") → is_superlative: "false"

Examples - SUPERLATIVE (return top 1):
- "Who is the top supplier?" → is_superlative: true, metric: total_amount, direction: desc
- "Which supplier has the most revenue?" → is_superlative: true, metric: total_amount, direction: desc
- "Which supplier has the most transactions?" → is_superlative: true, metric: total_transactions, direction: desc
- "Best performing supplier" → is_superlative: true, metric: total_amount, direction: desc

Examples - NOT SUPERLATIVE (return all matches):
- "How many suppliers have more than 20 transactions?" → is_superlative: false
- "How many companies have more than 200 transactions?" → is_superlative: false
- "List companies with high transactions" → is_superlative: false
- "Show all suppliers" → is_superlative: false
- "Which suppliers have over 100 transactions?" → is_superlative: false (plural = multiple)
- "Companies with high volume" → is_superlative: false

Respond ONLY with valid JSON:
{{"is_superlative": "true" or "false", "metric": "metric_name", "direction": "desc" or "asc"}}"""

        try:
            response = self.llm.invoke(classification_prompt)
            result_text = response.content.strip()
            import json
            result = json.loads(result_text)
            is_superlative = result.get('is_superlative', 'false').lower() == 'true'

            return {
                'is_superlative': is_superlative,
                'metric': result.get('metric', 'total_amount'),
                'direction': result.get('direction', 'desc')
            }
        except Exception as e:
            print(f"⚠️  Classification failed: {e}, defaulting to non-superlative")
            return {'is_superlative': False}

    def invoke(self, query: str):
        """Invoke retriever with smart superlative handling"""
        superlative_info = self._is_superlative_query(query)
        results = self.base_retriever.invoke(query)

        if not results:
            return results

        if superlative_info['is_superlative']:
            metric = superlative_info['metric']
            direction = superlative_info['direction']
            sorted_results = sorted(
                results,
                key=lambda doc: doc.metadata.get(metric, 0),
                reverse=(direction == 'desc')
            )
            return [sorted_results[0]]

        return results

# Create smart supplier retriever
retriever_supplier = SmartSupplierRetriever(base_retriever_supplier, llm=llm_query)

class EnhancedImprovedState(TypedDict):
    messages: Annotated[list, add]
    user_input: str
    rewritten_query: str  # NEW: Stores the context-aware rewritten query
    query_type: str  # "label", "supplier", or "general"
    relevant_memories: list[dict]
    product_context: str
    response: str
    memories_to_save: list[dict]


# =============================================================================
# ENHANCED ASSISTANT WITH QUERY REWRITING
# =============================================================================
class TradeSearchAgent:
    """
    Enhanced assistant with QUERY REWRITING and CLEAR ROUTING:
    - Query Rewriting → Handles ambiguous references using conversation history
    - Label queries → Label retriever
    - Supplier queries → Supplier retriever
    - General chat → Memory retrieval
    """

    def __init__(self, label_retriever, supplier_retriever):
        self.llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.7)
        self.embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

        # Store BOTH retrievers
        self.label_retriever = label_retriever
        self.supplier_retriever = supplier_retriever

        # Shared memory store
        self.store = InMemoryStore(
            index={
                "embed": self.embeddings,
                "dims": 1536,
                "fields": ["text"]
            }
        )

        self.checkpointer = MemorySaver()
        self.graph = self._build_graph()

    def _build_graph(self):

        # =================================================================
        # NEW NODE: Rewrite Query (FIRST STEP - BEFORE ROUTING)
        # =================================================================
        def rewrite_query(state: EnhancedImprovedState) -> dict:
            """
            Rewrite ambiguous queries using conversation history.
            Handles pronouns and references like "these", "that", "them", "it"
            """
            user_input = state["user_input"]
            messages = state.get("messages", [])

            # Build conversation history context
            conversation_context = ""
            if messages:
                # Get last 3 exchanges (6 messages) for context
                recent_messages = messages[-6:] if len(messages) > 6 else messages
                conversation_lines = []
                for msg in recent_messages:
                    role = "USER" if isinstance(msg, HumanMessage) else "ASSISTANT"
                    conversation_lines.append(f"{role}: {msg.content}")
                conversation_context = "\n".join(conversation_lines)

            # Check if query needs rewriting
            # ambiguous_words = ["these", "that", "those", "them", "it", "they", "this"]
            #                 #  "the company", "the companies", "the supplier", "the suppliers",
            #                 #  "the product", "the products", "the category", "the categories"]

            # needs_rewriting = any(word in user_input.lower() for word in ambiguous_words)
            ambiguous_words = ["these", "that", "those", "them", "it", "they", "this"]


            pattern = r'\b(' + '|'.join(ambiguous_words) + r')\b'
            match = re.search(pattern, user_input.lower())

            needs_rewriting = bool(match)

            if not needs_rewriting or not conversation_context:
                # No rewriting needed
                print(f"\n[QUERY REWRITING] No rewriting needed")
                print(f"   Original query: {user_input}")
                return {"rewritten_query": user_input}

            # Use LLM to rewrite query
            rewrite_prompt = f"""You are a query rewriting assistant. Rewrite ambiguous user queries to be self-contained and clear by incorporating context from the conversation history.

CONVERSATION HISTORY:
{conversation_context}

CURRENT QUERY (potentially ambiguous):
{user_input}

INSTRUCTIONS:
1. If the query contains pronouns or references (these, that, them, it, they, etc.), replace them with specific entities from the conversation history
2. Make the query self-contained so it can be understood without context
3. Keep the query concise and natural
4. If the query is already clear, return it unchanged
5. Focus on maintaining the user's intent while adding necessary context

EXAMPLES:

Example 1:
HISTORY:
USER: How many companies have more than 20 transactions?
ASSISTANT: There are three companies: Southern Fabric Co, Northern Thread Industries, and Saigon Fabric Industries.
CURRENT: What are these company names?
REWRITTEN: What are the names of companies with more than 20 transactions?

Example 2:
HISTORY:
USER: Show me fabric data.
ASSISTANT: Here is the fabric transaction data...
CURRENT: Tell me more about it
REWRITTEN: Tell me more about fabric transaction data

Example 3:
HISTORY:
USER: Who is the top supplier?
ASSISTANT: Northern Thread Industries is the top supplier.
CURRENT: What are their total transactions?
REWRITTEN: What are the total transactions for Northern Thread Industries?

Example 4:
CURRENT: How many suppliers are there in total?
REWRITTEN: How many suppliers are there in total?
(No rewriting needed - query is already clear)

Now rewrite this query. Respond with ONLY the rewritten query, nothing else:"""

            response = self.llm.invoke([HumanMessage(content=rewrite_prompt)])
            rewritten_query = response.content.strip()

            print(f"\n[QUERY REWRITING] Rewritten ambiguous query")
            print(f"   Original: {user_input}")
            print(f"   Rewritten: {rewritten_query}")

            return {"rewritten_query": rewritten_query}

        # =================================================================
        # NODE: Route Query Type (AFTER REWRITING)
        # =================================================================
        def route_query_type(state: EnhancedImprovedState) -> dict:
            """
            Determine if query is about:
            - LABEL (product categories: fabric, clothing, fiber, filament)
            - SUPPLIER (companies: Asia Pacific, Northern Thread, etc.)
            - GENERAL (personal questions, greetings)

            NOW USES REWRITTEN QUERY for better classification
            """
            # Use REWRITTEN query for classification
            query = state["rewritten_query"]

            prompt = f"""Analyze this query and classify it into ONE category:

CATEGORIES:
1. "label" - Questions about PRODUCT CATEGORIES or TYPES:
   - fabric, clothing, fiber, filament, apparel, textiles
   - product categories, product types
   - "most profitable product", "clothing transactions", "fabric data"

2. "supplier" - Questions about SUPPLIERS or COMPANIES:
   - Specific company names (Asia Pacific Textiles, Northern Thread Industries, Vietnam Textile Co Ltd, etc.)
   - "suppliers", "vendor", "manufacturer", "company"
   - "top supplier", "which supplier", "supplier with most transactions"
   - Any company or supplier-related queries

3. "general" - PERSONAL or NON-DATA questions:
   - Greetings, personal info, user questions
   - "my name", "what do I do", "hello", "who am I"

Query: "{query}"

IMPORTANT EXAMPLES:
- "What is the most profitable product category?" → label
- "Show me fabric data" → label
- "Clothing transactions" → label
- "Who is the top supplier?" → supplier
- "Tell me about Northern Thread Industries" → supplier
- "Vietnam suppliers with high transactions" → supplier
- "Companies with more than 20 transactions" → supplier
- "What is my name?" → general
- "Hi, I'm Sarah" → general

Respond with ONLY ONE WORD: label, supplier, or general"""

            response = self.llm.invoke(prompt)
            query_type = response.content.strip().lower()

            # Validation
            if query_type not in ["label", "supplier", "general"]:
                query_type = "general"

            print(f"\n[ROUTING] Query classified as: {query_type.upper()}")
            return {"query_type": query_type}

        # =================================================================
        # NODE: Retrieve LABEL Data (USES REWRITTEN QUERY)
        # =================================================================
        def retrieve_label_data(state: EnhancedImprovedState) -> dict:
            """Retrieve data from LABEL retriever (product categories)"""
            # Use REWRITTEN query for retrieval
            query = state["rewritten_query"]
            print(f"\n[LABEL RETRIEVER] Searching for: {query}")

            try:
                results = self.label_retriever.invoke(query)

                if not results:
                    return {"product_context": "No relevant label/category data found."}

                context_parts = []
                for i, doc in enumerate(results, 1):
                    context_parts.append(f"Result {i}:\n{doc.page_content}")

                context = "\n\n".join(context_parts)
                print(f"   → Found {len(results)} label results")
                return {"product_context": context}

            except Exception as e:
                print(f"   → Error: {e}")
                return {"product_context": f"Error retrieving label data: {str(e)}"}

        # =================================================================
        # NODE: Retrieve SUPPLIER Data (USES REWRITTEN QUERY)
        # =================================================================
        def retrieve_supplier_data(state: EnhancedImprovedState) -> dict:
            """Retrieve data from SUPPLIER retriever (companies)"""
            # Use REWRITTEN query for retrieval
            query = state["rewritten_query"]
            print(f"\n[SUPPLIER RETRIEVER] Searching for: {query}")

            try:
                results = self.supplier_retriever.invoke(query)

                if not results:
                    return {"product_context": "No relevant supplier data found."}

                context_parts = []
                for i, doc in enumerate(results, 1):
                    context_parts.append(f"Result {i}:\n{doc.page_content}")

                context = "\n\n".join(context_parts)
                print(f"   → Found {len(results)} supplier results")
                return {"product_context": context}

            except Exception as e:
                print(f"   → Error: {e}")
                return {"product_context": f"Error retrieving supplier data: {str(e)}"}

        # =================================================================
        # NODE: Generate Data Response (for both label and supplier)
        # =================================================================
        def generate_data_response(state: EnhancedImprovedState) -> dict:
            """Generate response using retrieved data context"""
            # Use ORIGINAL user input for response to maintain natural flow
            user_input = state["user_input"]
            rewritten_query = state["rewritten_query"]
            context = state.get("product_context", "")
            query_type = state.get("query_type", "")

            prompt = f"""You are a helpful trade data assistant. Answer the user's question based ONLY on the provided data.

DATA TYPE: {query_type.upper()}
DATA CONTEXT:
{context}

USER QUESTION: {user_input}
(For context, this was interpreted as: {rewritten_query})

Provide a clear, concise answer. If the data doesn't contain the answer, say so politely."""

            response = self.llm.invoke([HumanMessage(content=prompt)])
            print(f"\n[Data Response] Generated {query_type} answer")

            return {
                "response": response.content,
                "messages": [
                    HumanMessage(content=user_input),
                    AIMessage(content=response.content)
                ]
            }

        # =================================================================
        # NODE: Retrieve Memories (USES REWRITTEN QUERY)
        # =================================================================
        def retrieve_memories(state: EnhancedImprovedState, config: RunnableConfig, *, store: BaseStore) -> dict:
            user_id = config["configurable"].get("user_id", "default")
            namespace = (user_id, "memories")
            # Use REWRITTEN query for memory search
            query = state["rewritten_query"]

            results = store.search(namespace, query=query, limit=5)

            memories = []
            print(f"\n[Memory Retrieval Debug] Raw search results:")
            for r in results:
                score = getattr(r, "score", 0)
                memory_text = r.value["text"]
                print(f"   → Score: {score:.4f} | Memory: '{memory_text}'")
                if score > 0.2:
                    memories.append({"text": memory_text, "score": score})

            print(f"\n[Memory Retrieval] Found {len(memories)} relevant memories")
            return {"relevant_memories": memories}

        # =================================================================
        # NODE: Generate General Response
        # =================================================================
        def generate_general_response(state: EnhancedImprovedState) -> dict:
            user_input = state["user_input"]
            memories = state.get("relevant_memories", [])

            memory_context = ""
            if memories:
                memory_lines = [f"- {m['text']}" for m in memories]
                memory_context = "What I remember about this user:\n" + "\n".join(memory_lines)
                print(f"\n[Response Generation Debug] Using memory context:")
                print(memory_context)

            system_prompt = f"""You are a helpful personal assistant with memory.
{memory_context}
Be helpful, friendly, and personalize your response."""

            response = self.llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_input)
            ])
            print(f"\n[General Response] Generated answer")

            return {
                "response": response.content,
                "messages": [
                    HumanMessage(content=user_input),
                    AIMessage(content=response.content)
                ]
            }

        # =================================================================
        # NODE: Analyze for Memories
        # =================================================================
        def analyze_for_memories(state: EnhancedImprovedState) -> dict:
            user_input = state["user_input"]
            response = state.get("response", "")

            analysis_prompt = f"""Analyze this conversation for NEW PERSONAL information about the user.
Extract COMPLETE statements that can stand alone as facts.

USER: {user_input}
AI: {response}

RULES:
- Store COMPLETE facts like "User's name is Sarah" NOT just "Sarah"
- Store COMPLETE facts like "User works as a data analyst" NOT just "data analyst"
- Store personal preferences, job, name, location, hobbies, etc.
- Ignore product/trade data queries unless stating a personal preference
- Each memory should be a complete sentence that makes sense on its own

FORMAT (one per line):
MEMORY: [complete fact statement] | CATEGORY: [category]

If no new personal information, respond with:
NO_NEW_MEMORIES

Examples:
USER: "I'm John and I work as a teacher"
MEMORY: User's name is John | CATEGORY: name
MEMORY: User works as a teacher | CATEGORY: job

USER: "Show me fabric data"
NO_NEW_MEMORIES"""

            result = self.llm.invoke([HumanMessage(content=analysis_prompt)])
            content = result.content.strip()

            print(f"\n[Memory Analysis Debug] LLM output:")
            print(f"   {content}")

            memories_to_save = []
            if "NO_NEW_MEMORIES" not in content:
                lines = content.split("\n")
                for line in lines:
                    if line.startswith("MEMORY:"):
                        parts = line.split("| CATEGORY:")
                        if len(parts) == 2:
                            memory_text = parts[0].replace("MEMORY:", "").strip()
                            category = parts[1].strip().lower()
                            memories_to_save.append({
                                "text": memory_text,
                                "category": category
                            })
                            print(f"   → Extracted: '{memory_text}' (category: {category})")

            if memories_to_save:
                print(f"\n[Memory Analysis] Found {len(memories_to_save)} new memories to save")
            else:
                print(f"\n[Memory Analysis] No new memories to save")
            return {"memories_to_save": memories_to_save}

        # =================================================================
        # NODE: Save Memories
        # =================================================================
        def save_memories(state: EnhancedImprovedState, config: RunnableConfig, *, store: BaseStore) -> dict:
            memories = state.get("memories_to_save", [])
            if not memories: return {}

            user_id = config["configurable"].get("user_id", "default")
            namespace = (user_id, "memories")

            print(f"\n[Memory Storage Debug] Saving {len(memories)} memories:")
            for mem in memories:
                mem_id = str(uuid.uuid4())
                store.put(namespace, mem_id, mem)
                print(f"   ✓ Saved (ID: {mem_id[:8]}...): '{mem['text']}' [category: {mem['category']}]")
            return {}

        # =================================================================
        # ROUTING LOGIC
        # =================================================================
        def route_by_type(state: EnhancedImprovedState) -> Literal["retrieve_label_data", "retrieve_supplier_data", "retrieve_memories"]:
            """Route to appropriate retriever based on query_type"""
            query_type = state.get("query_type", "general")

            if query_type == "label":
                return "retrieve_label_data"
            elif query_type == "supplier":
                return "retrieve_supplier_data"
            else:
                return "retrieve_memories"

        def should_save(state: EnhancedImprovedState) -> Literal["save_memories", "end"]:
            if state.get("memories_to_save"):
                return "save_memories"
            return "end"

        # =================================================================
        # BUILD ENHANCED GRAPH WITH QUERY REWRITING
        # =================================================================
        workflow = StateGraph(EnhancedImprovedState)

        # Add all nodes
        workflow.add_node("rewrite_query", rewrite_query)  # NEW: Query rewriting node
        workflow.add_node("route_query_type", route_query_type)
        workflow.add_node("retrieve_label_data", retrieve_label_data)
        workflow.add_node("retrieve_supplier_data", retrieve_supplier_data)
        workflow.add_node("generate_data_response", generate_data_response)
        workflow.add_node("retrieve_memories", retrieve_memories)
        workflow.add_node("generate_general_response", generate_general_response)
        workflow.add_node("analyze_for_memories", analyze_for_memories)
        workflow.add_node("save_memories", save_memories)

        # NEW WORKFLOW:
        # START → Rewrite Query → Route Query Type → Retrieve → Generate → Analyze → Save
        workflow.add_edge(START, "rewrite_query")  # NEW: Rewriting first
        workflow.add_edge("rewrite_query", "route_query_type")  # Then routing

        # Route to appropriate retriever
        workflow.add_conditional_edges(
            "route_query_type",
            route_by_type,
            {
                "retrieve_label_data": "retrieve_label_data",
                "retrieve_supplier_data": "retrieve_supplier_data",
                "retrieve_memories": "retrieve_memories"
            }
        )

        # Label path: retrieve → generate response
        workflow.add_edge("retrieve_label_data", "generate_data_response")

        # Supplier path: retrieve → generate response
        workflow.add_edge("retrieve_supplier_data", "generate_data_response")

        # Both data paths converge to memory analysis
        workflow.add_edge("generate_data_response", "analyze_for_memories")

        # General path: retrieve memories → generate response → analyze
        workflow.add_edge("retrieve_memories", "generate_general_response")
        workflow.add_edge("generate_general_response", "analyze_for_memories")

        # Memory saving decision
        workflow.add_conditional_edges(
            "analyze_for_memories",
            should_save,
            {
                "save_memories": "save_memories",
                "end": END
            }
        )

        workflow.add_edge("save_memories", END)

        return workflow.compile(checkpointer=self.checkpointer, store=self.store)

    def run_chat(self, user_input: str, thread_id: str):
        config = {"configurable": {"user_id": "user_ui", "thread_id": thread_id}}

        initial_state = {
            "user_input": user_input,
            "rewritten_query": "",
            "messages": [],
            "relevant_memories": [],
            "memories_to_save": [],
            "product_context": "",
            "query_type": "",
            "response": ""
        }

        result = self.graph.invoke(initial_state, config)
        return result["response"]


