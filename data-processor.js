// Data Processor for Analytics Dashboard
// Handles loading and processing Excel data for charts

class DataProcessor {
    constructor() {
        this.tradeData = [];
        this.companyData = [];
        this.companyInfo = [];
        this.companySummary = []; // New array for summary data
        this.selectedCompany = null;
    }

    // Load Excel files using SheetJS
    async loadData() {
        try {
            console.log('📂 Loading data from Excel...');

            // 1. Load Daily Transactions (For Overview)
            // Fetch the file
            const response = await fetch('company_analytics_report_2024.xlsx');
            const arrayBuffer = await response.arrayBuffer();

            // Parse using SheetJS
            const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

            const dailySheet = workbook.Sheets['Daily Transactions'];
            if (dailySheet) {
                this.dailyData = XLSX.utils.sheet_to_json(dailySheet);
                console.log(`✅ Loaded ${this.dailyData.length} daily records`);
            } else {
                console.warn('⚠️ Daily Transactions sheet not found');
                this.dailyData = [];
            }

            // 2. Load Executive Summary & Monthly Trends (For Insight/Dashboard)
            const summarySheet = workbook.Sheets['Executive Summary'];
            if (summarySheet) {
                this.companyData = XLSX.utils.sheet_to_json(summarySheet);
            }

            const monthlySheet = workbook.Sheets['Monthly Trends'];
            if (monthlySheet) {
                this.monthlyTrends = XLSX.utils.sheet_to_json(monthlySheet);
            }

            // 3. Load Trade Data Expanded (For Insight/Dashboard) - If needed
            try {
                const tradeResponse = await fetch('trade_data_expanded.xlsx');
                const tradeBuffer = await tradeResponse.arrayBuffer();
                const tradeWorkbook = XLSX.read(tradeBuffer, { type: 'array' });
                const tradeSheet = tradeWorkbook.Sheets[tradeWorkbook.SheetNames[0]];
                this.tradeData = XLSX.utils.sheet_to_json(tradeSheet);
            } catch (e) {
                console.warn('Could not load trade_data_expanded.xlsx', e);
                this.tradeData = [];
            }

            // 4. Load Company Info Detailed (For Insight/Dashboard)
            try {
                const infoResponse = await fetch('company_information_detailed.xlsx');
                const infoBuffer = await infoResponse.arrayBuffer();
                const infoWorkbook = XLSX.read(infoBuffer, { type: 'array' });
                const infoSheet = infoWorkbook.Sheets[infoWorkbook.SheetNames[0]];
                this.companyInfo = XLSX.utils.sheet_to_json(infoSheet);
            } catch (e) {
                console.warn('Could not load company_information_detailed.xlsx', e);
                this.companyInfo = [];
            }

            // 5. Load Company Summary (For Recommendations)
            const compSummarySheet = workbook.Sheets['Company Summary'];
            if (compSummarySheet) {
                this.companySummary = XLSX.utils.sheet_to_json(compSummarySheet);
                console.log(`✅ Loaded ${this.companySummary.length} company summaries`);
            } else {
                console.warn('⚠️ Company Summary sheet not found');
            }

            // Process Lists
            this.processCompanyList();

            console.log('✅ All Data loaded successfully');
            return true;
        } catch (error) {
            console.error('Error loading data:', error);
            return false;
        }
    }

    processCompanyList() {
        // Ensure companyData is populated
        if (!this.companyData || this.companyData.length === 0) {
            console.warn('No company data to process');
            return;
        }

        // Data is already loaded, nothing complex needed here
        // Dashboard controller pulls via getCompanyList()
    }

    getDailyData() {
        return this.dailyData || [];
    }

    // Filter helpers
    getUniqueValues(field, data = this.dailyData) {
        return [...new Set(data.map(item => item[field]).filter(Boolean))].sort();
    }

    // Cascading filter helpers
    filterData(filters = {}) {
        let filtered = this.dailyData || [];

        if (filters.hsCodes && filters.hsCodes.length > 0) {
            filtered = filtered.filter(item => filters.hsCodes.includes(String(item.HS_Code)));
        }

        if (filters.categories && filters.categories.length > 0) {
            filtered = filtered.filter(item => filters.categories.includes(item.Category));
        }

        if (filters.products && filters.products.length > 0) {
            filtered = filtered.filter(item => filters.products.includes(item.Product));
        }

        return filtered;
    }

    // Get list of all companies
    getCompanyList() {
        return this.companyData.map(c => c.Supplier).sort();
    }

    // Set selected company
    setSelectedCompany(companyName) {
        this.selectedCompany = companyName;
    }

    // Get company summary data
    getCompanySummaryRaw() {
        return this.companySummary;
    }

    // Get company summary data
    processCompanySummary() {
        if (!this.selectedCompany) return null;

        const summary = this.companyData.find(c => c.Buyer === this.selectedCompany || c.Supplier === this.selectedCompany);
        // Fallback for dual support (if Overview uses Supplier and Copilot uses Buyer)
        if (!summary) return null;
        const info = this.companyInfo.find(c => c['Company Name'] === this.selectedCompany);

        return {
            ...summary,
            ...info
        };
    }

