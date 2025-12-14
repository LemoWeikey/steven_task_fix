// Simplified Analysis Controller - AI chart analysis
class AnalysisController {
    constructor(dashboardController, dragDropController) {
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

        this.setupEventListeners();
    }

    setupEventListeners() {
        const analyzeBtn = document.getElementById('analyzeDashboard');
        const backBtn = document.getElementById('backToDashboard');

        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => this.startAnalysis());
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => this.closeSplitView());
        }
    }

    async startAnalysis() {
        console.log('🚀 Starting AI Analysis...');

        // Show split view
        this.showSplitView();

        // Show loading
        document.getElementById('analysisLoading').classList.remove('hidden');
        document.getElementById('analysisReport').classList.add('hidden');

        try {
            // Capture charts as images
            const chartImages = await this.captureChartsAsImages();

            if (chartImages.length === 0) {
                throw new Error('No charts to analyze');
            }

            // Prepare prompt
            const prompt = this.prepareAnalysisPrompt(chartImages.length);

            // Call Gemini API
            const analysis = await this.callGeminiAPI(chartImages, prompt);

            // Display analysis
            this.displayAnalysis(analysis);

        } catch (error) {
            console.error('❌ Analysis error:', error);
            document.getElementById('analysisLoading').classList.add('hidden');
            document.getElementById('analysisReport').classList.remove('hidden');
            document.getElementById('analysisReport').innerHTML = `
                <div style="color: #ef4444; padding: 20px; text-align: center;">
                    <h3>⚠️ Analysis Failed</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    async captureChartsAsImages() {
        const images = [];
        const charts = this.dragDrop.draggedCharts;

        for (const chart of charts) {
            const canvas = document.getElementById(`dropped-chart-${chart.id}`);
            if (canvas) {
                try {
                    const dataURL = canvas.toDataURL('image/png');
                    const base64 = dataURL.split(',')[1];

                    images.push({
                        inlineData: {
                            mimeType: 'image/png',
                            data: base64
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

        return `Analyze these ${chartCount} business dashboard chart(s) for ${company}.

Provide a brief analysis with:
1. Key insights from the data
2. Notable trends or patterns
3. Strategic recommendations

Keep it concise and actionable.`;
    }

    async callGeminiAPI(chartImages, prompt) {
        const apiKey = this.apiKeys[this.currentKeyIndex];

        const parts = [{ text: prompt }];
        for (const img of chartImages) {
            parts.push(img);
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: parts }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 2048,
                }
            })
        });

        if (!response.ok) {
            throw new Error('API request failed');
        }

        const data = await response.json();

        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }

        throw new Error('No valid response from AI');
    }

    displayAnalysis(analysisText) {
        document.getElementById('analysisLoading').classList.add('hidden');
        const reportDiv = document.getElementById('analysisReport');
        reportDiv.classList.remove('hidden');

        if (typeof marked !== 'undefined') {
            reportDiv.innerHTML = marked.parse(analysisText);
        } else {
            reportDiv.innerHTML = `<pre style="white-space: pre-wrap;">${analysisText}</pre>`;
        }
    }

    showSplitView() {
        document.getElementById('app').style.display = 'none';
        document.getElementById('analysisView').classList.remove('hidden');

        const container = document.getElementById('analysisChartsContainer');
        container.innerHTML = '';

        this.dragDrop.draggedCharts.forEach(chart => {
            const chartCard = this.dragDrop.createChartCard(chart, -1);
            chartCard.querySelector('.remove-chart-btn')?.remove();
            container.appendChild(chartCard);
        });

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
        document.getElementById('app').style.display = 'flex';
        document.getElementById('analysisView').classList.add('hidden');
        document.getElementById('analysisChartsContainer').innerHTML = '';
        document.getElementById('analysisReport').innerHTML = '';
    }
}

