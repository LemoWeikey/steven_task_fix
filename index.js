console.log("🚀 STARTING INDEX.JS EXECUTION");
// Initialize Lucide icons
lucide.createIcons();

// Navigation functionality
class NavigationController {
    constructor() {
        this.navLinks = document.querySelectorAll('.nav-link');
        this.sections = document.querySelectorAll('.content-section');
        this.init();
    }

    init() {
        // Add click event listeners to all nav links
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const sectionName = link.getAttribute('data-section');
                this.switchSection(sectionName);
                this.setActiveLink(link);
            });
        });
    }

    switchSection(sectionName) {
        // Hide all sections
        this.sections.forEach(section => {
            section.classList.add('hidden');
        });

        // Show the selected section
        const targetSection = document.getElementById(`${sectionName}-section`);
        if (targetSection) {
            setTimeout(() => {
                targetSection.classList.remove('hidden');
            }, 150);
        }
    }

    setActiveLink(activeLink) {
        // Remove active class from all links
        this.navLinks.forEach(link => {
            link.classList.remove('active');
        });

        // Add active class to clicked link
        activeLink.classList.add('active');
    }
}

// Dashboard Controller
class DashboardController {
    constructor() {
        this.charts = {
            line: null,
            pie: null,
            bar: null,
            modal: null,
            piePopup: null,
            modalPiePopup: null
        };

        this.selectedCompany = null;
        this.recommendationController = new RecommendationController(this);
        this.init();
    }

    async init() {
        console.log('🚀 Initializing dashboard...');

        // Load data
        const success = await dataProcessor.loadData();

        if (success) {
            this.setupCompanySelector();
            this.setupEventListeners();
            this.hideLoading();
        } else {
            this.showError('Failed to load data');
        }
    }