    // Get time series data for line chart (dual y-axis) from Monthly Trends sheet
    getTimeSeriesData(companyName = this.selectedCompany) {
        if (!companyName) return null;

        // Filter monthly trends data for selected company
        // Filter monthly trends: Note - Monthly Trends is often aggregated by Supplier. 
        // If we switched recommendation to Buyer, we should check if Monthly Trend data supports Buyer.
        // Assuming Monthly Trends needs to be calculated from raw Trade Data for the Buyer if not pre-aggregated.
        // Since we don't have a 'Monthly Trends' sheet for Buyers, we should calculate it on the fly from tradeData
        // WHERE Buyer == companyName
        // Use dailyData (Daily Transactions) instead of tradeData
        const companyTrades = this.dailyData.filter(t => t.Buyer === companyName || t.Supplier === companyName);

        // Aggregate by month locally
        const months = {};
        companyTrades.forEach(d => {
            if (!d.Date_Trade) return;
            const date = new Date(d.Date_Trade);
            const mKey = date.getMonth(); // 0-11
            if (!months[mKey]) months[mKey] = { revenue: 0, transactions: 0 };
            months[mKey].revenue += d.Total_Price || 0;
            months[mKey].transactions += 1;
        });

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const labels = monthNames; // Shows full year or just active months? Let's show full year 0-11
        const revenue = [];
        const transactions = [];

        for (let i = 0; i < 12; i++) {
            revenue.push(months[i] ? months[i].revenue : 0);
            transactions.push(months[i] ? months[i].transactions : 0);
        }

        return { labels, revenue, transactions };
    }

    // Get category distribution for pie chart
    getCategoryDistribution(companyName = this.selectedCompany) {
        if (!companyName) return null;

        const companyTrades = this.dailyData.filter(t => t.Buyer === companyName || t.Supplier === companyName);

        const categories = {
            'Fabric': 0,
            'Clothing': 0,
            'Fiber': 0,
            'Filament': 0
        };

        companyTrades.forEach(trade => {
            // 'Category' column in Daily Transactions
            const label = trade.Category || trade.label;
            if (categories.hasOwnProperty(label)) {
                categories[label] += trade.Total_Price || trade.amount || 0;
            }
        });

        return {
            labels: Object.keys(categories),
            values: Object.values(categories)
        };
    }

    // Get top 10 products for a specific category
    getTop10ProductsByCategory(category) {
        if (!this.selectedCompany) return null;

        const companyTrades = this.tradeData.filter(t =>
            t.Supplier === this.selectedCompany && t.label === category
        );

        // Aggregate by product
        const productData = {};
        companyTrades.forEach(trade => {
            const product = trade.Product;
            if (!productData[product]) {
                productData[product] = {
                    revenue: 0,
                    volume: 0
                };
            }
            productData[product].revenue += trade.amount || 0;
            productData[product].volume += trade.qty || 0;
        });

        // Convert to array and sort by revenue
        const products = Object.entries(productData)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            labels: products.map(p => p.name),
            revenue: products.map(p => p.revenue),
            volume: products.map(p => p.volume)
        };
    }

    // Get top 10 products overall
    getTop10Products(companyName = this.selectedCompany) {
        if (!companyName) return null;

        // Deprecated for Copilot? Or used for dashboard?
        // If for Copilot (Buyer), we want Top Suppliers.
        // If for Dashboard (Supplier), we want Top Products.
        // Let's keep this as 'Top Products' for consistency but filter by Buyer for Copilot usage
        const companyTrades = this.dailyData.filter(t => t.Buyer === companyName || t.Supplier === companyName);

        // Aggregate by product
        const productData = {};
        companyTrades.forEach(trade => {
            // Check 'Product' or 'Products' or 'product'
            const product = trade.Product || trade.Products || trade.product;
            if (!product) return;

            if (!productData[product]) {
                productData[product] = {
                    revenue: 0,
                    volume: 0
                };
            }
            productData[product].revenue += trade.Total_Price || trade.amount || 0;
            productData[product].volume += trade.Total_Amount || trade.qty || 0; // Qty
        });

        // Convert to array and sort by revenue
        const products = Object.entries(productData)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            labels: products.map(p => p.name),
            revenue: products.map(p => p.revenue),
            volume: products.map(p => p.volume)
        };
    }

    // NEW: Get Top Suppliers for a Buyer (3rd graph in Agent Logic)
    getTopSuppliers(buyerName, categoryFilter = 'General') {
        let trades = this.dailyData.filter(t => t.Buyer === buyerName);

        if (categoryFilter !== 'General') {
            trades = trades.filter(t => t.Category === categoryFilter);
        }

        const suppliers = {};
        trades.forEach(t => {
            const s = t.Supplier;
            if (!suppliers[s]) suppliers[s] = { revenue: 0, volume: 0 };
            suppliers[s].revenue += t.Total_Price || 0;
            suppliers[s].volume += t.Total_Amount || 0;
        });

        const sorted = Object.entries(suppliers)
            .map(([name, d]) => ({ name, ...d }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 3); // Top 3 as per logic

        return {
            labels: sorted.map(d => d.name),
            revenue: sorted.map(d => d.revenue),
            volume: sorted.map(d => d.volume)
        };
    }

    monthNameToIndex(monthName) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        // Handle full names or short names
        const idx = months.findIndex(m => monthName.startsWith(m));
        return idx !== -1 ? idx : 0; // Default to Jan if not found
    }
}

// Export singleton instance
const dataProcessor = new DataProcessor();
