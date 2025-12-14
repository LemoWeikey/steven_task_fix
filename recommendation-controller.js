// Recommendation Controller - Handles Copilot Similarity Matching
class RecommendationController {
    constructor(dashboardController) {
        this.dashboard = dashboardController;
        this.container = document.getElementById('copilot-section');
        this.init();
    }

    init() {
        if (!this.container) return;
        this.renderEntryView();
    }

    renderEntryView() {
        // Initial view with "Find Recommendations" button
        this.container.innerHTML = `
            <div class="content-header">
                <h1 class="content-title">Copilot</h1>
                <p class="content-subtitle">AI-powered companion for business intelligence</p>
            </div>
            
            <div class="copilot-entry-card">
                <div class="copilot-icon-large">
                    <i data-lucide="bot"></i>
                </div>
                <h2>Strategic Recommendation Engine</h2>
                <p>Find similar companies based on business profile, location, and performance metrics.</p>
                <button class="primary-btn-large" id="startRecommendationBtn">
                    <i data-lucide="search"></i>
                    Start Recommendation
                </button>
            </div>
        `;

        document.getElementById('startRecommendationBtn')?.addEventListener('click', () => {
            this.renderInputForm();
        });

        lucide.createIcons();
    }

    renderInputForm() {
        this.container.innerHTML = `
            <div class="content-header">
                <h1 class="content-title">New Recommendation</h1>
                <button class="back-text-btn" id="backToEntry">
                    <i data-lucide="arrow-left"></i> Back
                </button>
            </div>

            <div class="copilot-form-container">
                <div class="form-group">
                    <label>Target Location (Country)</label>
                    <input type="text" id="recLocation" placeholder="e.g., Vietnam, China, USA" value="Vietnam">
                </div>

                <div class="form-group">
                    <label>Scale</label>
                    <select id="recScale">
                        <option value="Big">Big (Above Median Revenue)</option>
                        <option value="Small">Small (Below Median Revenue)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Strongest Category</label>
                    <select id="recStrongest">
                        ${dataProcessor.getUniqueCategories().map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label>Business Activities (Select all that apply)</label>
                    <div class="checkbox-group">
                        ${dataProcessor.getUniqueCategories().map(cat => `
                            <label><input type="checkbox" class="activity-checkbox" value="${cat}" checked> ${cat}</label>
                        `).join('')}
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Target Revenue (USD)</label>
                        <input type="number" id="recRevenue" value="25000000" placeholder="Annual Revenue">
                    </div>
                    <div class="form-group">
                        <label>Target Volume (Units)</label>
                        <input type="number" id="recVolume" value="50000" placeholder="Annual Volume">
                    </div>
                </div>

                <button class="primary-btn-large" id="runMatchingBtn">
                    <i data-lucide="sparkles"></i>
                    Find Matches
                </button>
            </div>
            <div id="recLoading" class="loading-state hidden">
                <div class="loading-spinner"></div>
                <p>Analyzing company profiles...</p>
            </div>
            <div id="recResults" class="results-grid hidden"></div>
        `;

        document.getElementById('backToEntry').addEventListener('click', () => this.renderEntryView());
        document.getElementById('runMatchingBtn').addEventListener('click', () => this.runMatching());

        lucide.createIcons();
    }

    runMatching() {
        const selectedActivities = Array.from(document.querySelectorAll('.activity-checkbox:checked')).map(cb => cb.value);

        const criteria = {
            Location: document.getElementById('recLocation').value.trim(),
            Scale: document.getElementById('recScale').value,
            strongest_in_USD: document.getElementById('recStrongest').value,
            activities: selectedActivities,
            total_in_USD: parseFloat(document.getElementById('recRevenue').value) || 0,
            total_in_Volume: parseFloat(document.getElementById('recVolume').value) || 0
        };

        const loading = document.getElementById('recLoading');
        const results = document.getElementById('recResults');

        loading.classList.remove('hidden');
        results.classList.add('hidden');

        // Store criteria for Mimic feature
        this.currentUserCriteria = criteria;

        // Simulate processing delay for UX
        setTimeout(() => {
            const matches = this.findMatches(criteria);
            this.currentMatches = matches; // Store matches
            this.renderResults(matches);
            loading.classList.add('hidden');
            results.classList.remove('hidden');
        }, 800);
    }