    hideLoading() {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.classList.add('hidden');
            loadingState.style.display = 'none'; // Force hide
        }
    }

    showError(message) {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.innerHTML = `<p style="color: var(--accent-red);">❌ ${message}</p>`;
        }
    }

    setupCompanySelector() {
        const companies = dataProcessor.getCompanyList();
        const companyList = document.getElementById('companyList');
        const selector = document.getElementById('companySelector');
        const selectorHeader = document.getElementById('selectorHeader');
        const selectorDropdown = document.getElementById('selectorDropdown');
        const searchInput = document.getElementById('companySearch');

        // Populate company list
        companies.forEach(company => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = company;
            item.addEventListener('click', () => {
                this.selectCompany(company);
                selector.classList.remove('open');
                selectorDropdown.classList.add('hidden');
            });
            companyList.appendChild(item);
        });

        // Toggle dropdown
        selectorHeader.addEventListener('click', () => {
            selector.classList.toggle('open');
            selectorDropdown.classList.toggle('hidden');
        });

        // Search functionality
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const items = companyList.querySelectorAll('.dropdown-item');
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(searchTerm) ? 'block' : 'none';
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!selector.contains(e.target)) {
                selector.classList.remove('open');
                selectorDropdown.classList.add('hidden');
            }
        });
    }

    selectCompany(companyName) {
        this.selectedCompany = companyName;
        dataProcessor.setSelectedCompany(companyName);

        // Update UI
        document.getElementById('selectedCompanyName').textContent = companyName;
        document.getElementById('dashboardContent').classList.remove('hidden');

        // Render all charts
        this.renderLineChart();
        this.renderPieChart();
        this.renderBarChart();
        this.renderCompanyDetails();

        // Refresh icons
        lucide.createIcons();
    }

    renderLineChart() {
        const data = dataProcessor.getTimeSeriesData();
        if (!data) return;

        const ctx = document.getElementById('lineChart');

        // Destroy existing chart
        if (this.charts.line) {
            this.charts.line.destroy();
        }

        this.charts.line = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Transactions',
                        data: data.transactions,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        yAxisID: 'y',
                        tension: 0.4
                    },
                    {
                        label: 'Revenue (USD)',
                        data: data.revenue,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false  // Hide legend in small view
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(51, 65, 85, 0.3)'
                        },
                        ticks: {
                            color: '#94a3b8',
                            maxRotation: 0,  // Keep labels horizontal
                            autoSkip: true,
                            maxTicksLimit: 6  // Limit number of labels
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: {
                            color: 'rgba(51, 65, 85, 0.3)'
                        },
                        ticks: {
                            color: '#3b82f6',
                            maxTicksLimit: 5  // Fewer ticks
                        },
                        title: {
                            display: false  // Hide title in small view
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            color: '#8b5cf6',
                            maxTicksLimit: 5  // Fewer ticks
                        },
                        title: {
                            display: false  // Hide title in small view
                        }
                    }
                }
            }
        });
    }

    renderPieChart() {
        const data = dataProcessor.getCategoryDistribution();
        if (!data) return;

        const ctx = document.getElementById('pieChart');

        if (this.charts.pie) {
            this.charts.pie.destroy();
        }

        this.charts.pie = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: [
                        '#3b82f6',
                        '#8b5cf6',
                        '#06b6d4',
                        '#10b981'
                    ],
                    borderWidth: 2,
                    borderColor: '#0f172a'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94a3b8',
                            padding: 10,
                            font: {
                                size: 11  // Smaller font for small view
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                return `${label}: $${value.toLocaleString()}`;
                            }
                        }
                    }
                }
                // Note: Hover popup removed from small view - only works in modal
            }
        });
    }

    showPiePopup(category) {
        const popup = document.getElementById('piePopup');
        const popupTitle = document.getElementById('popupTitle');

        popupTitle.textContent = `Top 10 ${category} Products`;
        popup.classList.remove('hidden');

        // Render popup chart
        const data = dataProcessor.getTop10ProductsByCategory(category);
        if (!data) return;

        const ctx = document.getElementById('piePopupChart');

        if (this.charts.piePopup) {
            this.charts.piePopup.destroy();
        }

        this.charts.piePopup = new Chart(ctx, {
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
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `Revenue: $${context.parsed.x.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(51, 65, 85, 0.3)'
                        },
                        ticks: {
                            color: '#94a3b8'
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: {
                                size: 11
                            }
                        }
                    }
                }
            }
        });

        lucide.createIcons();
    }

    showModalPiePopup(category) {
        const popup = document.getElementById('modalPiePopup');
        const popupTitle = document.getElementById('modalPopupTitle');

        popupTitle.textContent = `Top 10 ${category} Products`;
        popup.classList.remove('hidden');

        // Make popup draggable - CRITICAL: set these attributes
        popup.setAttribute('draggable', 'true');
        popup.setAttribute('data-category', category);
        popup.style.cursor = 'move'; // Clear visual indicator

        // Prevent child elements from blocking drag
        const popupHeader = popup.querySelector('.popup-header');
        const popupChart = popup.querySelector('.popup-chart-container');
        if (popupHeader) popupHeader.style.pointerEvents = 'none';
        if (popupChart) popupChart.style.pointerEvents = 'none';

        // Add drag event listeners to popup
        popup.ondragstart = (e) => {
            console.log('🚀 POPUP DRAG START!', category);

            // Make popup invisible but keep it in DOM (display:none breaks drag!)
            popup.style.opacity = '0';
            popup.style.pointerEvents = 'none';

            // ALSO make the modal semi-transparent so user can see sidebar!
            const modal = document.getElementById('chartModal');
            if (modal) {
                modal.style.opacity = '0.1';
                modal.style.pointerEvents = 'none';
            }

            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('chartType', 'category-top10');
            e.dataTransfer.setData('category', category);

            // Create custom drag image
            const dragImage = document.createElement('div');
            dragImage.style.width = '200px';
            dragImage.style.height = '120px';
            dragImage.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)';
            dragImage.style.borderRadius = '12px';
            dragImage.style.padding = '20px';
            dragImage.style.color = 'white';
            dragImage.style.fontWeight = 'bold';
            dragImage.style.fontSize = '14px';
            dragImage.style.display = 'flex';
            dragImage.style.alignItems = 'center';
            dragImage.style.justifyContent = 'center';
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-1000px';
            dragImage.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            dragImage.textContent = `📊 Top ${category}`;
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, 100, 60);
            setTimeout(() => document.body.removeChild(dragImage), 0);
        };

        popup.ondragend = () => {
            console.log('🏁 POPUP DRAG END');
            // Show popup again if drag ended without successful drop
            popup.style.opacity = '1';
            popup.style.pointerEvents = 'auto';
            popup.style.cursor = 'move';

            // Restore modal opacity
            const modal = document.getElementById('chartModal');
            if (modal) {
                modal.style.opacity = '1';
                modal.style.pointerEvents = 'auto';
            }

            // Re-enable child pointer events
            const popupHeader = popup.querySelector('.popup-header');
            const popupChart = popup.querySelector('.popup-chart-container');
            if (popupHeader) popupHeader.style.pointerEvents = 'auto';
            if (popupChart) popupChart.style.pointerEvents = 'auto';
        };

        // Render popup chart
        const data = dataProcessor.getTop10ProductsByCategory(category);
        if (!data) return;

        const ctx = document.getElementById('modalPiePopupChart');

        if (this.charts.modalPiePopup) {
            this.charts.modalPiePopup.destroy();
        }

        this.charts.modalPiePopup = new Chart(ctx, {
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
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `Revenue: $${context.parsed.x.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(51, 65, 85, 0.3)'
                        },
                        ticks: {
                            color: '#94a3b8'
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: {
                                size: 11
                            }
                        }
                    }
                }
            }
        });

        lucide.createIcons();
    }

    renderBarChart() {
        const data = dataProcessor.getTopSuppliers(this.selectedCompany);
        if (!data) return;

        const ctx = document.getElementById('barChart');

        if (this.charts.bar) {
            this.charts.bar.destroy();
        }

        this.charts.bar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Revenue (USD)',
                        data: data.revenue,
                        backgroundColor: '#8b5cf6',
                        borderRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Volume',
                        data: data.volume,
                        backgroundColor: '#3b82f6',
                        borderRadius: 6,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                indexAxis: 'x', // Vertical bars
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            title: (context) => context[0].label,
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#e2e8f0', // Lighter text for names
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: false,
                            font: { size: 10 }
                        }
                    },
                    y: {
                        position: 'left',
                        grid: {
                            color: 'rgba(51, 65, 85, 0.3)'
                        },
                        ticks: {
                            color: '#94a3b8',
                            callback: (value) => '$' + value.toLocaleString()
                        },
                        title: {
                            display: false
                        }
                    },
                    y1: {
                        display: false
                    }
                }
            }
        });
    }

    renderCompanyDetails() {
        const summary = dataProcessor.getCompanySummary();
        if (!summary) return;

        const detailsContainer = document.getElementById('companyDetails');

        if (detailsContainer) {
            const details = [
                { label: 'Name', value: summary.Name || this.selectedCompany || 'N/A' },
                { label: 'Location', value: summary.Location || 'N/A' }
            ];

            detailsContainer.innerHTML = details.map(detail => `
                <div class="detail-item">
                    <div class="detail-label">${detail.label}</div>
                    <div class="detail-value ${detail.highlight ? 'highlight' : ''}">${detail.value}</div>
                </div>
            `).join('');
        }
    }

    setupEventListeners() {
        // Close pie popup
        const closePieBtn = document.getElementById('closePiePopup');
        if (closePieBtn) {
            closePieBtn.addEventListener('click', () => {
                document.getElementById('piePopup').classList.add('hidden');
                if (this.charts.piePopup) {
                    this.charts.piePopup.destroy();
                    this.charts.piePopup = null;
                }
            });
        }

        // Close modal pie popup
        const closeModalPieBtn = document.getElementById('closeModalPiePopup');
        if (closeModalPieBtn) {
            closeModalPieBtn.addEventListener('click', () => {
                document.getElementById('modalPiePopup').classList.add('hidden');
                if (this.charts.modalPiePopup) {
                    this.charts.modalPiePopup.destroy();
                    this.charts.modalPiePopup = null;
                }
            });
        }

        // Expand buttons
        document.querySelectorAll('.expand-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const chartType = btn.getAttribute('data-chart');
                this.openModal(chartType);
            });
        });

        // Close modal
        const closeModalBtn = document.getElementById('closeModal');
        const modal = document.getElementById('chartModal');
        const overlay = modal.querySelector('.modal-overlay');

        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeModal());
        }
        if (overlay) {
            overlay.addEventListener('click', () => this.closeModal());
        }

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                document.getElementById('piePopup').classList.add('hidden');
                document.getElementById('modalPiePopup').classList.add('hidden');
            }
        });
    }

    openModal(chartType) {
        const modal = document.getElementById('chartModal');
        const modalTitle = document.getElementById('modalTitle');
        const ctx = document.getElementById('modalChart');

        // Set title
        const titles = {
            'line': 'Transactions & Revenue Over Time',
            'pie': 'Category Distribution (Hover to see top products)',
            'bar': 'Top 10 Buyers'
        };
        modalTitle.textContent = titles[chartType] || 'Chart';

        // Show modal
        modal.classList.remove('hidden');

        // Render chart in modal
        setTimeout(() => {
            if (this.charts.modal) {
                this.charts.modal.destroy();
            }

            let data, config;

            if (chartType === 'line') {
                data = dataProcessor.getTimeSeriesData();
                config = this.getLineChartConfig(data);
            } else if (chartType === 'pie') {
                data = dataProcessor.getCategoryDistribution();
                config = this.getPieChartConfig(data);
            } else if (chartType === 'bar') {
                data = dataProcessor.getTop10Buyers();
                // Reuse existing bar config but ensure indexAxis is y if needed for modal too, 
                // typically getBarChartConfig might need adjustment or we define it here.
                // For simplicity, let's use a specific config for the modal to ensure it looks good.
                config = {
                    type: 'bar',
                    data: {
                        labels: data.labels,
                        datasets: [
                            {
                                label: 'Revenue (USD)',
                                data: data.revenue,
                                backgroundColor: '#8b5cf6',
                                borderRadius: 6,
                                yAxisID: 'y'
                            },
                            {
                                label: 'Volume',
                                data: data.volume,
                                backgroundColor: '#3b82f6',
                                borderRadius: 6,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                ticks: { color: '#94a3b8' }
                            },
                            y1: {
                                display: false
                            }
                        }
                    }
                };
            }

            if (config) {
                this.charts.modal = new Chart(ctx, config);
            }

            lucide.createIcons();
        }, 100);
    }

    closeModal() {
        const modal = document.getElementById('chartModal');
        modal.classList.add('hidden');

        if (this.charts.modal) {
            this.charts.modal.destroy();
            this.charts.modal = null;
        }

        // Also hide the modal pie popup when closing modal
        const modalPiePopup = document.getElementById('modalPiePopup');
        if (modalPiePopup) {
            modalPiePopup.classList.add('hidden');
        }
        if (this.charts.modalPiePopup) {
            this.charts.modalPiePopup.destroy();
            this.charts.modalPiePopup = null;
        }
    }

    getLineChartConfig(data) {
        return {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Transactions',
                        data: data.transactions,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        yAxisID: 'y',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Revenue (USD)',
                        data: data.revenue,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#94a3b8',
                            font: { size: 14 }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(51, 65, 85, 0.3)' },
                        ticks: { color: '#94a3b8', font: { size: 12 } }
                    },
                    y: {
                        position: 'left',
                        grid: { color: 'rgba(51, 65, 85, 0.3)' },
                        ticks: { color: '#3b82f6' },
                        title: { display: true, text: 'Transactions', color: '#3b82f6' }
                    },
                    y1: {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#8b5cf6' },
                        title: { display: true, text: 'Revenue (USD)', color: '#8b5cf6' }
                    }
                }
            }
        };
    }

    getPieChartConfig(data) {
        // For modal view, add hover interaction to show popup
        const self = this;
        let lastHoveredCategory = null;
        let hoverTimeout = null;

        return {
            type: 'pie',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981'],
                    borderWidth: 3,
                    borderColor: '#0f172a',
                    hoverBorderWidth: 5,
                    hoverBorderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#94a3b8', font: { size: 14 }, padding: 20 }
                    },
                    tooltip: {
                        enabled: true,
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                return [`${label}: $${value.toLocaleString()}`, 'Hover or click to see top 10 products'];
                            }
                        }
                    }
                },
                onHover: (event, activeElements, chart) => {
                    // Skip hover during drag operations
                    if (window.dragDropController && window.dragDropController.isDragging) {
                        return;
                    }

                    // Change cursor to pointer when over a segment
                    event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';

                    // Clear any existing timeout
                    if (hoverTimeout) {
                        clearTimeout(hoverTimeout);
                        hoverTimeout = null;
                    }

                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const category = data.labels[index];

                        // Only update if hovering over a different category
                        if (category !== lastHoveredCategory) {
                            lastHoveredCategory = category;

                            // Add delay to hover (400ms) for smoother UX
                            hoverTimeout = setTimeout(() => {
                                self.showModalPiePopup(category);
                            }, 400);
                        }
                    } else {
                        // Mouse left all segments
                        if (lastHoveredCategory !== null) {
                            lastHoveredCategory = null;
                            // Don't auto-hide, let user close it manually
                        }
                    }
                },
                onClick: (event, activeElements) => {
                    // Clear hover timeout on click for immediate response
                    if (hoverTimeout) {
                        clearTimeout(hoverTimeout);
                        hoverTimeout = null;
                    }

                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const category = data.labels[index];
                        self.showModalPiePopup(category);  // Instant on click
                    }
                }
            }
        };
    }

    getBarChartConfig(data) {
        return {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Revenue (USD)',
                        data: data.revenue,
                        backgroundColor: '#8b5cf6',
                        borderRadius: 8,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Volume',
                        data: data.volume,
                        backgroundColor: '#3b82f6',
                        borderRadius: 8,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { size: 14 } }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 45 }
                    },
                    y: {
                        position: 'left',
                        grid: { color: 'rgba(51, 65, 85, 0.3)' },
                        ticks: { color: '#8b5cf6' },
                        title: { display: true, text: 'Revenue (USD)', color: '#8b5cf6' }
                    },
                    y1: {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#3b82f6' },
                        title: { display: true, text: 'Volume', color: '#3b82f6' }
                    }
                }
            }
        };
    }
}

