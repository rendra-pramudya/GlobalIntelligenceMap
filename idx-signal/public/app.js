// Global state
let allStocks = [];
let filteredStocks = [];
let selectedStock = null;
let chartInstance = null;
let gridStocks = [];
let gridViewActive = false;
let gridCharts = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    initializeTheme();
    await loadStocks();
    setupEventListeners();
    updateStockCount();
});

// Theme management
function initializeTheme() {
    const theme = localStorage.getItem('theme') || 'auto';
    if (theme !== 'auto') {
        document.documentElement.setAttribute('data-theme', theme);
    }
    updateThemeButton();
}

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') || 'auto';
    const next = current === 'dark' ? 'light' : current === 'light' ? 'auto' : 'dark';

    if (next === 'auto') {
        html.removeAttribute('data-theme');
    } else {
        html.setAttribute('data-theme', next);
    }
    localStorage.setItem('theme', next);
    updateThemeButton();
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    if (selectedStock) {
        renderChart(selectedStock);
    }
}

function updateThemeButton() {
    const theme = document.documentElement.getAttribute('data-theme') || 'auto';
    const btn = document.querySelector('.theme-toggle');
    btn.textContent = theme === 'dark' ? '☀️' : theme === 'light' ? '🌙' : '⚙️';
}

// Grid view management
function toggleGridView() {
    gridViewActive = !gridViewActive;
    const container = document.getElementById('gridViewContainer');
    const btn = document.getElementById('gridViewBtn');

    if (gridViewActive) {
        container.style.display = 'flex';
        btn.classList.add('active');
        if (gridStocks.length === 0 && selectedStock) {
            addToGrid(selectedStock);
        }
        renderGridView();
    } else {
        container.style.display = 'none';
        btn.classList.remove('active');
        destroyGridCharts();
    }
}

function addToGrid(stock) {
    if (!gridStocks.find(s => s.code === stock.code)) {
        gridStocks.push(stock);
        if (gridViewActive) {
            renderGridView();
        }
    }
}

function removeFromGrid(code) {
    gridStocks = gridStocks.filter(s => s.code !== code);
    if (gridCharts[code]) {
        gridCharts[code].destroy();
        delete gridCharts[code];
    }
    if (gridViewActive) {
        renderGridView();
    }
}

function destroyGridCharts() {
    Object.values(gridCharts).forEach(chart => {
        if (chart) chart.destroy();
    });
    gridCharts = {};
}

async function renderGridView() {
    const container = document.getElementById('gridViewContent');
    container.innerHTML = '';

    for (const stock of gridStocks) {
        const card = document.createElement('div');
        card.className = 'grid-stock-card';

        const priceChange = stock.price_change_percent || 0;
        const changeClass = priceChange < 0 ? 'negative' : 'positive';
        const signalClass = getSignalClass(stock.signal.recommendation);

        card.innerHTML = `
            <div class="grid-card-header">
                <div class="grid-card-title">
                    <div class="grid-card-code">${stock.code}</div>
                    <div class="grid-card-name">${stock.name}</div>
                </div>
                <div class="grid-card-badge ${signalClass}">${stock.signal.recommendation}</div>
            </div>
            <div class="grid-card-price">
                <div class="grid-card-price-value">Rp ${Math.round(stock.currentPrice).toLocaleString()}</div>
                <div class="grid-card-price-change ${changeClass}">${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%</div>
            </div>
            <div class="grid-card-chart">
                <canvas id="gridChart-${stock.code}"></canvas>
            </div>
            <div class="grid-card-metrics">
                <div class="grid-metric-item">
                    <span class="grid-metric-label">P/E</span>
                    <span class="grid-metric-value">${stock.pe_ratio ? stock.pe_ratio.toFixed(1) : '-'}</span>
                </div>
                <div class="grid-metric-item">
                    <span class="grid-metric-label">RSI</span>
                    <span class="grid-metric-value">${stock.rsi ? stock.rsi.toFixed(0) : '-'}</span>
                </div>
                <div class="grid-metric-item">
                    <span class="grid-metric-label">ROE</span>
                    <span class="grid-metric-value">${stock.roe ? stock.roe.toFixed(1) : '-'}%</span>
                </div>
                <div class="grid-metric-item">
                    <span class="grid-metric-label">Vol</span>
                    <span class="grid-metric-value">${stock.volume ? (stock.volume / 1000000).toFixed(1) : '-'}M</span>
                </div>
            </div>
            <button class="remove-grid-btn" style="margin-top: 8px; padding: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 3px; color: var(--text-secondary); cursor: pointer; font-size: 11px; width: 100%;">Remove</button>
        `;

        card.querySelector('.remove-grid-btn').addEventListener('click', () => removeFromGrid(stock.code));
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('remove-grid-btn')) {
                toggleGridView();
                selectStock(stock);
            }
        });

        container.appendChild(card);

        // Render mini chart
        await renderGridChart(stock);
    }
}

