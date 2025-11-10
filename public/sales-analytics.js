document.addEventListener('DOMContentLoaded', () => {
    // FIX 1: Helper function to get the actual value of a CSS variable
    const getCssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    // Globals
    let salesTrendChart, comparisonBarChart, comparisonPieChart, comparisonLineChart;
    let comparisonItems = [];
    let poComparisonItems = []; // NEW: For PO analytics

    // ===================================
    // UI Elements - Sales Analytics
    // ===================================
    const searchInput = document.getElementById('item-search');
    const suggestionsContainer = document.getElementById('search-suggestions');
    const branchFilter = document.getElementById('branch-filter');
    const resetButton = document.getElementById('reset-view');
    const comparisonTagsContainer = document.getElementById('comparison-tags');
    const overviewSection = document.getElementById('overview-section');
    const singleItemSection = document.getElementById('single-item-section');
    const comparisonSection = document.getElementById('comparison-section');
    const overviewLoader = document.getElementById('overview-loader');
    const overviewTable = document.getElementById('overview-table');

    // ===================================
    // UI Elements - PO Analytics (NEW)
    // ===================================
    const poItemSearch = document.getElementById('po-item-search');
    const poSuggestionsContainer = document.getElementById('po-search-suggestions');
    const poBranchFilter = document.getElementById('po-branch-filter');
    const poAnalyzeBtn = document.getElementById('analyze-po-btn');
    const poTagsContainer = document.getElementById('po-comparison-tags');
    const poLoader = document.getElementById('po-loader');
    const poSuggestionsResultContainer = document.getElementById('po-suggestions-container');

    // ===================================
    // UI Elements - Tabs (NEW)
    // ===================================
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // ===================================
    // Tab Switching Logic (NEW)
    // ===================================
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Update button active state
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show/hide content
            tabContents.forEach(content => {
                if (content.id === targetTab) {
                    content.classList.remove('hidden');
                } else {
                    content.classList.add('hidden');
                }
            });
        });
    });

    // --- INITIALIZATION ---
    function initializeDashboard() {
        fetchTopSellers();
        resetView();
        setupEventListeners();
    }
    
    function resetView() {
        comparisonItems = [];
        updateComparisonTags();
        searchInput.value = '';
        
        overviewSection.classList.remove('hidden');
        singleItemSection.classList.add('hidden');
        comparisonSection.classList.add('hidden');
    }

    // --- DATA FETCHING ---
    async function fetchTopSellers() {
        overviewLoader.classList.remove('hidden');
        overviewTable.classList.add('hidden');
        
        const periods = ['weekly', 'monthly', 'quarterly', 'yearly'];
        const promises = periods.map(p => fetch(`/api/analytics/top-seller?period=${p}`).then(res => res.json()));
        
        try {
            const results = await Promise.all(promises);
            const tableBody = overviewTable.querySelector('tbody');
            tableBody.innerHTML = ''; 

            results.forEach((data, index) => {
                const row = tableBody.insertRow();
                const period = periods[index].charAt(0).toUpperCase() + periods[index].slice(1);
                
                row.innerHTML = `
                    <td>${period}</td>
                    <td>${data.item_name || 'N/A'}</td>
                    <td>${data.total_units ? parseFloat(data.total_units).toFixed(2) : '0'}</td>
                    <td>${data.total_sales ? parseFloat(data.total_sales).toFixed(3) : '0.000'}</td>
                `;
            });
            
            overviewLoader.classList.add('hidden');
            overviewTable.classList.remove('hidden');
        } catch (error) {
            console.error('Error fetching top sellers:', error);
            overviewLoader.textContent = 'Failed to load summary data.';
        }
    }
    
    // --- UI UPDATES ---
    function updateView() {
        overviewSection.classList.add('hidden');
        singleItemSection.classList.add('hidden');
        comparisonSection.classList.add('hidden');
        
        if (comparisonItems.length === 1) {
            singleItemSection.classList.remove('hidden');
            displaySingleItemView(comparisonItems[0]);
        } else if (comparisonItems.length > 1) {
            comparisonSection.classList.remove('hidden');
            displayComparisonView(comparisonItems);
        } else {
            overviewSection.classList.remove('hidden');
        }
    }
    
    function updateComparisonTags() {
        comparisonTagsContainer.innerHTML = '';
        comparisonItems.forEach(item => {
            const tag = document.createElement('div');
            tag.className = 'tag';
            tag.innerHTML = `${item} <span class="remove-tag" data-item="${item}">&times;</span>`;
            comparisonTagsContainer.appendChild(tag);
        });
    }

    // --- SINGLE ITEM VIEW ---
    async function displaySingleItemView(itemName) {
        document.getElementById('single-item-title').textContent = `Analytics for: ${itemName}`;
        
        try {
            const res = await fetch(`/api/pos/medicines/get-by-name/${encodeURIComponent(itemName)}`);
            const data = await res.json();
            const infoCard = document.getElementById('item-info-card');
            infoCard.innerHTML = `
                <h3>Item Details</h3>
                <ul>
                    <li><span class="label">Arabic Name:</span> <span>${data.arabic_name || 'N/A'}</span></li>
                    <li><span class="label">Active Ingredient:</span> <span>${data.active_name_1 || 'N/A'}</span></li>
                    <li><span class="label">Supplier:</span> <span>${data.supplier || 'N/A'}</span></li>
                    <li><span class="label">Price (OMR):</span> <span>${parseFloat(data.price || 0).toFixed(3)}</span></li>
                    <li><span class="label">Stock:</span> <span>${parseFloat(data.stock || 0).toFixed(2)}</span></li>
                    <li><span class="label">Uses:</span> <span>${data.uses || 'N/A'}</span></li>
                </ul>
            `;
        } catch (error) {
            console.error('Error fetching item details:', error);
             document.getElementById('item-info-card').innerHTML = '<p>Could not load item details.</p>';
        }

        try {
            const branch = branchFilter.value;
            const res = await fetch(`/api/analytics/item-trend?itemName=${encodeURIComponent(itemName)}&groupBy=monthly&branch=${branch}`);
            
            if (!res.ok) {
                throw new Error(`Server returned an error: ${res.status}`);
            }
            
            const trendData = await res.json();
            
            if (!Array.isArray(trendData)) {
                throw new TypeError('Expected an array for trend data, but received an object.');
            }
            
            const labels = [...new Set(trendData.map(d => d.period))].sort();
            const salesData = labels.map(label => {
                return trendData.filter(d => d.period === label).reduce((sum, current) => sum + parseFloat(current.total_sales), 0);
            });
            
            renderLineChart('sales-trend-chart', `Monthly Sales Trend`, {
                labels,
                datasets: [{
                    label: 'Total Sales (OMR)',
                    data: salesData,
                    borderColor: 'rgba(193, 169, 94, 1)',
                    backgroundColor: 'rgba(193, 169, 94, 0.2)',
                    fill: true,
                    tension: 0.1
                }]
            }, salesTrendChart, (chart) => { salesTrendChart = chart; });

        } catch (error) {
            console.error('Error fetching sales trend:', error);
            if (salesTrendChart) salesTrendChart.destroy();
        }
    }

    // --- MULTI-ITEM COMPARISON VIEW ---
    async function displayComparisonView(items) {
        try {
            const branch = branchFilter.value;
            const res = await fetch('/api/analytics/compare-items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemNames: items, branch: branch })
            });
            const data = await res.json();
            
            const periods = [...new Set(data.map(d => d.period))].sort();
            const datasetsBar = [];
            const datasetsLine = [];
            const itemTotals = {};
            const colors = ['#c1a95e', '#a9a9a9', '#f4a460', '#87ceeb', '#90ee90'];

            items.forEach((item, i) => {
                const itemData = data.filter(d => d.item_name === item);
                const color = colors[i % colors.length];
                
                const salesByPeriod = periods.map(p => {
                    const periodData = itemData.find(d => d.period === p);
                    return periodData ? parseFloat(periodData.total_sales) : 0;
                });
                
                datasetsBar.push({ label: item, data: salesByPeriod, backgroundColor: color });
                datasetsLine.push({ label: item, data: salesByPeriod, borderColor: color, fill: false, tension: 0.1 });
                
                itemTotals[item] = itemData.reduce((sum, d) => sum + parseFloat(d.total_sales), 0);
            });

            renderBarChart('comparison-bar-chart', 'Monthly Sales Comparison', { labels: periods, datasets: datasetsBar }, comparisonBarChart, (chart) => { comparisonBarChart = chart; });
            renderPieChart('comparison-pie-chart', 'Total Sales Share', { labels: items, datasets: [{ data: Object.values(itemTotals), backgroundColor: colors.slice(0, items.length) }] }, comparisonPieChart, (chart) => { comparisonPieChart = chart; });
            renderLineChart('comparison-line-chart', 'Sales Trend Comparison', { labels: periods, datasets: datasetsLine }, comparisonLineChart, (chart) => { comparisonLineChart = chart; });

        } catch (error) {
            console.error('Error fetching comparison data:', error);
        }
    }

    // --- CHART RENDERING ---
    function renderLineChart(canvasId, title, data, chartInstance, setInstance) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (chartInstance) chartInstance.destroy();
        
        const newChartInstance = new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { title: { display: true, text: title, color: getCssVar('--text-light'), font: { size: 16 } } },
                scales: { 
                    x: { ticks: { color: getCssVar('--text-muted') }, grid: { color: getCssVar('--border-color') } },
                    y: { ticks: { color: getCssVar('--text-muted') }, grid: { color: getCssVar('--border-color') } }
                }
            }
        });
        setInstance(newChartInstance);
    }

    function renderBarChart(canvasId, title, data, chartInstance, setInstance) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (chartInstance) chartInstance.destroy();
        const newChartInstance = new Chart(ctx, {
            type: 'bar',
            data: data,
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { title: { display: true, text: title, color: getCssVar('--text-light'), font: { size: 16 } } },
                scales: { 
                    x: { ticks: { color: getCssVar('--text-muted') }, grid: { color: getCssVar('--border-color') } },
                    y: { ticks: { color: getCssVar('--text-muted') }, grid: { color: getCssVar('--border-color') } }
                }
            }
        });
        setInstance(newChartInstance);
    }

    function renderPieChart(canvasId, title, data, chartInstance, setInstance) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (chartInstance) chartInstance.destroy();
        const newChartInstance = new Chart(ctx, {
            type: 'pie',
            data: data,
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { title: { display: true, text: title, color: getCssVar('--text-light'), font: { size: 16 } } }
            }
        });
        setInstance(newChartInstance);
    }
    
    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        let debounceTimer;
        searchInput.addEventListener('keyup', (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value;
            if (query.length < 2) {
                suggestionsContainer.classList.add('hidden');
                return;
            }
            debounceTimer = setTimeout(async () => {
                const res = await fetch(`/api/pos/medicines/search?q=${encodeURIComponent(query)}`);
                const suggestions = await res.json();
                
                suggestionsContainer.innerHTML = '';
                if (suggestions.length > 0) {
                    suggestions.forEach(s => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.textContent = s.item_name;
                        div.addEventListener('click', () => {
                            if (!comparisonItems.includes(s.item_name)) {
                                comparisonItems.push(s.item_name);
                                updateComparisonTags();
                                updateView();
                            }
                            searchInput.value = '';
                            suggestionsContainer.classList.add('hidden');
                        });
                        suggestionsContainer.appendChild(div);
                    });
                    suggestionsContainer.classList.remove('hidden');
                } else {
                    suggestionsContainer.classList.add('hidden');
                }
            }, 300);
        });

        comparisonTagsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-tag')) {
                const itemToRemove = e.target.dataset.item;
                comparisonItems = comparisonItems.filter(item => item !== itemToRemove);
                updateComparisonTags();
                updateView();
            }
        });

        branchFilter.addEventListener('change', updateView);
        resetButton.addEventListener('click', resetView);

        document.addEventListener('click', (e) => {
            if (!suggestionsContainer.contains(e.target) && e.target !== searchInput) {
                suggestionsContainer.classList.add('hidden');
            }
            // NEW: Hide PO suggestions
            if (!poSuggestionsContainer.contains(e.target) && e.target !== poItemSearch) {
                poSuggestionsContainer.classList.add('hidden');
            }
        });

        // ===================================
        // PO Analytics Event Listeners (NEW)
        // ===================================
        
        // Search for PO items
        let poDebounceTimer;
        poItemSearch.addEventListener('keyup', (e) => {
            clearTimeout(poDebounceTimer);
            const query = e.target.value;
            if (query.length < 2) {
                poSuggestionsContainer.classList.add('hidden');
                return;
            }
            poDebounceTimer = setTimeout(async () => {
                const res = await fetch(`/api/pos/medicines/search?q=${encodeURIComponent(query)}`);
                const suggestions = await res.json();
                
                poSuggestionsContainer.innerHTML = '';
                if (suggestions.length > 0) {
                    suggestions.forEach(s => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.textContent = s.item_name;
                        div.addEventListener('click', () => {
                            if (!poComparisonItems.includes(s.item_name)) {
                                poComparisonItems.push(s.item_name);
                                updatePoComparisonTags();
                            }
                            poItemSearch.value = '';
                            poSuggestionsContainer.classList.add('hidden');
                        });
                        poSuggestionsContainer.appendChild(div);
                    });
                    poSuggestionsContainer.classList.remove('hidden');
                } else {
                    poSuggestionsContainer.classList.add('hidden');
                }
            }, 300);
        });

        // Remove PO tag
        poTagsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-tag')) {
                const itemToRemove = e.target.dataset.item;
                poComparisonItems = poComparisonItems.filter(item => item !== itemToRemove);
                updatePoComparisonTags();
            }
        });
        
        // Analyze Button Click
        poAnalyzeBtn.addEventListener('click', analyzePurchaseOrder);

    } // --- End of setupEventListeners ---


    // --- PO Analytics Functions (NEW) ---

    function updatePoComparisonTags() {
        poTagsContainer.innerHTML = '';
        poComparisonItems.forEach(item => {
            const tag = document.createElement('div');
            tag.className = 'tag';
            tag.innerHTML = `${item} <span class="remove-tag" data-item="${item}">&times;</span>`;
            poTagsContainer.appendChild(tag);
        });
    }

    async function analyzePurchaseOrder() {
        const branch = poBranchFilter.value;
        if (!branch) {
            alert('Please select a branch.');
            return;
        }
        if (poComparisonItems.length === 0) {
            alert('Please add at least one item to analyze.');
            return;
        }

        poLoader.classList.remove('hidden');
        poSuggestionsResultContainer.innerHTML = '';
        poAnalyzeBtn.disabled = true;

        try {
            const res = await fetch('/api/analytics/purchase-suggestion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemNames: poComparisonItems, branch: branch })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Failed to fetch suggestions.');
            }

            const suggestions = await res.json();
            renderPoSuggestions(suggestions);

        } catch (error) {
            console.error('Error fetching PO suggestions:', error);
            poSuggestionsResultContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        } finally {
            poLoader.classList.add('hidden');
            poAnalyzeBtn.disabled = false;
        }
    }

    function renderPoSuggestions(suggestions) {
        if (!suggestions || suggestions.length === 0) {
            poSuggestionsResultContainer.innerHTML = '<p>No data found for the selected items and branch.</p>';
            return;
        }

        // *** FIX: Corrected table headers ***
        let table = `
            <table class="po-suggestions-table">
                <thead>
                    <tr>
                        <th>Item Name</th>
                        <th>Branch</th>
                        <th>Current Stock (Packages)</th>
                        <th>Avg. Daily Sales (Packets)</th>
                        <th>Suggested Purchase (Packages)</th>
                        <th>Analysis</th>
                    </tr>
                </thead>
                <tbody>
        `;

        suggestions.forEach(item => {
            table += `
                <tr>
                    <td>${item.item_name}</td>
                    <td>${item.branch}</td>
                    <td style="text-align: center;">${item.current_stock_packets.toFixed(2)}</td>
                    <td style="text-align: center;">${item.avg_daily_packets_sold.toFixed(2)}</td>
                    <td class="suggested-qty">${item.suggested_purchase_quantity}</td>
                    <td class="analysis-text">${item.analysis}</td>
                </tr>
            `;
        });

        table += `</tbody></table>`;
        poSuggestionsResultContainer.innerHTML = table;
    }


    // --- START ---
    initializeDashboard();
    fetchUserInfo(); 

    
    // --- User Info Fetcher ---
    function fetchUserInfo() {
        fetch('/api/user-info')
            .then(response => response.json())
            .then(data => {
            const user = data.user;
            if (user) {
                document.getElementById('user-name').textContent = user.fullName;
                document.getElementById('user-job-title').textContent = user.jobTitle;
                const userPhoto = document.getElementById('user-photo');
                if (userPhoto) {
                    userPhoto.onerror = () => { userPhoto.src = 'images/default-profile.png'; };
                    userPhoto.src = `/api/user-photo/${user.userId}`;
                }
            }
            })
            .catch(() => console.error('Could not fetch user info.'));
    }
});