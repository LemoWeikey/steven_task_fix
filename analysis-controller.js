// Analysis Controller - AI-powered chart analysis
class AnalysisController {
    constructor(dashboardController, dragDropController) {
        console.log('🤖 AnalysisController initializing...');
        this.dashboard = dashboardController;
        this.dragDrop = dragDropController;

        // API Keys from key.txt
        this.apiKeys = [
            "AIzaSyCLbJSF249ButYxXkHbzxjBBB7EgQAPk7Y",
            "AIzaSyBhByUbP-3rbkGsNj8q6rvmj-hqhOHRIoo",
            "AIzaSyCedGoX-tIHSHRTKTwmQD8jwSTQTPG4HQE",
            "AIzaSyCFkMCpGfIzmBc657Fh9ssHhoX1ATK245Q",
            "AIzaSyCOVsl9tUeO2lsyK_0cFjla65dJAG4z7VU",
            "AIzaSyBqNQ-40OhpZvoTktCYlFqr966ReXcPuFM",
            "AIzaSyByGVaTxs8PDcV3cUquBAnyIi2hpauXcRE",
            "AIzaSyC4aUB5FycI8B09rKqTxewhCmdBwCcLvPg"
        ];
        this.currentKeyIndex = 0;

        console.log('🤖 API Keys loaded:', this.apiKeys.length);
        this.setupEventListeners();
        console.log('🤖 AnalysisController ready!');
    }