    findMatches(user) {
        // Access data from dataProcessor
        const companies = dataProcessor.generateCompanyProfiles();

        if (!companies || companies.length === 0) {
            console.error("No company data available for matching");
            return [];
        }

        const scores = companies.map(company => {
            let score = 0;

            // 1. Location (1 point) - Simple loose string match
            // In a real app, use fuzzy matching or country code normalization
            const userLoc = user.Location.toLowerCase();
            const compLoc = String(company.Location || '').toLowerCase();
            const locationMatch = compLoc.includes(userLoc) || userLoc.includes(compLoc);
            const score_loc = locationMatch ? 1.0 : 0.0;

            // 2. Scale (1 point)
            const score_scale = (user.Scale === company.Scale) ? 1.0 : 0.0;

            // 3. Strongest Category (1 point)
            // 'best_category' from summary corresponds to 'strongest_in_USD'
            const score_strongest = (user.strongest_in_USD === company.best_category) ? 1.0 : 0.0;

            // 4. Business Activities (Max 1 point)
            // Compare user.activities (array) with company.Business_Activities (array)
            // Intersection / Union (IoU) or simply Intersection count / User selection count
            const userActs = new Set(user.activities);
            const compActs = new Set(company.Business_Activities);
            let intersection = 0;
            userActs.forEach(act => {
                if (compActs.has(act)) intersection++;
            });

            // Avoid division by zero
            const score_activity = userActs.size > 0 ? (intersection / userActs.size) : 0;

            // 5. Total USD Score (1 point if within +/- 10%)
            // Using wider range for demo purposes (e.g. +/- 20%) to ensure matches
            const lower_usd = user.total_in_USD * 0.8;
            const upper_usd = user.total_in_USD * 1.2;
            const compRevenue = company.Total_Revenue || 0;
            const score_usd = (compRevenue >= lower_usd && compRevenue <= upper_usd) ? 1.0 : 0.0;

            // 6. Total Volume Score (1 point if within +/- 20%)
            const lower_vol = user.total_in_Volume * 0.8;
            const upper_vol = user.total_in_Volume * 1.2;
            const compVolume = company.Total_Amount || 0; // 'Total_Amount' in sheet is Volume/Qty
            const score_vol = (compVolume >= lower_vol && compVolume <= upper_vol) ? 1.0 : 0.0;

            score = score_loc + score_scale + score_strongest + score_activity + score_usd + score_vol;

            return {
                ...company,
                match_score: score,
                breakdown: { score_loc, score_scale, score_strongest, score_activity, score_usd, score_vol }
            };
        });

        // Sort by score descending and take top 3
        return scores.sort((a, b) => b.match_score - a.match_score).slice(0, 3);
    }