async function renderGridChart(stock) {
    try {
        const response = await fetch(`/api/charts/${stock.code}`);
        const data = await response.json();

        if (gridCharts[stock.code]) {
            gridCharts[stock.code].destroy();
        }

        const ctx = document.getElementById(`gridChart-${stock.code}`).getContext('2d');
        const buyColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-buy');

        gridCharts[stock.code] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.priceHistory.map((_, i) => i),
                datasets: [{
                    label: 'Price',
                    data: data.priceHistory,
                    borderColor: buyColor,
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointBackgroundColor: buyColor,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'var(--bg-secondary)',
                        titleColor: 'var(--text-primary)',
                        bodyColor: 'var(--text-secondary)',
                        borderColor: 'var(--border-color)',
                        borderWidth: 1,
                        padding: 8,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return 'Rp ' + Math.round(context.parsed.y).toLocaleString();
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        display: false,
                        grid: { display: false }
                    },
                    x: {
                        display: false,
                        grid: { display: false }
                    }
                }
            }
        });
    } catch (error) {
        console.error(`Error rendering grid chart for ${stock.code}:`, error);
    }
}

// Load stocks from API
async function loadStocks() {
    try {
        updateStatus('Loading stocks...');
        const response = await fetch('/api/stocks');
        const data = await response.json();
        allStocks = data.stocks;
        filteredStocks = allStocks;
        renderWatchlist();

        if (allStocks.length > 0) {
            selectStock(allStocks[0]);
        }

        updateStatus('Ready');
    } catch (error) {
        console.error('Error loading stocks:', error);
        updateStatus('Error loading stocks');
    }
}

// Render watchlist sidebar
function renderWatchlist() {
    const watchlist = document.getElementById('watchlist');
    watchlist.innerHTML = '';

    filteredStocks.forEach(stock => {
        const item = document.createElement('div');
        item.className = 'watchlist-item' + (selectedStock && selectedStock.code === stock.code ? ' active' : '');

        const priceChange = stock.price_change_percent || 0;
        const changeClass = priceChange < 0 ? 'negative' : '';

        item.innerHTML = `
            <div class="watchlist-code">${stock.code}</div>
            <div class="watchlist-name">${stock.name}</div>
            <div class="watchlist-price">
                <div class="price-value">Rp ${Math.round(stock.currentPrice).toLocaleString()}</div>
                <div class="price-change ${changeClass}">${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%</div>
            </div>
            <div class="signal-badge ${getSignalClass(stock.signal.recommendation)}">${stock.signal.recommendation}</div>
        `;

        item.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                addToGrid(stock);
            } else {
                selectStock(stock);
            }
        });

        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            addToGrid(stock);
        });

        watchlist.appendChild(item);
    });

    updateStockCount();
}