    setupEventListeners() {
        console.log('🎯 Setting up event listeners...');
        const analyzeBtn = document.getElementById('analyzeDashboard');
        const backBtn = document.getElementById('backToDashboard');

        console.log('🎯 Analyze button found:', analyzeBtn ? 'YES' : 'NO');
        console.log('🎯 Back button found:', backBtn ? 'YES' : 'NO');

        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => {
                console.log('🚀 ANALYZE BUTTON CLICKED!');
                this.startAnalysis();
            });
            console.log('✅ Analyze button event listener attached');
        } else {
            console.error('❌ Analyze button not found in DOM!');
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                console.log('⬅️ Back button clicked');
                this.closeSplitView();
            });
            console.log('✅ Back button event listener attached');
        }
    }

    async startAnalysis() {
        console.log('🚀 Starting AI Analysis...');
        console.log('📊 Number of charts:', this.dragDrop.draggedCharts.length);

        try {
            // Show split view
            console.log('👀 Showing split view...');
            this.showSplitView();
            console.log('✅ Split view shown');

            // Show loading
            console.log('⏳ Showing loading state...');
            const loadingEl = document.getElementById('analysisLoading');
            const reportEl = document.getElementById('analysisReport');

            console.log('🔍 Loading element found:', !!loadingEl);
            console.log('🔍 Report element found:', !!reportEl);

            if (loadingEl) loadingEl.classList.remove('hidden');
            if (reportEl) reportEl.classList.add('hidden');
            console.log('✅ Loading state shown');

            // Capture charts as images
            console.log('📸 Capturing charts as images...');
            const chartImages = await this.captureChartsAsImages();
            console.log('✅ Captured', chartImages.length, 'chart images');

            if (chartImages.length === 0) {
                throw new Error('No charts to analyze');
            }

            // Prepare prompt
            console.log('📝 Preparing analysis prompt...');
            const prompt = this.prepareAnalysisPrompt(chartImages.length);
            console.log('✅ Prompt prepared, length:', prompt.length);

            // Call Gemini API
            console.log('🤖 Calling Gemini API...');
            const analysis = await this.callGeminiAPI(chartImages, prompt);
            console.log('✅ Analysis received, length:', analysis.length);

            // Display analysis
            console.log('📄 Displaying analysis...');
            this.displayAnalysis(analysis);
            console.log('✅ Analysis displayed successfully!');

        } catch (error) {
            console.error('❌ Analysis error:', error);
            console.error('❌ Error stack:', error.stack);

            const loadingEl = document.getElementById('analysisLoading');
            const reportEl = document.getElementById('analysisReport');

            if (loadingEl) loadingEl.classList.add('hidden');
            if (reportEl) {
                reportEl.classList.remove('hidden');
                reportEl.innerHTML = `
                    <div style="color: #ef4444; padding: 20px; text-align: center;">
                        <h3>⚠️ Analysis Failed</h3>
                        <p>${error.message}</p>
                        <p style="color: #94a3b8; margin-top: 10px;">Please try again or check your API keys.</p>
                        <pre style="text-align: left; background: #1e293b; padding: 10px; border-radius: 8px; margin-top: 10px; font-size: 12px;">${error.stack}</pre>
                    </div>
                `;
            }
        }
    }

    async captureChartsAsImages() {
        const images = [];
        const charts = this.dragDrop.draggedCharts;

        for (const chart of charts) {
            const canvas = document.getElementById(`dropped - chart - ${chart.id} `);
            if (canvas) {
                try {
                    // Convert canvas to base64
                    const dataURL = canvas.toDataURL('image/png');
                    const base64 = dataURL.split(',')[1];

                    images.push({
                        inlineData: {
                            mimeType: 'image/png',
                            data: base64
                        },
                        chartInfo: {
                            type: chart.type,
                            category: chart.category,
                            company: chart.company
                        }
                    });
                } catch (err) {
                    console.error('Failed to capture chart:', err);
                }
            }
        }

        return images;
    }

    prepareAnalysisPrompt(chartCount) {
        const company = this.dashboard.selectedCompany || 'the company';

        return `You are a Senior Strategic Data Consultant analyzing a custom dashboard for ${company}.

The dashboard contains ${chartCount} chart(s) showing various business metrics and KPIs.

Please provide a comprehensive analysis following this structure:

#### 🎯 Executive Summary
    - Key takeaway in one powerful sentence
        - Overall business health assessment

#### 📊 Chart - by - Chart Insights
For each chart visible:
- What the chart shows
    - Key trends or patterns
        - Business implications

#### 🧠 Strategic Insights
    - Most significant findings
        - Potential risks or opportunities
            - Data - driven recommendations

#### 💡 Actionable Recommendations
    - Top 3 - 5 specific actions
        - Prioritize by impact

Keep the analysis concise, data - driven, and actionable.Use markdown formatting.`;
    }

    async callGeminiAPI(chartImages, prompt) {
        const maxRetries = this.apiKeys.length;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const apiKey = this.apiKeys[this.currentKeyIndex];
            this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;

            try {
                console.log(`Calling Gemini API(attempt ${attempt + 1}/${maxRetries})...`);

                // Prepare content parts
                const parts = [{ text: prompt }];

                // Add all chart images
                for (const img of chartImages) {
                    parts.push(img);
                }

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: parts
                        }],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 8192,
                        }
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('API Error:', errorData);

                    // If quota exceeded, try next key
                    if (response.status === 429 && attempt < maxRetries - 1) {
                        console.log('Quota exceeded, trying next API key...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }

                    throw new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`);
                }

                const data = await response.json();

                if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                    return data.candidates[0].content.parts[0].text;
                }

                throw new Error('No valid response from AI');

            } catch (error) {
                console.error(`Attempt ${attempt + 1} failed:`, error);

                if (attempt === maxRetries - 1) {
                    throw error;
                }

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error('All API keys exhausted');
    }

    displayAnalysis(analysisText) {
        // Hide loading
        document.getElementById('analysisLoading').classList.add('hidden');

        // Show report
        const reportDiv = document.getElementById('analysisReport');
        reportDiv.classList.remove('hidden');

        // Convert markdown to HTML using marked.js
        if (typeof marked !== 'undefined') {
            reportDiv.innerHTML = marked.parse(analysisText);
        } else {
            // Fallback if marked.js not loaded
            reportDiv.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit;">${analysisText}</pre>`;
        }
    }

    showSplitView() {
        // Hide main dashboard
        document.getElementById('app').style.display = 'none';

        // Show analysis view
        document.getElementById('analysisView').classList.remove('hidden');

        // Clone charts to left panel
        const container = document.getElementById('analysisChartsContainer');
        container.innerHTML = '';

        this.dragDrop.draggedCharts.forEach(chart => {
            const chartCard = this.dragDrop.createChartCard(chart, -1); // -1 to disable remove button
            chartCard.querySelector('.remove-chart-btn')?.remove(); // Remove the remove button
            container.appendChild(chartCard);
        });

        // Render charts
        setTimeout(() => {
            this.dragDrop.draggedCharts.forEach(chart => {
                this.renderChartInAnalysis(chart);
            });
            lucide.createIcons();
        }, 100);
    }

    renderChartInAnalysis(chart) {
        const canvas = document.querySelector(`#analysisChartsContainer #dropped-chart-${chart.id}`);
        if (!canvas) return;

        let config, data;

        if (chart.type === 'line') {
            data = dataProcessor.getTimeSeriesData();
            config = this.dashboard.getLineChartConfig(data);
        } else if (chart.type === 'pie') {
            data = dataProcessor.getCategoryDistribution();
            config = this.dashboard.getPieChartConfig(data);
        } else if (chart.type === 'bar') {
            data = dataProcessor.getTop10Products();
            config = this.dashboard.getBarChartConfig(data);
        } else if (chart.type === 'category-top10' && chart.category) {
            data = dataProcessor.getTop10ProductsByCategory(chart.category);
            if (data) {
                config = {
                    type: 'bar',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: 'Revenue (USD)',
                            data: data.revenue,
                            backgroundColor: '#8b5cf6',
                            borderRadius: 6
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (context) => `Revenue: $${context.parsed.x.toLocaleString()}`
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { color: 'rgba(51, 65, 85, 0.3)' },
                                ticks: { color: '#94a3b8' }
                            },
                            y: {
                                grid: { display: false },
                                ticks: { color: '#94a3b8', font: { size: 11 } }
                            }
                        }
                    }
                };
            }
        }

        if (config && data) {
            new Chart(canvas, config);
        }
    }

    closeSplitView() {
        // Show main dashboard
        document.getElementById('app').style.display = 'flex';

        // Hide analysis view
        document.getElementById('analysisView').classList.add('hidden');

        // Clear analysis container
        document.getElementById('analysisChartsContainer').innerHTML = '';
        document.getElementById('analysisReport').innerHTML = '';
    }
}
