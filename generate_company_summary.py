import pandas as pd
import numpy as np

INPUT_FILE = 'company_analytics_report_2024.xlsx'
OUTPUT_SHEET = 'Company Summary'
DATA_SHEET = 'Daily Transactions'

def generate_company_summary():
    print(f"Loading {INPUT_FILE} - Sheet: {DATA_SHEET}...")
    try:
        df = pd.read_excel(INPUT_FILE, sheet_name=DATA_SHEET)
    except Exception as e:
        print(f"Error loading file: {e}")
        return

    if df.empty:
        print("Data is empty.")
        return

    print("Data loaded. Processing...")

    # 1. Base Aggregation: Total Revenue and Total Amount per Company
    # Group by Buyer
    company_stats = df.groupby('Buyer').agg({
        'Total_Price': 'sum',
        'Total_Amount': 'sum',
        'Country_Buyer': 'first' # Take the first country as location
    }).rename(columns={'Total_Price': 'Total_Revenue', 'Country_Buyer': 'Location'}).reset_index()

    # 2. Scale Logic: Big/Small based on Median Revenue
    median_revenue = company_stats['Total_Revenue'].median()
    print(f"Median Revenue: ${median_revenue:,.2f}")
    
    company_stats['Scale'] = company_stats['Total_Revenue'].apply(
        lambda x: 'Big' if x > median_revenue else 'Small'
    )

    # 3. Category Flags
    # Create pivot table for presence of categories
    # 1 if category exists for buyer, else 0
    cat_flags = pd.crosstab(df['Buyer'], df['Category'])
    
    # Rename columns to matches requirements: is_fabric, is_clothing, is_fiber, is_filament
    # Ensure all expected columns exist even if data is missing some categories
    expected_cats = ['Fabric', 'Clothing', 'Fiber', 'Filament']
    for cat in expected_cats:
        if cat not in cat_flags.columns:
            cat_flags[cat] = 0
            
    # Rename to desired format (lowercase with is_ prefix)
    rename_map = {cat: f'is_{cat.lower()}' for cat in expected_cats}
    cat_flags = cat_flags.rename(columns=rename_map)
    
    # Convert counts to 0/1 boolean-like integers
    cat_flags = (cat_flags > 0).astype(int)
    
    # Reset index to merge
    cat_flags = cat_flags.reset_index()

    # 4. Best Category Logic
    # Calculate revenue per category per buyer
    cat_revenues = df.groupby(['Buyer', 'Category']).agg({
        'Total_Price': 'sum',
        'Total_Amount': 'sum'
    }).reset_index()
    
    # Sort by Buyer and Revenue (descending), then Amount (descending) as tiebreaker
    cat_revenues = cat_revenues.sort_values(
        by=['Buyer', 'Total_Price', 'Total_Amount'], 
        ascending=[True, False, False]
    )
    
    # Take the top one for each buyer
    best_cats = cat_revenues.groupby('Buyer').first().reset_index()
    best_cats = best_cats[['Buyer', 'Category']].rename(columns={'Category': 'best_category'})

    # 5. Merge Process
    final_df = company_stats.merge(cat_flags, on='Buyer', how='left')
    final_df = final_df.merge(best_cats, on='Buyer', how='left')

    # Reorder columns for clarity (optional, but good for UX)
    # Expected: Buyer, Location, Total_Revenue, Total_Amount, Scale, is_... columns, best_category
    cols = ['Buyer', 'Location', 'Total_Revenue', 'Total_Amount', 'Scale'] + \
           [f'is_{c.lower()}' for c in expected_cats] + ['best_category']
    
    # Filter only existing columns just in case
    cols = [c for c in cols if c in final_df.columns]
    final_df = final_df[cols]

    print("Head of generated summary:")
    print(final_df.head())

    # 6. Save to Excel
    print(f"Saving to {INPUT_FILE} in sheet '{OUTPUT_SHEET}'...")
    try:
        with pd.ExcelWriter(INPUT_FILE, engine='openpyxl', mode='a', if_sheet_exists='replace') as writer:
            final_df.to_excel(writer, sheet_name=OUTPUT_SHEET, index=False)
        print("Success! Company Summary sheet created.")
    except Exception as e:
        print(f"Error saving to Excel: {e}")

if __name__ == "__main__":
    generate_company_summary()