    renderResults(matches) {
        const resultsContainer = document.getElementById('recResults');

        if (matches.length === 0) {
            resultsContainer.innerHTML = '<p class="no-results">No matches found. Try broadening your criteria.</p>';
            return;
        }

        let html = '<h3 class="results-title">Top 3 Similar Companies</h3>';

        matches.forEach(company => {
            const scorePercent = Math.round((company.match_score / 6.0) * 100);

            html += `
                <div class="helper-card">
                    <div class="helper-header">
                        <div class="helper-title">
                            <h3>${company.Supplier}</h3>
                            <span class="match-badge">${scorePercent}% Match</span>
                        </div>
                        <button class="view-details-btn" data-company="${company.Supplier}">
                            View Dashboard
                        </button>
                    </div>
                    <div class="helper-stats">
                        <div class="stat">
                            <span class="label">Location</span>
                            <span class="value">${company.Location || 'N/A'}</span>
                        </div>
                         <div class="stat">
                            <span class="label">Revenue</span>
                            <span class="value">$${(company.Total_Revenue || 0).toLocaleString()}</span>
                        </div>
                        <div class="stat">
                            <span class="label">Category</span>
                            <span class="value">${company.best_category}</span>
                        </div>
                    </div>
                    <div class="score-breakdown">
                        <small>Score: ${company.match_score.toFixed(2)} / 6.0</small>
                        <div class="score-bar">
                             <div class="score-fill" style="width: ${scorePercent}%"></div>
                        </div>
                    </div>
                </div>
            `;
        });

        // Add Mimic Strategy Button at the end
        const mimicSection = document.createElement('div');
        mimicSection.style.marginTop = '2rem';
        mimicSection.style.textAlign = 'center';
        mimicSection.innerHTML = `
            <button id="mimicStrategyBtn" class="primary-btn-large" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                <i data-lucide="zap" style="margin-right: 8px;"></i> Mimic Strategy
            </button>
            <p style="margin-top: 0.5rem; color: #6b7280; font-size: 0.9rem;">Generate AI strategy based on best performing match</p>
        `;
        // Append instead of overwrite innerHTML to keep previous html content, 
        // but resultsContainer.innerHTML was set above. So we append to resultsContainer.
        resultsContainer.innerHTML = html; // Set the cards first
        resultsContainer.appendChild(mimicSection); // Then append button

        // Event listener for Mimic
        document.getElementById('mimicStrategyBtn').addEventListener('click', () => {
            this.renderMimicView();
        });

        // Add event listeners to "View Dashboard" buttons
        const buttons = resultsContainer.querySelectorAll('.view-details-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const companyName = btn.getAttribute('data-company');
                this.renderPredictionModal(companyName);
            });
        });
    }

    renderPredictionModal(companyName) {
        // Create modal structure if not exists
        let modal = document.getElementById('predictionModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'predictionModal';
            modal.className = 'chart-modal hidden';
            modal.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-content" style="max-width: 1400px; height: 90vh;">
                    <div class="modal-header">
                        <h2 id="predictionModalTitle">Company Analysis</h2>
                        <button class="close-modal-btn" id="closePredictionModal">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                    <div class="modal-chart-container" style="overflow-y: auto; padding: 2rem;">
                        <div class="charts-row" style="margin-bottom: 2rem;">
                             <!-- Chart 1: Performance -->
                            <div class="chart-card">
                                <div class="chart-header"><h3>Performance Over Time</h3></div>
                                <div class="chart-container"><canvas id="predLineChart"></canvas></div>
                            </div>
                            <!-- Chart 2: Distribution -->
                            <div class="chart-card">
                                <div class="chart-header">
                                    <h3>Distribution</h3>
                                    <select id="predDistributionFilter" style="padding: 4px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.8rem;">
                                        <option value="Category">By Category</option>
                                        <option value="Product">By Product</option>
                                    </select>
                                </div>
                                <div class="chart-container"><canvas id="predPieChart"></canvas></div>
                            </div>
                            <!-- Chart 3: Top Buyers -->
                            <div class="chart-card">
                                <div class="chart-header">
                                    <h3>Top Buyers</h3>
                                    <select id="predSupplierFilter" style="padding: 4px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.8rem;">
                                        <option value="All">All Classifications</option>
                                        <!-- Dynamic Options -->
                                        ${dataProcessor.getUniqueHSDescriptions().map(c => `<option value="${c}">${c}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="chart-container"><canvas id="predBarChart"></canvas></div>
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <button class="primary-btn-large" id="fullDashboardBtn" style="margin: 0 auto;">
                                Open Full Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Close events
            const closeBtn = modal.querySelector('#closePredictionModal');
            const overlay = modal.querySelector('.modal-overlay');
            const close = () => {
                modal.classList.add('hidden');
                // Destroy charts
                if (this.predCharts) {
                    Object.values(this.predCharts).forEach(c => c && c.destroy());
                }
            };
            closeBtn.onclick = close;
            overlay.onclick = close;

            // Filters Change Events
            document.getElementById('predDistributionFilter').addEventListener('change', (e) => {
                this.updateDistributionChart(this.currentPredictionCompany, e.target.value);
            });
            document.getElementById('predSupplierFilter').addEventListener('change', (e) => {
                this.updateBuyerChart(this.currentPredictionCompany, e.target.value);
            });

            // Full Dashboard Button
            const fullDashBtn = modal.querySelector('#fullDashboardBtn');
            fullDashBtn.onclick = () => {
                close();
                this.dashboard.switchSection('insight');
                this.dashboard.selectCompany(this.currentPredictionCompany);
            };
        }

        this.currentPredictionCompany = companyName;
        document.getElementById('predictionModalTitle').textContent = `Analysis: ${companyName}`;
        modal.classList.remove('hidden');

        // Render Charts with default filters
        this.renderPredictionCharts(companyName);
        lucide.createIcons();
    }

    renderPredictionCharts(companyName) {
        this.predCharts = this.predCharts || {};

        // 1. Line Chart (Performance)
        // 1. Line Chart (Performance) - Supplier Focus
        const lineData = dataProcessor.getTimeSeriesData(companyName, 'Supplier');
        if (lineData) {
            const ctx = document.getElementById('predLineChart');
            if (this.predCharts.line) this.predCharts.line.destroy();
            this.predCharts.line = new Chart(ctx, this.dashboard.getLineChartConfig(lineData));
        }

        // 2. Pie Chart (Distribution) - Default: Category
        // Note: Defaulting to 'Category' as per plan
        document.getElementById('predDistributionFilter').value = 'Category';
        this.updateDistributionChart(companyName, 'Category');

        // 3. Bar Chart (Top Buyers) - Default: All
        document.getElementById('predSupplierFilter').value = 'All';
        this.updateBuyerChart(companyName, 'All');
    }

    updateDistributionChart(companyName, field) {
        // Pass 'Supplier' role
        const data = dataProcessor.getCategoryDistribution(companyName, field, 'Supplier');
        if (data) {
            const ctx = document.getElementById('predPieChart');
            if (this.predCharts.pie) this.predCharts.pie.destroy();
            this.predCharts.pie = new Chart(ctx, this.dashboard.getPieChartConfig(data));
        }
    }

    updateBuyerChart(companyName, filterValue) {
        // Use HS_Description as the filter field, calling getTop10Buyers
        const data = dataProcessor.getTop10Buyers(companyName, filterValue, 'HS_Description');
        if (data) {
            const ctx = document.getElementById('predBarChart');
            if (this.predCharts.bar) this.predCharts.bar.destroy();

            // Reuse Bar Chart Config but customize title/color if needed
            // The dashboard.getBarChartConfig sets color to purple/blue which works fine.
            this.predCharts.bar = new Chart(ctx, {
                ...this.dashboard.getBarChartConfig(data),
                options: {
                    ...this.dashboard.getBarChartConfig(data).options,
                    plugins: {
                        ...this.dashboard.getBarChartConfig(data).options.plugins,
                        title: { display: true, text: 'Top Buyers by Revenue' }
                    }
                }
            });
        }
    }

    renderMimicView() {
        if (!this.currentMatches || this.currentMatches.length === 0) return;

        // 1. Select Best Match (Score > Revenue > Volume)
        const bestMatch = [...this.currentMatches].sort((a, b) => {
            if (b.match_score !== a.match_score) return b.match_score - a.match_score;
            if (b.Total_Revenue !== a.Total_Revenue) return (b.Total_Revenue || 0) - (a.Total_Revenue || 0);
            return (b.Total_Amount || 0) - (a.Total_Amount || 0);
        })[0];

        // 2. Prepare Data for Analysis
        const lineData = dataProcessor.getTimeSeriesData(bestMatch.Buyer);
        const supplierData = dataProcessor.getTopSuppliers(bestMatch.Buyer, 'General');

        // 3. Create Modal
        let modal = document.getElementById('mimicModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'mimicModal';
            modal.className = 'chart-modal hidden';
            document.body.appendChild(modal);
        }

        // 4. Generate Analysis with real data context
        const user = this.currentUserCriteria;
        const analysisText = this.generateAIAnalysis(user, bestMatch, lineData, supplierData);

        // 5. Render Content (Dark Theme)
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content" style="max-width: 1400px; height: 95vh; display: flex; flex-direction: column; background: #0f172a; color: #f1f5f9; border: 1px solid #334155;">
                <div class="modal-header" style="background: linear-gradient(to right, #1e293b, #0f172a); border-bottom: 1px solid #334155;">
                    <div>
                        <h2 style="color: #10b981; display: flex; align-items: center; gap: 10px;">
                            <i data-lucide="bot"></i> Strategic Implementation Plan
                        </h2>
                        <span style="font-size: 0.9rem; color: #94a3b8;">AI-Generated Strategy mimicking <strong>${bestMatch.Buyer}</strong></span>
                    </div>
                    <button class="close-modal-btn" id="closeMimicModal" style="color: #f1f5f9;"><i data-lucide="x"></i></button>
                </div>

                <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 2rem; background: #020617;">
                    
                    <!-- Top Section: Applicant vs Target -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                         <div class="card" style="background: #1e293b; border-left: 4px solid #3b82f6; padding: 1.5rem; border-radius: 8px;">
                            <h3 style="color: #60a5fa; margin-bottom: 1rem;">Applicant Profile</h3>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.9rem; color: #cbd5e1;">
                                <div><strong>Location:</strong> ${user.Location}</div>
                                <div><strong>Scale:</strong> ${user.Scale}</div>
                                <div><strong>Goal Revenue:</strong> $${user.total_in_USD.toLocaleString()}</div>
                                <div><strong>Focus:</strong> ${user.strongest_in_USD}</div>
                            </div>
                         </div>
                         <div class="card" style="background: #1e293b; border-left: 4px solid #10b981; padding: 1.5rem; border-radius: 8px;">
                            <h3 style="color: #34d399; margin-bottom: 1rem;">Modeled Entity: ${bestMatch.Buyer}</h3>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.9rem; color: #cbd5e1;">
                                <div><strong>Location:</strong> ${bestMatch.Location}</div>
                                <div><strong>Scale:</strong> ${bestMatch.Scale}</div>
                                <div><strong>Revenue:</strong> $${(bestMatch.Total_Revenue || 0).toLocaleString()}</div>
                                <div><strong>Best Category:</strong> ${bestMatch.best_category}</div>
                            </div>
                         </div>
                    </div>

                    <!-- AI Analysis Section -->
                    <div class="card" style="background: #1e293b; border: 1px solid #334155; margin-bottom: 2rem; padding: 1.5rem; border-radius: 8px;">
                        <div style="display: flex; gap: 1rem;">
                            <div style="min-width: 40px; height: 40px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">
                                <i data-lucide="sparkles"></i>
                            </div>
                            <div style="flex: 1;">
                                <h3 style="color: #60a5fa; margin-bottom: 1rem;">Gemini Strategic Analysis</h3>
                                <div style="color: #e2e8f0; line-height: 1.7; white-space: pre-line; font-size: 0.95rem;">
                                    ${analysisText}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Charts Section -->
                    <h3 style="margin-bottom: 1rem; color: #f1f5f9; border-left: 4px solid #8b5cf6; padding-left: 10px;">Projected Performance Metrics</h3>
                    <div class="charts-row" style="margin-bottom: 2rem;">
                        <!-- Chart 1: Performance -->
                        <div class="chart-card">
                            <div class="chart-header"><h3>Growth Trajectory</h3></div>
                            <div class="chart-container"><canvas id="mimicLineChart"></canvas></div>
                        </div>
                        <!-- Chart 2: Distribution -->
                        <div class="chart-card">
                             <div class="chart-header"><h3>Optimal Product Mix</h3></div>
                             <div class="chart-container"><canvas id="mimicPieChart"></canvas></div>
                        </div>
                        <!-- Chart 3: Top Suppliers -->
                        <div class="chart-card">
                             <div class="chart-header"><h3>Supply Chain Structure</h3></div>
                             <div class="chart-container"><canvas id="mimicBarChart"></canvas></div>
                        </div>
                    </div>

                </div>
            </div>
        `;

        modal.classList.remove('hidden');

        // Events
        const close = () => {
            modal.classList.add('hidden');
            if (this.mimicCharts) Object.values(this.mimicCharts).forEach(c => c && c.destroy());
        };
        modal.querySelector('#closeMimicModal').onclick = close;
        modal.querySelector('.modal-overlay').onclick = close;

        // Render Charts with passed data
        this.renderMimicCharts(lineData, bestMatch.Buyer);
        lucide.createIcons();
    }

    renderMimicCharts(lineData, companyName) {
        this.mimicCharts = {};

        // 1. Line Chart (Already fetched)
        if (lineData) {
            const ctx = document.getElementById('mimicLineChart');
            this.mimicCharts.line = new Chart(ctx, this.dashboard.getLineChartConfig(lineData));
        }

        // 2. Pie Chart
        const pieData = dataProcessor.getCategoryDistribution(companyName);
        if (pieData) {
            const ctx = document.getElementById('mimicPieChart');
            this.mimicCharts.pie = new Chart(ctx, this.dashboard.getPieChartConfig(pieData));
        }

        // 3. Bar Chart
        const barData = dataProcessor.getTopSuppliers(companyName, 'General');
        if (barData) {
            const ctx = document.getElementById('mimicBarChart');
            this.mimicCharts.bar = new Chart(ctx, this.dashboard.getBarChartConfig(barData));
        }
    }

    generateAIAnalysis(user, bestMatch, lineData, supplierData) {
        // 1. Data Processing for detailed report
        const revenueGap = (bestMatch.Total_Revenue || 0) - user.total_in_USD;
        const growthDir = revenueGap > 0 ? "scale up" : "optimize efficiency";

        // Trend Analysis
        let trendAnalysis = "stable growth";
        let peakMonth = "October";
        if (lineData && lineData.revenue && lineData.revenue.length > 0) {
            const revenues = lineData.revenue;
            const maxRev = Math.max(...revenues);
            const maxIdx = revenues.indexOf(maxRev);
            peakMonth = lineData.labels[maxIdx];

            // Check H2 vs H1
            const h1 = revenues.slice(0, 6).reduce((a, b) => a + b, 0);
            const h2 = revenues.slice(6, 12).reduce((a, b) => a + b, 0);
            if (h2 > h1 * 1.1) trendAnalysis = "strong H2 acceleration";
            else if (h1 > h2 * 1.1) trendAnalysis = "early-year seasonality";
        }

        // Supplier Analysis
        let supplierList = "key market players";
        let primeSupplier = "Unknown";
        if (supplierData && supplierData.labels && supplierData.labels.length > 0) {
            supplierList = supplierData.labels.slice(0, 3).join(", ");
            primeSupplier = supplierData.labels[0];
        }

        // 2. Formulate Long-Form Report
        return `
        <div class="strategy-report" style="line-height: 1.8; color: #e2e8f0;">
            <div style="margin-bottom: 1.5rem;">
                <h4 style="color: #60a5fa; margin-bottom: 0.5rem; font-size: 1.1rem;">1. Executive Summary & Gap Analysis</h4>
                <p>
                    Targeting a revenue goal of <strong>$${user.total_in_USD.toLocaleString()}</strong> against <strong>${bestMatch.Buyer}</strong>'s annualized performance establishes a clear benchmark. 
                    The current trajectory requires you to <strong>${growthDir}</strong> operations. The model entity demonstrates <strong>${trendAnalysis}</strong>, suggesting that your primary lever for growth is not just volume, but timing and calculated inventory pressure.
                </p>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h4 style="color: #60a5fa; margin-bottom: 0.5rem; font-size: 1.1rem;">2. Operational Mechanics</h4>
                <ul style="list-style-type: none; padding-left: 0;">
                    <li style="margin-bottom: 0.8rem;">
                        <strong style="color: #cbd5e1;">Category Dominance:</strong> 
                        Your focus on <strong>${user.strongest_in_USD}</strong> aligns perfectly with the model's core strength. However, the data suggests they achieve higher turnover rates. 
                        <em>Recommendation:</em> Diversify your SKU count within ${user.strongest_in_USD} by adding 2-3 complimentary sub-categories (visible in the "Optimal Product Mix" chart) to increase average order value.
                    </li>
                    <li style="margin-bottom: 0.8rem;">
                        <strong style="color: #cbd5e1;">Supply Chain Architecture:</strong> 
                        Validation of the "Supply Chain Structure" graph reveals a reliance on high-volume partners like <strong>${supplierList}</strong>. 
                        Unlike smaller competitors, this entity likely negotiates volume-based tiers. 
                        <em>Recommendation:</em> Consolidate purchasing with fewer, larger suppliers to improve margin leverage.
                    </li>
                </ul>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h4 style="color: #fbbf24; margin-bottom: 0.5rem; font-size: 1.1rem;">3. Risk Assessment</h4>
                <p>
                    Mimicking this scale introduces specific risks. The sharp revenue peak in <strong>${peakMonth}</strong> indicates a high dependency on seasonal execution. 
                    <strong>Operational Risk:</strong> Failure to secure logistics capacity 60 days prior to ${peakMonth} could result in a 20-30% revenue miss. 
                    <strong>Liquidity Risk:</strong> The inventory build-up required in Q${Math.ceil((dataProcessor.monthNameToIndex(peakMonth) + 1) / 3) - 1 || 3} will strain cash flow.
                </p>
            </div>

            <div style="background: rgba(30, 41, 59, 0.5); padding: 1rem; border-radius: 6px; border-left: 3px solid #10b981;">
                <h4 style="color: #34d399; margin-bottom: 0.5rem; font-size: 1.1rem;">4. Q1-Q3 Strategic Roadmap</h4>
                
                <div style="margin-bottom: 1rem;">
                    <strong style="color: #f1f5f9;">Phase 1: Foundation (Unknown - Month 1)</strong>
                    <ul style="padding-left: 1.2rem; color: #cbd5e1; margin-top: 0.25rem;">
                        <li>Initiate vendor onboarding with <strong>${primeSupplier}</strong>. Request terms for a pilot order in ${user.strongest_in_USD}.</li>
                        <li>Audit current logistics providers for ability to handle 2x volume spikes in ${peakMonth}.</li>
                    </ul>
                </div>

                <div style="margin-bottom: 1rem;">
                    <strong style="color: #f1f5f9;">Phase 2: Acceleration (Month 2-3)</strong>
                    <ul style="padding-left: 1.2rem; color: #cbd5e1; margin-top: 0.25rem;">
                        <li>Increase inventory depth by 15% specifically in top-performing SKUs.</li>
                        <li>Launch "Look-alike" marketing campaigns targeting the demographic profile of ${bestMatch.Buyer}.</li>
                    </ul>
                </div>

                 <div>
                    <strong style="color: #f1f5f9;">Phase 3: Execution (Month 4+)</strong>
                    <ul style="padding-left: 1.2rem; color: #cbd5e1; margin-top: 0.25rem;">
                        <li>Execute peakseason heavy-buy. Target 98% in-stock rate for ${peakMonth}.</li>
                        <li>Review "Supply Chain" pie chart quarterly—if one supplier exceeds 40% share, diversify immediately.</li>
                    </ul>
                </div>
            </div>
        </div>
        `;
    }
}

// Ensure global access
window.RecommendationController = RecommendationController;
