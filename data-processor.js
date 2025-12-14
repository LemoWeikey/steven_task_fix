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
        // Helper to update loading text
        const updateStatus = (msg) => {
            console.log(msg);
            const el = document.querySelector('#loadingState p');
            if (el) el.textContent = msg;
        };

        try {
            updateStatus('📂 Loading data from Excel...');

            // 1. Load Daily Transactions (Source: steven_data_5301.csv)
            let dataString;
            if (window.INJECTED_CSV_DATA) {
                updateStatus('📂 Processing injected CSV data...');
                dataString = window.INJECTED_CSV_DATA;
            } else {
                updateStatus('🌐 Fetching CSV file...');
                // Fetch the file
                const response = await fetch('steven_data_5301.csv');
                if (!response.ok) throw new Error(`CSV Fetch failed: ${response.status}`);
                dataString = await response.text();
            }

            if (!dataString) throw new Error("Data string is empty");

            // Parse CSV directly (Simpler/Faster for CSV) or use SheetJS if preferred. 
            // Using SheetJS for consistency with previous code structure.
            updateStatus('📊 Parsing workbook...');
            const workbook = XLSX.read(dataString, { type: 'string', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const dailySheet = workbook.Sheets[sheetName];

            if (dailySheet) {
                const rawData = XLSX.utils.sheet_to_json(dailySheet);
                console.log(`✅ Loaded ${rawData.length} raw records from ${sheetName}`);
                updateStatus(`✅ Processing ${rawData.length} records...`);

                // Calculate Medians for Scale Logic (Big/Small)
                // Filter out invalid numbers first
                const revenues = rawData.map(d => parseFloat(d.value_usd)).filter(n => !isNaN(n)).sort((a, b) => a - b);
                const volumes = rawData.map(d => parseFloat(d.quantity)).filter(n => !isNaN(n)).sort((a, b) => a - b);

                const getMedian = (arr) => {
                    if (arr.length === 0) return 0;
                    const mid = Math.floor(arr.length / 2);
                    return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
                };

                const medianRevenue = getMedian(revenues);
                const medianVolume = getMedian(volumes);
                console.log(`📊 Global Medians - Revenue: $${medianRevenue}, Volume: ${medianVolume}`);

                // Process and Map Data
                this.dailyData = rawData.map(item => this.mapStevenData(item, medianRevenue, medianVolume));
                console.log(`✅ Processed ${this.dailyData.length} records for dashboard`);

            } else {
                console.warn('⚠️ Data sheet not found');
                this.dailyData = [];
                updateStatus('⚠️ Data sheet empty or not found');
            }

            // 2. Load Executive Summary & Monthly Trends (SKIPPING for CSV-only mode or making robust)
            // Note: In CSV mode, these sheets don't exist in the CSV workbook.
            // We'll skip trying to find them in the CSV workbook to avoid confusion.
            this.companyData = [];
            this.monthlyTrends = [];

            // 3. Load Trade Data Expanded (For Insight/Dashboard) - If needed
            try {
                // updateStatus('Trying to load trade_data_expanded.xlsx...'); 
                // Commented out to prevent 404 errors hanging the app if files are missing in Streamlit
                // const tradeResponse = await fetch('trade_data_expanded.xlsx');
                // if (tradeResponse.ok) { ... }
                this.tradeData = [];
            } catch (e) {
                console.warn('Could not load trade_data_expanded.xlsx', e);
                this.tradeData = [];
            }

            // 4. Load Company Info Detailed (For Insight/Dashboard)
            try {
                // updateStatus('Trying to load company_information_detailed.xlsx...');
                // Commented out for safety
                this.companyInfo = [];
            } catch (e) {
                console.warn('Could not load company_information_detailed.xlsx', e);
                this.companyInfo = [];
            }

            // 5. Load Company Summary (For Recommendations)
            this.companySummary = [];

            // Process Lists
            updateStatus('⚙️ Finalizing data processing...');
            this.processCompanyList();

            console.log('✅ All Data loaded successfully');
            return true;
        } catch (error) {
            console.error('Error loading data:', error);
            const el = document.querySelector('#loadingState p');
            if (el) {
                el.innerText = `❌ Error: ${error.message}`;
                el.style.color = '#ef4444';
            }
            // Also append error to body just in case
            const errDiv = document.createElement('div');
            errDiv.style.position = 'fixed';
            errDiv.style.top = '0';
            errDiv.style.left = '0';
            errDiv.style.background = 'red';
            errDiv.style.color = 'white';
            errDiv.style.padding = '10px';
            errDiv.style.zIndex = '99999';
            errDiv.innerText = `Data Load Error: ${error.message}`;
            document.body.appendChild(errDiv);

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

    // Helper: Standardize Product Names with Strict Rules
    standardizeProduct(rawDesc) {
        let desc = rawDesc.toLowerCase();

        // 1. Keyword-based Mapping (Priority Order)
        // If the description contains these words, map to a Clean Standard Name
        if (desc.includes('yarn')) {
            if (desc.includes('cotton') && desc.includes('poly')) return 'Poly/Cotton Yarn';
            if (desc.includes('cotton')) return 'Cotton Yarn';
            if (desc.includes('poly')) return 'Polyester Yarn';
            if (desc.includes('linen') || desc.includes('flax')) return 'Linen/Flax Yarn';
            if (desc.includes('filament')) return 'Filament Yarn';
            return 'Yarn (Other)';
        }

        if (desc.includes('fabric')) {
            if (desc.includes('knitted') || desc.includes('knit')) return 'Knitted Fabric';
            if (desc.includes('woven')) return 'Woven Fabric';
            if (desc.includes('cotton')) return 'Cotton Fabric';
            if (desc.includes('poly')) return 'Polyester Fabric';
            if (desc.includes('linen') || desc.includes('flax')) return 'Linen Fabric';
            return 'Fabric (General)';
        }

        if (desc.includes('fiber') || desc.includes('fibre')) {
            if (desc.includes('staple')) return 'Staple Fiber';
            if (desc.includes('short') && desc.includes('flax')) return 'Short Flax Fiber';
            if (desc.includes('long') && desc.includes('flax')) return 'Long Flax Fiber';
            if (desc.includes('tow')) return 'Flax Tow';
            return 'Fiber (Raw)';
        }

        if (desc.includes('waste')) return 'Cotton/Fiber Waste';
        if (desc.includes('garment') || desc.includes('clothing') || desc.includes('shirt') || desc.includes('pants')) return 'Ready-made Garments';

        // 2. Fallback: Clean and truncation
        // Remove noise
        desc = desc.replace(/[0-9\.\-\#\&]+/, ' ') // Remove codes
            .replace(/\b(width|gsm|color|dye|white|black|raw|material|style|pattern)\b.*/g, '') // Remove specs
            .trim();

        // Take first 3 words max
        const words = desc.split(/\s+/);
        if (words.length > 0) {
            // Capitalize first letter of each word
            return words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }

        return 'Other';
    }

    // Helper: Parse safely numbers from messy Excel strings
    parseNumber(value) {
        if (!value) return 0;
        const str = String(value);

        // Remove commas (thousand separators) and unwanted text
        // Keep digits, dots, and negative signs
        const cleanStr = str.replace(/,/g, '').replace(/[^0-9.\-]/g, '');

        const num = parseFloat(cleanStr);
        return isNaN(num) ? 0 : num;
    }

    // Helper: Derive Broad Category from Standardized Product
    deriveCategory(productName) {
        if (!productName) return 'Other';
        const p = productName.toLowerCase();
        if (p.includes('yarn')) return 'Yarn';
        if (p.includes('fabric')) return 'Fabric';
        if (p.includes('fiber') || p.includes('fibre') || p.includes('tow')) return 'Fiber';
        if (p.includes('garment') || p.includes('clothing') || p.includes('shirt') || p.includes('pants')) return 'Garment';
        return 'Other';
    }

    // Helper: Map Steven Data CSV to Dashboard format
    mapStevenData(item, medianRev, medianVol) {
        // HS Code Info
        const hsCode = String(item.hs_code || '');
        let category = 'Unknown';
        // Note: Keeping HS description logic as requested
        if (hsCode.startsWith('530110')) category = 'Flax; raw or retted, but not spun';
        else if (hsCode.startsWith('530121')) category = 'Flax; broken or scutched, but not spun';
        else if (hsCode.startsWith('530129')) category = 'Flax; hackled or otherwise processed, but not spun';
        else if (hsCode.startsWith('530130')) category = 'Flax; tow and waste, including yarn waste and garnetted stock';
        else category = `HS ${hsCode}`;

        // Product: Use 'product_label' as requested
        const product = String(item.product_label || 'Unknown').trim();

        // Numerics
        const totalPrice = this.parseNumber(item.value_usd);
        const totalAmount = this.parseNumber(item.quantity);

        // Unit Price (uusd)
        let avgUnitPrice = this.parseNumber(item.uusd);
        if (avgUnitPrice === 0 && totalAmount !== 0) {
            avgUnitPrice = totalPrice / totalAmount; // Fallback calc
        }

        // Scale Logic (Big/Small)
        // "Binary column big/small base on total usd and volumn"
        // Interpretation: If EITHER is above median, it's 'Big' (Inclusive approach), 
        // OR strictly based on one? User said "base on total usd and volumn".
        // Using "Big" if Revenue > Median OR Volume > Median to be generous, 
        // or AND to be strict. Let's start with Revenue as primary driver for business scale.
        const isBig = totalPrice > medianRev;
        const scale = isBig ? 'Big' : 'Small';

        return {
            // Dashboard Standard Keys
            Date_Trade: item.date, // SheetJS parses YYYY/MM/DD to Date object
            HS_Code: hsCode,
            Category: category,      // Legacy/Grouping
            HS_Description: category, // Filtering
            Product: product,        // from product_label

            // Metrics
            Total_Price: totalPrice,   // value_usd
            Total_Amount: totalAmount, // quantity
            Avg_Unit_Price: avgUnitPrice,

            // Entities
            Supplier: item.seller,   // Foreign Seller
            Buyer: item.buyer,       // Vietnam Buyer

            // Metadata
            Supplier_Location: item.seller_country,
            Buyer_Location: item.buyer_country,

            // New Metric
            Scale: scale
        };
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

    // Get sorted list of all unique categories
    getUniqueCategories() {
        return this.getUniqueValues('Category');
    }

    // Generate enriched company profiles for Copilot matching
    // Generate enriched company profiles for Copilot matching (Supplier Focus)
    generateCompanyProfiles() {
        if (!this.dailyData || this.dailyData.length === 0) return [];

        // 1. Aggregation per company (Supplier) - SWITCHED TO SUPPLIER FOCUS FOR COPILOT
        const companyMap = {};

        this.dailyData.forEach(item => {
            const company = item.Supplier; // Profile Suppliers (Foreign Sellers)
            if (!company) return;

            // Strict Filter: Remove undefined, empty, or Unknown strings
            if (!company || company === 'undefined' || company === 'null' || company.trim() === '' || company === 'Unknown') {
                return;
            }

            if (!companyMap[company]) {
                companyMap[company] = {
                    Supplier: company,
                    Location: item.Supplier_Location || 'Unknown',
                    Total_Revenue: 0,
                    Total_Amount: 0,
                    Categories: {}, // Track revenue per category
                    Business_Activities: new Set()
                };
            }

            const c = companyMap[company];
            c.Total_Revenue += (item.Total_Price || 0);
            c.Total_Amount += (item.Total_Amount || 0);

            // Track Category Revenue
            const cat = item.Category || 'Unknown';
            if (!c.Categories[cat]) c.Categories[cat] = 0;
            c.Categories[cat] += (item.Total_Price || 0);
            c.Business_Activities.add(cat);
        });

        // 2. Calculate Median Revenue for Scale
        const profiles = Object.values(companyMap);
        const revenues = profiles.map(p => p.Total_Revenue).sort((a, b) => a - b);
        const medianRevenue = revenues[Math.floor(revenues.length / 2)] || 0;

        // 3. Finalize Profiles
        return profiles.map(c => {
            // Calculate Top Category
            let bestCategory = 'Unknown';
            let maxRev = -1;
            Object.entries(c.Categories).forEach(([cat, rev]) => {
                if (rev > maxRev) {
                    maxRev = rev;
                    bestCategory = cat;
                }
            });

            // Sort categories by Revenue Descending for Top Categories
            const sortedCategories = Object.entries(c.Categories)
                .sort(([, revA], [, revB]) => revB - revA);

            // Top 3 for display
            const topCategoriesStr = sortedCategories
                .slice(0, 3)
                .map(([cat]) => cat)
                .join(', ');

            return {
                Supplier: c.Supplier, // Key is Supplier
                Location: c.Location,
                Total_Revenue: c.Total_Revenue,
                Total_Amount: c.Total_Amount,
                Model: 'Gemini 2.0 Flash',
                "Strongest Category": bestCategory,
                best_category: bestCategory,
                "Top Categories": topCategoriesStr,
                Business_Activities: sortedCategories.map(([cat]) => cat),
                Scale: c.Total_Revenue > medianRevenue ? 'Large' : 'Small',
                Type: 'Seller' // Changed type to Seller
            };
        });
    }

    // Get Top Entities (Supplier or Buyer)
    getTopEntities(filteredData, type = 'Supplier') {
        const aggregated = {};

        filteredData.forEach(item => {
            // Group by the requested type (Supplier or Buyer)
            const key = item[type] || 'Unknown';
            if (!aggregated[key]) {
                aggregated[key] = {
                    name: key,
                    revenue: 0,
                    volume: 0
                };
            }
            aggregated[key].revenue += (item.Total_Price || 0);
            aggregated[key].volume += (item.Total_Amount || 0);
        });

        // Convert to array and sort by Revenue
        return Object.values(aggregated)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
    }

    // Get sorted list of all unique HS Descriptions
    getUniqueHSDescriptions() {
        return this.getUniqueValues('HS_Description');
    }

    // Get Top Suppliers for a specific Buyer, optionally filtered by Field
    getTopSuppliers(companyName, filterValue = 'All', filterField = 'HS_Description') {
        if (!companyName) return null;

        // Filter trades where this company is the BUYER
        let trades = this.dailyData.filter(t => t.Buyer === companyName);

        if (filterValue && filterValue !== 'All') {
            trades = trades.filter(t => t[filterField] === filterValue);
        }

        const supplierData = {};
        trades.forEach(trade => {
            const supplier = trade.Supplier || 'Unknown'; // Group by Supplier
            if (!supplierData[supplier]) {
                supplierData[supplier] = { revenue: 0, volume: 0 };
            }
            supplierData[supplier].revenue += trade.Total_Price || 0;
            supplierData[supplier].volume += trade.Total_Amount || 0;
        });

        const suppliers = Object.entries(supplierData)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            labels: suppliers.map(p => p.name),
            revenue: suppliers.map(p => p.revenue),
            volume: suppliers.map(p => p.volume)
        };
    }

    // Get list of all companies
    // Get list of all companies (Buyers)
    getCompanyList() {
        // Derive unique companies (Buyers) from dailyData
        if (!this.dailyData || this.dailyData.length === 0) return [];

        // Filter legitimate buyers
        const companies = new Set(
            this.dailyData
                .map(d => d.Buyer)
                .filter(b => b && b !== 'Unknown' && b !== 'undefined')
        );
        return Array.from(companies).sort();
    }

    // Set selected company
    setSelectedCompany(companyName) {
        this.selectedCompany = companyName;
    }

    // Get company summary data
    // Get company summary data (Buyer Focus)
    getCompanySummary() {
        if (!this.selectedCompany) return null;

        // Calculate summary on the fly from dailyData (Buyer Focused)
        const trades = this.dailyData.filter(t => t.Buyer === this.selectedCompany);

        if (trades.length === 0) return null;

        const totalRevenue = trades.reduce((sum, t) => sum + (t.Total_Price || 0), 0);
        const totalVolume = trades.reduce((sum, t) => sum + (t.Total_Amount || 0), 0);
        const uniqueProducts = new Set(trades.map(t => t.Product)).size;

        // Find location (Buyer Location)
        const location = trades[0].Buyer_Location || 'Vietnam';

        return {
            'Total_Revenue': totalRevenue,
            'Total_Transactions': trades.length,
            'Total_Quantity': totalVolume,
            'Avg_Transaction': totalRevenue / trades.length,
            'Market_Share_%': 0, // Placeholder
            'Name': this.selectedCompany,
            'Location': location,
            'Business Type': 'Importer' // Changed to Importer for Buyers
        };
    }
    // Deprecated/Legacy method if needed
    getCompanySummaryRaw() {
        return this.companySummary;
    }

    // processCompanySummary is effectively replaced by getCompanySummary above
    // keeping empty or redirecting to avoid errors if called directly
    processCompanySummary() {
        return this.getCompanySummary();
    }

    // Get time series data for line chart (dual y-axis) from Monthly Trends sheet
    // Get time series data for line chart
    // Get time series data for line chart
    getTimeSeriesData(companyName = this.selectedCompany, role = 'Buyer') {
        if (!companyName) return null;

        // Filter trades based on role
        const trades = this.dailyData
            .filter(t => t[role] === companyName)
            .sort((a, b) => new Date(a.Date_Trade) - new Date(b.Date_Trade));

        // Aggregate by month locally
        const months = {};
        trades.forEach(d => {
            if (!d.Date_Trade) return;
            const date = new Date(d.Date_Trade);
            const mKey = date.getMonth(); // 0-11
            if (!months[mKey]) months[mKey] = { revenue: 0, transactions: 0 };
            months[mKey].revenue += d.Total_Price || 0;
            months[mKey].transactions += 1;
        });

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const labels = monthNames; // Shows full year
        const revenue = [];
        const transactions = [];

        for (let i = 0; i < 12; i++) {
            revenue.push(months[i] ? months[i].revenue : 0);
            transactions.push(months[i] ? months[i].transactions : 0);
        }

        return { labels, revenue, transactions };
    }

    // Get category distribution for pie chart (supports Product or Category)
    // Get category distribution for pie chart (supports Product or Category)
    getCategoryDistribution(companyName = this.selectedCompany, field = 'Category', role = 'Buyer') {
        if (!companyName) return null;

        // Filter trades based on role
        const trades = this.dailyData.filter(t => t[role] === companyName);

        const aggregated = {};
        trades.forEach(item => {
            const key = item[field] || 'Unknown';
            aggregated[key] = (aggregated[key] || 0) + item.Total_Price;
        });

        const sorted = Object.entries(aggregated)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10); // Check top 10

        return {
            labels: sorted.map(([k]) => k),
            values: sorted.map(([, v]) => v)
        };
    }

    // Get top 10 products for a specific category (Buyer Focus)
    getTop10ProductsByCategory(category) {
        if (!this.selectedCompany) return null;

        // Filter for Selected Buyer AND Category
        const trades = this.dailyData.filter(t =>
            t.Buyer === this.selectedCompany &&
            (t.Category === category || t.HS_Description === category)
        );

        // Aggregate by product
        const productData = {};
        trades.forEach(trade => {
            const product = trade.Product;
            if (!productData[product]) {
                productData[product] = {
                    revenue: 0,
                    volume: 0
                };
            }
            productData[product].revenue += trade.Total_Price || 0;
            productData[product].volume += trade.Total_Amount || 0;
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

    // Get top 10 Buyers for a specific Supplier (for Dashboard Graph 3)
    getTop10Buyers(companyName = this.selectedCompany) {
        if (!companyName) return null;

        // Filter: We are viewing the Supplier dashboard, so we want trades where Supplier == companyName
        // We want to see who are the top BUYERS for this Supplier.
        const companyTrades = this.dailyData.filter(t => t.Supplier === companyName);

        // Aggregate by Buyer
        const buyerData = {};
        companyTrades.forEach(trade => {
            const buyer = trade.Buyer || 'Unknown';
            if (!buyerData[buyer]) {
                buyerData[buyer] = {
                    revenue: 0,
                    volume: 0
                };
            }
            buyerData[buyer].revenue += trade.Total_Price || 0;
            buyerData[buyer].volume += trade.Total_Amount || 0;
        });

        // Convert to array and sort by revenue
        const buyers = Object.entries(buyerData)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            labels: buyers.map(p => p.name),
            revenue: buyers.map(p => p.revenue),
            volume: buyers.map(p => p.volume)
        };
    }

    // Get list of all companies (Buyers)
    getCompanyList() {
        // Derive unique companies (Buyers) from dailyData
        if (!this.dailyData || this.dailyData.length === 0) return [];

        // Filter legitimate buyers
        const companies = new Set(
            this.dailyData
                .map(d => d.Buyer)
                .filter(b => b && b !== 'Unknown' && b !== 'undefined')
        );
        return Array.from(companies).sort();
    }

    // Get top 10 Buyers for a specific Supplier (for Copilot Dashboard Graph 3)
    getTopBuyers(companyName, filterValue = 'All', filterField = 'HS_Description') {
        if (!companyName) return null;

        // Filter: We are viewing the Supplier dashboard, so we want trades where Supplier == companyName
        let trades = this.dailyData.filter(t => t.Supplier === companyName);

        // Apply Category/HS Code Filter
        if (filterValue !== 'All') {
            trades = trades.filter(t => t[filterField] === filterValue);
        }

        const buyerData = {};
        trades.forEach(trade => {
            const buyer = trade.Buyer;
            if (!buyerData[buyer]) {
                buyerData[buyer] = { revenue: 0, volume: 0 };
            }
            buyerData[buyer].revenue += trade.Total_Price || 0;
            buyerData[buyer].volume += trade.Total_Amount || 0;
        });

        const sortedBuyers = Object.entries(buyerData)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            labels: sortedBuyers.map(b => b.name),
            revenue: sortedBuyers.map(b => b.revenue),
            volume: sortedBuyers.map(b => b.volume)
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