// Select stock and display details
async function selectStock(stock) {
    selectedStock = stock;

    // Update watchlist highlighting
    document.querySelectorAll('.watchlist-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelectorAll('.watchlist-item').forEach(item => {
        const code = item.querySelector('.watchlist-code')?.textContent;
        if (code === stock.code) {
            item.classList.add('active');
        }
    });

    // Update header
    document.getElementById('chartCode').textContent = stock.code;
    document.getElementById('chartName').textContent = stock.name;

    // Update price info
    const priceChange = stock.price_change_percent || 0;
    document.getElementById('currentPrice').textContent = `Rp ${Math.round(stock.currentPrice).toLocaleString()}`;

    const priceChangeEl = document.getElementById('priceChange');
    priceChangeEl.textContent = `${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
    priceChangeEl.className = 'price-change-big ' + (priceChange > 0 ? 'positive' : priceChange < 0 ? 'negative' : '');

    // Update analysis panels
    updateFundamentalAnalysis(stock);
    updateTechnicalAnalysis(stock);
    updateSignals(stock);

    // Render chart
    await renderChart(stock);
}

// Update fundamental analysis
function updateFundamentalAnalysis(stock) {
    document.getElementById('peRatio').textContent = stock.pe_ratio ? stock.pe_ratio.toFixed(2) : '-';
    document.getElementById('pbRatio').textContent = stock.pb_ratio ? stock.pb_ratio.toFixed(2) : '-';

    const roeEl = document.getElementById('roe');
    const roeValue = stock.roe || 0;
    roeEl.textContent = roeValue.toFixed(2) + '%';
    roeEl.className = 'analysis-value ' + (roeValue > 15 ? 'metric-positive' : '');

    document.getElementById('debtEquity').textContent = stock.debt_to_equity ? stock.debt_to_equity.toFixed(2) : '-';

    const revenueEl = document.getElementById('revenueGrowth');
    const revenueValue = stock.revenue_growth || 0;
    revenueEl.textContent = revenueValue.toFixed(2) + '%';
    revenueEl.className = 'analysis-value ' + (revenueValue > 10 ? 'metric-positive' : '');

    const profitEl = document.getElementById('profitMargin');
    const profitValue = stock.profit_margin || 0;
    profitEl.textContent = profitValue.toFixed(2) + '%';
    profitEl.className = 'analysis-value ' + (profitValue > 15 ? 'metric-positive' : '');
}

// Update technical analysis
function updateTechnicalAnalysis(stock) {
    document.getElementById('rsi').textContent = stock.rsi ? stock.rsi.toFixed(2) : '-';
    document.getElementById('macd').textContent = stock.macd ? stock.macd.toFixed(2) : '-';
    document.getElementById('ma50').textContent = stock.moving_average_50 ? 'Rp ' + Math.round(stock.moving_average_50).toLocaleString() : '-';
    document.getElementById('ma200').textContent = stock.moving_average_200 ? 'Rp ' + Math.round(stock.moving_average_200).toLocaleString() : '-';
    document.getElementById('volume').textContent = stock.volume ? (stock.volume / 1000000).toFixed(2) + 'M' : '-';
}

// Update trading signals
function updateSignals(stock) {
    const container = document.getElementById('signalsContainer');
    container.innerHTML = '';

    const signal = stock.signal;

    // Fundamental signals
    if (signal.fundamental && signal.fundamental.length > 0) {
        const fundCard = document.createElement('div');
        fundCard.className = 'signal-card';

        let fundHtml = '<div class="signal-card-type">Fundamental</div>';
        signal.fundamental.forEach(sig => {
            fundHtml += `
                <div class="signal-item">
                    <div class="signal-metric">
                        <span class="signal-metric-name">${sig.metric}</span>
                        <span class="signal-metric-value">${sig.value}</span>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <span class="signal-badge ${getSignalClass(sig.signal)}">${sig.signal}</span>
                        <span style="font-size: 10px; color: var(--text-muted);">${sig.strength}</span>
                    </div>
                </div>
            `;
        });

        fundCard.innerHTML = fundHtml;
        container.appendChild(fundCard);
    }

    // Technical signals
    if (signal.technical && signal.technical.length > 0) {
        const techCard = document.createElement('div');
        techCard.className = 'signal-card';

        let techHtml = '<div class="signal-card-type">Technical</div>';
        signal.technical.forEach(sig => {
            techHtml += `
                <div class="signal-item">
                    <div class="signal-metric">
                        <span class="signal-metric-name">${sig.metric}</span>
                        <span class="signal-metric-value">${sig.value}</span>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <span class="signal-badge ${getSignalClass(sig.signal)}">${sig.signal}</span>
                        <span style="font-size: 10px; color: var(--text-muted);">${sig.strength}</span>
                    </div>
                </div>
            `;
        });

        techCard.innerHTML = techHtml;
        container.appendChild(techCard);
    }

    // Recommendation
    const recCard = document.createElement('div');
    recCard.className = 'signal-card';
    const recClass = getSignalClass(signal.recommendation);
    recCard.innerHTML = `
        <div class="signal-recommendation">
            <div>
                <div class="price-label">Recommendation</div>
                <div class="recommendation-text" style="color: var(--accent-${recClass});">${signal.recommendation}</div>
            </div>
            <div class="recommendation-score" style="color: var(--accent-${recClass});">${signal.score > 0 ? '+' : ''}${signal.score}</div>
        </div>
    `;
    container.appendChild(recCard);
}

// Render price chart
async function renderChart(stock) {
    try {
        const response = await fetch(`/api/charts/${stock.code}`);
        const data = await response.json();

        if (chartInstance) {
            chartInstance.destroy();
        }

        const ctx = document.getElementById('priceChart').getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);

        const buyColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-buy');
        gradient.addColorStop(0, buyColor + '20');
        gradient.addColorStop(1, buyColor + '00');

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.priceHistory.map((_, i) => `Day ${i + 1}`),
                datasets: [{
                    label: 'Price',
                    data: data.priceHistory,
                    borderColor: buyColor,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointBackgroundColor: buyColor,
                    tension: 0.4,
                    pointBorderColor: 'var(--bg-primary)',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'var(--bg-secondary)',
                        titleColor: 'var(--text-primary)',
                        bodyColor: 'var(--text-secondary)',
                        borderColor: 'var(--border-color)',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return 'Rp ' + Math.round(context.parsed.y).toLocaleString();
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        display: true,
                        grid: {
                            color: 'var(--border-subtle)',
                            drawBorder: false
                        },
                        ticks: {
                            color: 'var(--text-muted)',
                            font: { size: 11 },
                            callback: function(value) {
                                return 'Rp ' + Math.round(value).toLocaleString();
                            }
                        }
                    },
                    x: {
                        display: true,
                        grid: { display: false, drawBorder: false },
                        ticks: {
                            color: 'var(--text-muted)',
                            font: { size: 11 },
                            maxTicksLimit: 6
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error rendering chart:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const sectorFilter = document.getElementById('sectorFilter');

    searchInput.addEventListener('input', (e) => {
        filterStocks(e.target.value, sectorFilter.value);
    });

    sectorFilter.addEventListener('change', (e) => {
        filterStocks(searchInput.value, e.target.value);
    });
}

// Filter stocks
function filterStocks(search, sector) {
    filteredStocks = allStocks.filter(stock => {
        const matchesSearch = !search ||
            stock.code.toLowerCase().includes(search.toLowerCase()) ||
            stock.name.toLowerCase().includes(search.toLowerCase());

        const matchesSector = !sector || stock.sector === sector;

        return matchesSearch && matchesSector;
    });

    renderWatchlist();
}

// Get signal class for styling
function getSignalClass(recommendation) {
    if (recommendation.includes('BUY')) return 'buy';
    if (recommendation.includes('SELL')) return 'sell';
    return 'hold';
}

// Update status
function updateStatus(text) {
    const statusEl = document.getElementById('statusText');
    if (statusEl) {
        statusEl.textContent = text;
    }
}

// Update stock count
function updateStockCount() {
    const countEl = document.getElementById('stockCount');
    if (countEl) {
        countEl.textContent = `Total: ${filteredStocks.length} saham`;
    }
}