// Drag and Drop Controller
class DragDropController {
    constructor(dashboardController) {
        this.dashboard = dashboardController;
        this.draggedCharts = [];
        this.draggedElement = null;
        this.isDragging = false;
        this.init();
    }

    init() {
        this.setupDragEvents();
        this.setupDropZone();
        this.setupClearButton();
    }

    setupDragEvents() {
        // Get all chart cards
        const chartCards = document.querySelectorAll('.chart-card[draggable="true"]');

        chartCards.forEach(card => {
            card.addEventListener('dragstart', (e) => this.handleDragStart(e));
            card.addEventListener('dragend', (e) => this.handleDragEnd(e));
        });
    }

    setupDropZone() {
        // Original drop zone in Control System section
        const dropZone = document.getElementById('chartDropZone');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
            dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            dropZone.addEventListener('drop', (e) => this.handleDrop(e));
        }

        // Make Control System nav link a drop target (trash bin mechanics!)
        const controlSystemLink = document.querySelector('.nav-link[data-section="control"]');
        if (controlSystemLink) {
            controlSystemLink.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                controlSystemLink.style.background = 'rgba(139, 92, 246, 0.3)';
                controlSystemLink.style.transform = 'translateX(10px) scale(1.05)';
            });

            controlSystemLink.addEventListener('dragleave', (e) => {
                controlSystemLink.style.background = '';
                controlSystemLink.style.transform = '';
            });

            controlSystemLink.addEventListener('drop', (e) => {
                e.preventDefault();
                controlSystemLink.style.background = '';
                controlSystemLink.style.transform = '';

                const chartType = e.dataTransfer.getData('chartType');
                const category = e.dataTransfer.getData('category'); // For category-specific charts
                if (!chartType) return;

                // Check if company is selected
                if (!this.dashboard.selectedCompany) {
                    alert('Please select a company first from the Overview section');
                    return;
                }

                console.log('📊 Dropped on Control System nav! Chart type:', chartType, 'Category:', category);

                // Add chart to collection
                this.addChart(chartType, category);

                // Auto-switch to Control System section
                controlSystemLink.click();
            });
        }
    }

    setupClearButton() {
        const clearBtn = document.getElementById('clearAllCharts');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAll());
        }
    }

    handleDragStart(e) {
        const chartCard = e.target.closest('.chart-card');
        if (!chartCard) return;

        this.isDragging = true;
        this.draggedElement = chartCard;
        chartCard.classList.add('dragging');

        const chartType = chartCard.getAttribute('data-chart-type');
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('chartType', chartType);

        // Create smaller custom drag image
        const dragImage = document.createElement('div');
        dragImage.style.width = '200px';
        dragImage.style.height = '120px';
        dragImage.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        dragImage.style.borderRadius = '12px';
        dragImage.style.padding = '20px';
        dragImage.style.color = 'white';
        dragImage.style.fontWeight = 'bold';
        dragImage.style.fontSize = '14px';
        dragImage.style.display = 'flex';
        dragImage.style.alignItems = 'center';
        dragImage.style.justifyContent = 'center';
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        dragImage.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        dragImage.textContent = `📊 ${this.getChartTitle(chartType)}`;
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 100, 60);
        setTimeout(() => document.body.removeChild(dragImage), 0);
    }

    handleDragEnd(e) {
        const chartCard = e.target.closest('.chart-card');
        if (chartCard) {
            chartCard.classList.remove('dragging');
        }
        this.draggedElement = null;
        this.isDragging = false;
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';

        const dropZone = e.currentTarget;
        dropZone.classList.add('drag-over');
    }

    handleDragLeave(e) {
        const dropZone = e.currentTarget;
        dropZone.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();

        const dropZone = document.getElementById('chartDropZone');
        dropZone.classList.remove('drag-over');

        const chartType = e.dataTransfer.getData('chartType');
        const category = e.dataTransfer.getData('category'); // For category-specific charts
        if (!chartType) return;

        // Check if company is selected
        if (!this.dashboard.selectedCompany) {
            alert('Please select a company first from the Overview section');
            return;
        }

        // Add chart to collection
        console.log('📊 Dropping chart type:', chartType, 'Category:', category);
        this.addChart(chartType, category);
    }

    addChart(chartType, category = null) {
        console.log('📊 addChart called:', chartType, category);

        // Check for duplicates - same type and category
        const isDuplicate = this.draggedCharts.some(chart => {
            if (chartType === 'category-top10' && category) {
                // For category charts, check both type and category
                return chart.type === chartType && chart.category === category;
            } else {
                // For regular charts, just check type
                return chart.type === chartType;
            }
        });

        if (isDuplicate) {
            const chartName = chartType === 'category-top10' && category
                ? `Top ${category} Products`
                : this.getChartTitle(chartType);
            console.log('⚠️ Duplicate chart detected:', chartName);
            alert(`"${chartName}" is already in your dashboard!`);
            return;
        }

        const chartConfig = {
            type: chartType,
            company: this.dashboard.selectedCompany,
            timestamp: new Date(),
            id: `chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            category: category // Store category for category-specific charts
        };

        console.log('✅ Adding chart config:', chartConfig);
        this.draggedCharts.push(chartConfig);
        console.log('📈 Total charts:', this.draggedCharts.length);
        this.renderDroppedCharts();
    }

    renderDroppedCharts() {
        console.log('🎨 renderDroppedCharts called, chart count:', this.draggedCharts.length);

        const container = document.getElementById('droppedChartsContainer');
        const section = document.getElementById('droppedChartsSection');
        const dropZone = document.getElementById('chartDropZone');

        console.log('📦 Elements found:', {
            container: !!container,
            section: !!section,
            dropZone: !!dropZone
        });

        if (!container || !section || !dropZone) {
            console.error('❌ Missing required elements for renderDroppedCharts');
            return;
        }

        // Show section, hide drop zone
        if (this.draggedCharts.length > 0) {
            section.style.display = 'block';
            dropZone.style.display = 'none';
            console.log('✅ Showing section, hiding drop zone');
        } else {
            section.style.display = 'none';
            dropZone.style.display = 'flex';
            console.log('✅ Hiding section, showing drop zone');
        }

        // Clear container
        container.innerHTML = '';

        // Render each chart
        this.draggedCharts.forEach((chart, index) => {
            const chartCard = this.createChartCard(chart, index);
            container.appendChild(chartCard);
        });

        // Render charts after DOM update
        setTimeout(() => {
            this.draggedCharts.forEach((chart, index) => {
                this.renderChartCanvas(chart, index);
            });
            lucide.createIcons();
        }, 50);
    }

    createChartCard(chart, index) {
        const card = document.createElement('div');
        card.className = 'dropped-chart';
        card.innerHTML = `
            <div class="dropped-chart-header">
                <div class="dropped-chart-info">
                    <h3>${this.getChartTitle(chart.type, chart.category)}</h3>
                    <p>${chart.company} • ${this.formatTime(chart.timestamp)}</p>
                </div>
                <button class="remove-chart-btn" data-index="${index}">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <div class="dropped-chart-container">
                <canvas id="dropped-chart-${chart.id}"></canvas>
            </div>
        `;

        // Add remove button event
        const removeBtn = card.querySelector('.remove-chart-btn');
        removeBtn.addEventListener('click', () => this.removeChart(index));

        return card;
    }

    renderChartCanvas(chart, index) {
        const canvas = document.getElementById(`dropped-chart-${chart.id}`);
        if (!canvas) return;

        let config;
        let data;

        // Get data based on chart type
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
            // Category-specific Top 10 Products chart
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

    removeChart(index) {
        this.draggedCharts.splice(index, 1);
        this.renderDroppedCharts();

        // Hide section if no charts
        if (this.draggedCharts.length === 0) {
            document.getElementById('droppedChartsSection').style.display = 'none';
            document.getElementById('chartDropZone').style.display = 'flex';
        }
    }

    clearAll() {
        if (this.draggedCharts.length === 0) return;

        if (confirm('Are you sure you want to clear all charts?')) {
            this.draggedCharts = [];
            document.getElementById('droppedChartsSection').style.display = 'none';
            document.getElementById('chartDropZone').style.display = 'flex';
            document.getElementById('droppedChartsContainer').innerHTML = '';
        }
    }

    getChartTitle(type, category = null) {
        if (type === 'category-top10' && category) {
            return `Top ${category} Products`;
        }
        const titles = {
            'line': 'Transactions & Revenue',
            'pie': 'Category Distribution',
            'bar': 'Top 10 Products'
        };
        return titles[type] || 'Chart';
    }

    formatTime(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;

        return date.toLocaleDateString();
    }
}

// Add subtle parallax effect to background
let mouseX = 0;
let mouseY = 0;
let currentX = 0;
let currentY = 0;

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
});

function animateBackground() {
    currentX += (mouseX * 30 - currentX) * 0.05;
    currentY += (mouseY * 30 - currentY) * 0.05;

    const background = document.querySelector('.app-background');
    if (background) {
        background.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }

    requestAnimationFrame(animateBackground);
}

animateBackground();
// Simplified Analysis Controller - AI chart analysis
class AnalysisController {
    constructor(dashboardController, dragDropController) {
        this.dashboard = dashboardController;
        this.dragDrop = dragDropController;

        // Load User API Key
        this.apiKeys = [];
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            this.apiKeys.push(savedKey);
        }

        this.currentKeyIndex = 0;

        this.setupEventListeners();

        // Expose for debugging
        window.analysisController = this;
    }

    async getValidApiKey() {
        if (this.apiKeys.length > 0) return this.apiKeys[0];

        // Prompt user if no key found
        const userKey = prompt("Setup Required: Please enter your Google Gemini API Key to enable AI features:");
        if (userKey && userKey.trim().length > 10) { // Basic validation
            localStorage.setItem('gemini_api_key', userKey.trim());
            this.apiKeys = [userKey.trim()];
            return userKey.trim();
        }
        return null;
    }

    setupEventListeners() {
        console.log('🔧 Setting up Analysis event listeners...');
        const analyzeBtn = document.getElementById('analyzeDashboard');
        const backBtn = document.getElementById('backToDashboard');

        console.log('🔍 Analyze Button found:', !!analyzeBtn);
        if (analyzeBtn) {
            // Remove old listeners by cloning (optional, but ensures clean slate)
            const newBtn = analyzeBtn.cloneNode(true);
            analyzeBtn.parentNode.replaceChild(newBtn, analyzeBtn);

            newBtn.addEventListener('click', (e) => {
                console.log('👆 Analyze Button CLICKED!');
                e.preventDefault(); // Prevent any default form submission if applicable
                this.startAnalysis();
            });
            console.log('✅ Click listener attached to Analyze Button');
        } else {
            console.error('❌ Analyze Button NOT found in DOM during setup');
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => this.closeSplitView());
        }
    }

    async startAnalysis() {
        console.log('🚀 Starting AI Analysis...');

        try {
            // Check for valid data first
            if (!this.dragDrop || !this.dragDrop.draggedCharts || this.dragDrop.draggedCharts.length === 0) {
                alert('No charts found! Please drag charts to the Control System first.');
                return;
            }

            // Show split view
            this.showSplitView();

            // Show initial loading state
            this.updateLoadingStatus('Capturing your charts...');
            const loadingEl = document.getElementById('analysisLoading');
            const resultEl = document.getElementById('analysisResult');

            if (loadingEl) loadingEl.classList.remove('hidden');
            if (resultEl) resultEl.classList.add('hidden');

            // Step 1: Capture Images
            const chartImages = await this.captureChartsAsImages();

            if (chartImages.length === 0) {
                throw new Error('Failed to capture chart images. Please try moving the charts and analyzing again.');
            }
            console.log(`📸 Captured ${chartImages.length} chart images`);

            // Step 2: Prepare Prompt
            this.updateLoadingStatus('Preparing consultant report...');
            const prompt = this.prepareAnalysisPrompt(chartImages.length);

            // Step 3: Call API with Timeout
            this.updateLoadingStatus('Consulting AI Analyst...');
            const analysis = await this.callGeminiAPI(chartImages, prompt);

            // Step 4: Display Results
            this.displayAnalysis(analysis);

        } catch (error) {
            console.error('❌ Analysis error:', error);

            const loadingEl = document.getElementById('analysisLoading');
            const resultEl = document.getElementById('analysisResult');
            const panelEl = document.getElementById('analysisPanel');

            // Ensure view is visible to show error
            if (panelEl) panelEl.style.display = 'flex';
            if (loadingEl) loadingEl.classList.add('hidden');
            if (resultEl) {
                resultEl.classList.remove('hidden');
                resultEl.innerHTML = `
                    <div style="color: #ef4444; padding: 20px; text-align: center;">
                        <h3>⚠️ Analysis Failed</h3>
                        <p>${error.message}</p>
                        <br>
                        <button onclick="window.location.reload()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Reload Page
                        </button>
                    </div>
                `;
            }

            alert(`Analysis Failed: ${error.message}`);
        }
    }

    showSplitView() {
        const panel = document.getElementById('analysisPanel');
        if (panel) {
            panel.style.display = 'flex';
            // Scroll right column to top
            panel.scrollTop = 0;
        }
    }

    closeSplitView() {
        const panel = document.getElementById('analysisPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    updateLoadingStatus(message) {
        const loadingEl = document.querySelector('#analysisLoading p');
        if (loadingEl) {
            loadingEl.textContent = message;
        } else {
            // Fallback if p tag missing
            const container = document.getElementById('analysisLoading');
            if (container) container.innerHTML = `<div class="loading-spinner"></div><p>${message}</p>`;
        }
    }

    async captureChartsAsImages() {
        const images = [];
        const charts = this.dragDrop.draggedCharts;

        for (const chart of charts) {
            const canvas = document.getElementById(`dropped-chart-${chart.id}`);
            if (canvas) {
                try {
                    // Use JPEG for faster upload/smaller size
                    const dataURL = canvas.toDataURL('image/jpeg', 0.8);
                    const base64 = dataURL.split(',')[1];

                    images.push({
                        inlineData: {
                            mimeType: 'image/jpeg',
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

        // System Instruction from core_analysis.py (SYS_INSTRUCTION_PERSONAL)
        return `You are a Senior Strategic Data Consultant. Your client is a C-Level Executive. 
You are analyzing a business dashboard for "${company}" that consists of ${chartCount} chart(s).

### 1. ANALYTICAL MINDSET
*   **Holistic View:** Do not analyze charts in isolation. Look for connections.
*   **The "So What?":** For every major trend, explain the business impact.
*   **Pareto Principle:** Focus heavily on the top 20% of drivers that create 80% of the value.
*   **Strict Honesty:** If data is unreadable, ambiguous, or missing, state "Data not actionable/visible."

### 2. REPORT STRUCTURE (Strict Markdown)

#### 🎯 Executive Bottom Line
*   **The Verdict:** A single, powerful sentence summarizing the overall business health.
*   **Critical KPI Snapshot:** The 3-4 most vital numbers with a status (✅ On Track / ⚠️ At Risk).

#### 🔗 Supply Chain & Trade Dynamics
*   **Import vs. Export:** Compare inflows and outflows.
*   **Margin/Value Check:** Compare Unit Prices of Imports vs. Exports.
*   **Inventory Signals:** (e.g., "High imports but low exports suggests a stockpile buildup.")

#### 🧠 Strategic Insights & Drivers
*   **Top Performers:** Who are the key Buyers/Suppliers driving the business?
*   **Concentration Risk:** Are we too dependent on one client or supplier?

#### 📉 Trends & Anomalies
*   **Red Flags:** Highlight sudden spikes, drops, or data gaps.

#### 💡 Actionable Recommendations
*   **Defensive Moves:** (e.g., "Diversify the supplier base...")
*   **Growth Opportunities:** (e.g., "Expand sales in region X...")`;
    }

    // Call Gemini API
    async callGeminiAPI(chartImages, prompt) {
        // Ensure we have a key
        const apiKey = await this.getValidApiKey();
        if (!apiKey) {
            throw new Error("API Key required. Please reload and provide a valid key.");
        }

        // Try user requested model first, then fallbacks
        const models = [
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash',
            'gemini-1.5-pro'
        ];

        let lastError = null;

        // Model Loop
        for (const model of models) {
            console.log(`🤖 Model: ${model} - Requesting...`);

            try {
                // Prepare multipart parts
                const parts = [{ text: prompt }];
                for (const img of chartImages) {
                    parts.push(img);
                }

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: parts }],
                        generationConfig: {
                            temperature: 0.4,
                            maxOutputTokens: 8192,
                        }
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    const errMsg = errData.error?.message || response.statusText;

                    // Handle Invalid Key specifically
                    if (response.status === 403 || errMsg.includes('API key')) {
                        localStorage.removeItem('gemini_api_key');
                        this.apiKeys = [];
                        throw new Error("Invalid API Key. Please reload and enter a new one.");
                    }

                    throw new Error(`Gemini API Error (${response.status}): ${errMsg}`);
                }

                const data = await response.json();
                console.log('✅ AI Response Received:', data);

                if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                    return data.candidates[0].content.parts[0].text;
                }

                throw new Error("Empty response from AI");

            } catch (error) {
                console.warn(`❌ Model ${model} failed:`, error);
                lastError = error;
                // If 403 (Key Error), stop trying other models and fail immediately
                if (error.message.includes("Invalid API Key")) throw error;
            }
        } // End Model Loop

        throw lastError || new Error('All AI models failed. Please check your network or key.');
    }

    async displayAnalysis(analysisText) {
        document.getElementById('analysisLoading').classList.add('hidden');
        const reportDiv = document.getElementById('analysisReport');
        reportDiv.classList.remove('hidden');
        reportDiv.innerHTML = ''; // Clear previous content

        // Fix Strikethrough Issue: Remove '~' characters that might trigger markdown <del>
        // Also ensure we don't accidentally create strikethrough with double tildes
        const cleanText = analysisText.replace(/~/g, '');

        if (typeof marked !== 'undefined') {
            // Streaming / Typewriter Effect
            let index = 0;
            const speed = 10; // ms per chunk
            const chunkSize = 15; // chars per chunk (Increased from 2 for faster speed)

            const typeWriter = () => {
                if (index < cleanText.length) {
                    index += chunkSize;
                    const currentText = cleanText.substring(0, index);

                    // Re-render markdown on each tick
                    // Note: marked handles unclosed tags gracefully usually
                    reportDiv.innerHTML = marked.parse(currentText);

                    // Auto-scroll to bottom of report panel
                    const panel = reportDiv.parentElement;
                    if (panel) panel.scrollTop = panel.scrollHeight;

                    setTimeout(typeWriter, speed);
                } else {
                    // Final render to ensure everything is perfect
                    reportDiv.innerHTML = marked.parse(cleanText);
                }
            };

            typeWriter();
        } else {
            // Fallback (non-streaming)
            reportDiv.innerHTML = `<pre style="white-space: pre-wrap;">${cleanText}</pre>`;
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


// Overview Controller for Filters and Charts
class OverviewController {
    constructor() {
        this.activeFilters = {
            hsCodes: [],
            categories: [],
            products: []
        };
        this.charts = {
            monthly: null,
            price: null,
            top: null
        };
        this.topViewType = 'Supplier'; // Default view
        this.init();
    }

    init() {
        // Wait for data processor to load
        const checkData = setInterval(() => {
            if (dataProcessor && dataProcessor.dailyData && dataProcessor.dailyData.length > 0) {
                clearInterval(checkData);
                console.log('🚀 Initializing Overview Controller...');

                // Initial Filter Render (All Data)
                this.renderFilters();
                this.setupEventListeners();
                this.updateDashboard();
            }
        }, 500);
    }

    setupEventListeners() {
        // Filter Containers
        ['filterHS', 'filterCategory', 'filterProduct'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (e) => {
                    if (e.target.type === 'checkbox') {
                        this.handleFilterChange(e);
                    }
                });
            }
        });

        // Top 10 View Type Toggle (Buttons)
        document.querySelectorAll('.toggle-btn[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active class from all
                document.querySelectorAll('.toggle-btn[data-view]').forEach(b => b.classList.remove('active'));
                // Add active to clicked
                e.target.classList.add('active');

                this.topViewType = e.target.getAttribute('data-view') === 'supplier' ? 'Supplier' : 'Buyer';
                this.updateDashboard(); // Re-render charts
            });
        });
    }

    handleFilterChange(e) {
        const type = e.target.name; // hs, category, product
        const value = e.target.value;
        const checked = e.target.checked;
        const map = { 'hs': 'hsCodes', 'category': 'categories', 'product': 'products' };
        const key = map[type];

        if (checked) {
            this.activeFilters[key].push(value);
        } else {
            this.activeFilters[key] = this.activeFilters[key].filter(v => v !== value);
        }

        console.log('Filters updated:', this.activeFilters);

        // Cascading Logic: Update downstream filters
        if (type === 'hs') this.renderFilters(['category', 'product']);
        if (type === 'category') this.renderFilters(['product']);

        // Update Charts
        this.updateDashboard();
    }

    // Render Filters
    renderFilters(targets = ['hs', 'category', 'product']) {
        // Get data context based on upstream filters
        let data = dataProcessor.dailyData;

        // HS Filter (Root)
        if (targets.includes('hs')) {
            const uniques = dataProcessor.getUniqueValues('HS_Code', data);
            this.renderCheckboxList('filterHS', uniques, 'hs', this.activeFilters.hsCodes);
        }

        // Apply HS Filter for Category Context
        if (this.activeFilters.hsCodes.length > 0) {
            data = data.filter(d => this.activeFilters.hsCodes.includes(String(d.HS_Code)));
        }

        // Category Filter
        if (targets.includes('category')) {
            const uniques = dataProcessor.getUniqueValues('Category', data);
            this.renderCheckboxList('filterCategory', uniques, 'category', this.activeFilters.categories);
        }

        // Apply Category Filter for Product Context
        if (this.activeFilters.categories.length > 0) {
            data = data.filter(d => this.activeFilters.categories.includes(d.Category));
        }

        // Product Filter
        if (targets.includes('product')) {
            const uniques = dataProcessor.getUniqueValues('Product', data);
            this.renderCheckboxList('filterProduct', uniques, 'product', this.activeFilters.products);
        }
    }

    renderCheckboxList(elementId, items, name, activeItems) {
        const container = document.getElementById(elementId);
        container.innerHTML = '';

        if (items.length === 0) {
            container.innerHTML = '<p style="padding:10px; color:#64748b; font-size:0.8rem;">No options available</p>';
            return;
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'filter-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = name;
            checkbox.value = item;
            checkbox.id = `${name}-${item}`;
            if (activeItems.includes(item)) checkbox.checked = true;

            const label = document.createElement('label');
            label.htmlFor = `${name}-${item}`;
            label.textContent = item;
            label.title = item; // Tooltip for long names

            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });
    }

    updateDashboard() {
        // Filter Data
        const filteredData = dataProcessor.filterData(this.activeFilters);

        // Aggregations
        const monthlyData = this.aggregateMonthly(filteredData);
        // Use new getTopEntities logic with current view type
        const topData = dataProcessor.getTopEntities(filteredData, this.topViewType);

        // Render Charts
        this.renderMonthlyChart(monthlyData);
        this.renderPriceChart(monthlyData); // Reuse monthly for price trend
        this.renderTopChart(topData);
    }

    aggregateMonthly(data) {
        const months = {};
        data.forEach(d => {
            // d.Date_Trade is Date object from SheetJS cellDates: true
            if (!d.Date_Trade) return;
            // Format YYYY-MM
            const date = new Date(d.Date_Trade);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!months[key]) months[key] = { revenue: 0, amount: 0, count: 0 };

            months[key].revenue += d.Total_Price || 0;
            months[key].amount += d.Total_Amount || 0;
            months[key].count += 1;
        });

        // Convert to array and sort
        return Object.keys(months).sort().map(key => {
            const revenue = months[key].revenue;
            const amount = months[key].amount;
            // Weighted Average Unit Price = Total Revenue / Total Volume
            const avgPrice = amount !== 0 ? (revenue / amount) : 0;

            return {
                month: key,
                revenue: revenue,
                amount: amount,
                avgPrice: avgPrice
            };
        });
    }

    // Chart 1: Monthly Trend (Bar: Revenue, Line: Volume)
    renderMonthlyChart(data) {
        const ctx = document.getElementById('ovMonthlyChart');
        if (!ctx) return;

        if (this.charts.monthly) this.charts.monthly.destroy();

        this.charts.monthly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.month),
                datasets: [
                    {
                        label: 'Total Revenue ($)',
                        data: data.map(d => d.revenue),
                        backgroundColor: '#8b5cf6',
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Volume (Units)',
                        data: data.map(d => d.amount),
                        type: 'line',
                        borderColor: '#06b6d4',
                        backgroundColor: '#06b6d4',
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 3,
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { color: '#94a3b8' } } },
                scales: {
                    x: { grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: '#94a3b8' } },
                    y: {
                        type: 'linear', display: true, position: 'left',
                        grid: { color: 'rgba(51, 65, 85, 0.3)' },
                        ticks: { color: '#94a3b8', callback: v => '$' + v.toLocaleString() }
                    },
                    y1: {
                        type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false },
                        ticks: { color: '#06b6d4' }
                    }
                }
            }
        });
    }

    // Chart 2: Avg Price Trend (Line)
    renderPriceChart(data) {
        const ctx = document.getElementById('ovPriceChart');
        if (!ctx) return;

        if (this.charts.price) this.charts.price.destroy();

        this.charts.price = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.month),
                datasets: [{
                    label: 'Avg Unit Price ($)',
                    data: data.map(d => d.avgPrice),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                    y: { grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    }

    // Chart 3: Top 10 Suppliers (Multi-Bar: Revenue & Volume)
    renderTopChart(data) {
        const ctx = document.getElementById('ovTopChart');
        if (!ctx) return;

        if (this.charts.top) this.charts.top.destroy();

        // data comes in as array of { name, revenue, volume }
        this.charts.top = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.name),
                datasets: [
                    {
                        label: 'Revenue ($)',
                        data: data.map(d => d.revenue),
                        backgroundColor: '#8b5cf6',
                        yAxisID: 'y',
                        borderRadius: 4,
                        maxBarThickness: 40
                    },
                    {
                        label: 'Volume',
                        data: data.map(d => d.volume),
                        backgroundColor: '#3b82f6',
                        yAxisID: 'y1',
                        borderRadius: 4,
                        maxBarThickness: 40
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true } }, // Show legend for clarity
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#94a3b8',
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        position: 'left',
                        grid: { color: 'rgba(51, 65, 85, 0.3)' },
                        ticks: {
                            color: '#94a3b8',
                            callback: v => '$' + (v / 1000).toFixed(0) + 'k'
                        },
                        title: { display: true, text: 'Revenue', color: '#8b5cf6' }
                    },
                    y1: {
                        position: 'right',
                        display: true,
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#3b82f6' },
                        title: { display: true, text: 'Volume', color: '#3b82f6' }
                    }
                }
            }
        });
    }
}

// Global Error Handler
window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled rejection:', event.reason);
    const errDiv = document.createElement('div');
    errDiv.style.position = 'fixed';
    errDiv.style.bottom = '10px';
    errDiv.style.right = '10px';
    errDiv.style.background = 'rgba(239, 68, 68, 0.9)';
    errDiv.style.color = 'white';
    errDiv.style.padding = '10px';
    errDiv.style.borderRadius = '4px';
    errDiv.style.zIndex = '99999';
    errDiv.innerText = `Async Error: ${event.reason}`;
    document.body.appendChild(errDiv);
});

window.addEventListener('error', event => {
    console.error('Global error:', event.error);
    const errDiv = document.createElement('div');
    errDiv.style.position = 'fixed';
    errDiv.style.bottom = '50px';
    errDiv.style.right = '10px';
    errDiv.style.background = 'rgba(239, 68, 68, 0.9)';
    errDiv.style.color = 'white';
    errDiv.style.padding = '10px';
    errDiv.style.borderRadius = '4px';
    errDiv.style.zIndex = '99999';
    errDiv.innerText = `Global Error: ${event.message}`;
    document.body.appendChild(errDiv);
});

// Initialize controllers
try {
    console.log('🚀 Bootstrapping controllers...');
    if (typeof NavigationController === 'undefined') throw new Error('NavigationController not defined');
    if (typeof DashboardController === 'undefined') throw new Error('DashboardController not defined');

    const navigation = new NavigationController();
    const dashboard = new DashboardController();

    // Overview might be optional/new, check definition
    let overview;
    if (typeof OverviewController !== 'undefined') {
        overview = new OverviewController();
    } else {
        console.warn('OverviewController not defined');
    }

    const dragDrop = new DragDropController(dashboard);

    // Make dragDrop globally accessible for hover check
    window.dragDropController = dragDrop;

    // Initialize AI Analysis Controller
    const analysisController = new AnalysisController(dashboard, dragDrop);

    console.log('🚀 Application initialized successfully!');

    // Fail-safe: Force hide loading after 3 seconds (reduced) if still visible
    setTimeout(() => {
        const loading = document.getElementById('loadingState');
        if (loading) {
            console.warn('⚠️ Loading state stuck? Removing from DOM.');
            loading.remove(); // NUCLEAR OPTION: Remove it entirely
        }
    }, 3000);

} catch (error) {
    console.error('CRITICAL ERROR:', error);
    const container = document.getElementById('loadingState');
    if (container) {
        container.innerHTML = `<p style="color:red; font-weight:bold;">CRITICAL ERROR: ${error.message}</p><p>${error.stack}</p>`;
    } else {
        alert('Application Error: ' + error.message);
    }
}
