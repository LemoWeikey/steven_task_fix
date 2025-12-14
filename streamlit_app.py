import streamlit as st
import streamlit.components.v1 as components
import os

st.set_page_config(layout="wide")

def load_file(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        return f.read()

# Load specific CSS/JS content
try:
    css_content = load_file('index.css')
    js_content = load_file('index.js')
    processor_content = load_file('data-processor.js')
    rec_controller_content = load_file('recommendation-controller.js')
    analysis_controller_content = load_file('analysis-controller.js') # If exists
except FileNotFoundError:
    # If using analysis-controller logic from main JS or simplified structure
    analysis_controller_content = ""

# Load CSV Data to inject
try:
    csv_content = load_file('steven_data_5301.csv')
    import json
    # Ensure it's a valid JSON string
    json_csv = json.dumps(csv_content)
except Exception as e:
    print(f"Error loading CSV: {e}")
    json_csv = "null" # JS will see window.INJECTED_CSV_DATA = null;

# Helper script to inject data
injection_script = f"""
<script>
    window.INJECTED_CSV_DATA = {json_csv};
    console.log('📦 CSV Data Injected. Length:', window.INJECTED_CSV_DATA ? window.INJECTED_CSV_DATA.length : 'NULL');
</script>
"""

# HTML Template
html_template = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Business Intelligence Dashboard</title>
    <style>
        {css_content}
        /* Streamlit Adjustment */
        body {{ background-color: #0f172a; overflow: hidden; }}
        #app {{ height: 100vh; width: 100vw; }}
    </style>
    <!-- Libraries -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body>
    {injection_script}
    
    <!-- App Structure (Copied from app.html body inner content) -->
    <!-- We need the inner content of body from app.html, excluding scripts we add manually -->
    <div class="app-background"></div>
    <div class="app-container" id="app">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-brand">
                <div class="brand-logo">
                    <div class="brand-icon"><i data-lucide="zap"></i></div>
                    <div class="brand-text"><h1>DataFlow</h1><p>Intelligence Hub</p></div>
                </div>
            </div>
            <nav>
                <ul class="nav-menu">
                    <li class="nav-item"><a href="#" class="nav-link" data-section="overview"><span class="nav-icon"><i data-lucide="layout-dashboard"></i></span><span>Overview</span></a></li>
                    <li class="nav-item"><a href="#" class="nav-link active" data-section="insight"><span class="nav-icon"><i data-lucide="lightbulb"></i></span><span>Insight</span></a></li>
                    <li class="nav-item"><a href="#" class="nav-link" data-section="copilot"><span class="nav-icon"><i data-lucide="bot"></i></span><span>Copilot</span></a></li>
                    <li class="nav-item"><a href="#" class="nav-link" data-section="control"><span class="nav-icon"><i data-lucide="settings"></i></span><span>Control System</span></a></li>
                </ul>
            </nav>
        </aside>

        <main class="main-content">
             <!-- Overview Section -->
            <section id="overview-section" class="content-section hidden">
                <div class="content-header">
                    <h1 class="content-title">Overview</h1>
                    <p class="content-subtitle">Global market analysis and trends</p>
                </div>
                <!-- Overview Content Placeholders if any, or reuse existing structure from index.js -->
                 <div id="overview-filters" class="filters-panel">
                    <!-- Filters will be rendered here by JS -->
                    <div class="filter-group"><h3>HS Code</h3><div id="filterHS" class="filter-list"></div></div>
                    <div class="filter-group"><h3>Category</h3><div id="filterCategory" class="filter-list"></div></div>
                    <div class="filter-group"><h3>Product</h3><div id="filterProduct" class="filter-list"></div></div>
                </div>
                
                 <div class="charts-grid-overview">
                    <div class="chart-card"><h3>Monthly Trends</h3><div class="chart-container"><canvas id="ovMonthlyChart"></canvas></div></div>
                    <div class="chart-card"><h3>Price Analysis</h3><div class="chart-container"><canvas id="ovPriceChart"></canvas></div></div>
                    <div class="chart-card"><h3>Top Entities</h3>
                         <div class="toggle-group">
                            <button class="toggle-btn active" data-view="supplier">Suppliers</button>
                            <button class="toggle-btn" data-view="buyer">Buyers</button>
                        </div>
                        <div class="chart-container"><canvas id="ovTopChart"></canvas></div>
                    </div>
                </div>
            </section>

            <!-- Insight Section -->
            <section id="insight-section" class="content-section">
                <div class="content-header">
                    <h1 class="content-title">Insight</h1>
                    <p class="content-subtitle">Analytics dashboard for selected company</p>
                </div>
                <div class="company-selector-container">
                    <div class="company-selector" id="companySelector">
                        <div class="selector-header" id="selectorHeader">
                            <div class="selector-label"><i data-lucide="building-2"></i><span id="selectedCompanyName">Select a company...</span></div>
                            <i data-lucide="chevron-down" class="selector-arrow"></i>
                        </div>
                        <div class="selector-dropdown hidden" id="selectorDropdown">
                            <div class="dropdown-search"><i data-lucide="search"></i><input type="text" placeholder="Search companies..." id="companySearch"></div>
                            <div class="dropdown-list" id="companyList"></div>
                        </div>
                    </div>
                </div>
                <div id="loadingState" class="loading-state"><div class="loading-spinner"></div><p>Loading analytics data...</p></div>
                <div id="emptyState" class="empty-state"><div class="empty-icon"><i data-lucide="bar-chart-2"></i></div><h3>No Company Selected</h3><p>Please select a company to view detailed analytics.</p></div>
                
                <div id="dashboardContent" class="dashboard-content hidden">
                    <div class="kpi-grid" id="kpiGrid"></div>
                    <div class="charts-grid">
                        <div class="chart-card" data-chart="line">
                            <div class="chart-header"><h3>Revenue Trend</h3><button class="expand-btn" data-chart="line"><i data-lucide="maximize-2"></i></button></div>
                            <div class="chart-container"><canvas id="lineChart"></canvas></div>
                        </div>
                        <div class="chart-card" data-chart="pie">
                            <div class="chart-header"><h3>Revenue Distribution</h3><button class="expand-btn" data-chart="pie"><i data-lucide="maximize-2"></i></button></div>
                            <div class="chart-container"><canvas id="pieChart"></canvas></div>
                        </div>
                        <div class="chart-card" data-chart="bar">
                            <div class="chart-header"><h3>Top 10 Sellers</h3><button class="expand-btn" data-chart="bar"><i data-lucide="maximize-2"></i></button></div>
                            <div class="chart-container"><canvas id="barChart"></canvas></div>
                        </div>
                    </div>
                    <div class="company-details-card"><h3>Company Details</h3><div id="companyDetailsContent"></div></div>
                </div>
            </section>

            <!-- Copilot Section -->
            <section id="copilot-section" class="content-section hidden">
                <!-- Copilot content rendered by JS -->
            </section>
            
             <!-- Control Section -->
            <section id="control-section" class="content-section hidden">
                 <div class="content-header">
                    <h1 class="content-title">Control System</h1>
                    <p class="content-subtitle">AI Analyst & Reporting</p>
                </div>
                 <div class="control-panel">
                    <div class="control-card">
                        <div class="control-icon"><i data-lucide="file-text"></i></div>
                        <h3>Generate Report</h3>
                        <p>Create detailed PDF reports.</p>
                        <button class="secondary-btn">Export PDF</button>
                    </div>
                     <div class="control-card highlight">
                        <div class="control-icon"><i data-lucide="brain-circuit"></i></div>
                        <h3>AI Analyst</h3>
                        <p>Get automated insights.</p>
                         <button class="primary-btn" id="analyzeBtn">Analyze Data</button>
                    </div>
                </div>
                 <div id="analysisResult" class="analysis-result hidden">
                    <div class="analysis-header">
                        <div class="ai-avatar"><i data-lucide="bot"></i></div>
                        <div class="ai-info"><h4>AI Analyst</h4><span class="ai-status">Online</span></div>
                    </div>
                    <div class="analysis-body" id="analysisText"></div>
                </div>
            </section>
        </main>
        
        <!-- Modals -->
        <div class="chart-modal hidden" id="chartModal"><div class="modal-content"><div class="modal-header"><h3 id="modalTitle">Chart Detail</h3><button class="close-modal"><i data-lucide="x"></i></button></div><div class="modal-body"><canvas id="modalChart"></canvas></div></div></div>
        
    </div>

    <!-- Scripts -->
    <script>
    // Injected Scripts
    {processor_content}
    {rec_controller_content}
    {analysis_controller_content}
    {js_content}
    </script>
</body>
</html>
"""

components.html(html_template, height=1200, scrolling=True)
