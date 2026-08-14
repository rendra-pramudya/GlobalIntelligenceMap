// Global state
let allStocks = [];
let selectedStock = null;
let filteredStocks = [];

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await loadStocks();
    setupEventListeners();
    setupDragging();
});

// Load stocks from API
async function loadStocks() {
    try {
        updateStatus('Loading stocks...');
        const response = await fetch('/api/stocks');
        const data = await response.json();
        allStocks = data.stocks;
        filteredStocks = allStocks;
        renderStocks();
        updateStatus('Ready');
    } catch (error) {
        console.error('Error loading stocks:', error);
        updateStatus('Error loading stocks');
    }
}

// Render stocks in grid
function renderStocks() {
    const grid = document.getElementById('stocksGrid');
    grid.innerHTML = '';

    filteredStocks.forEach(stock => {
        const card = createStockCard(stock);
        card.addEventListener('click', () => selectStock(stock));
        grid.appendChild(card);
    });

    document.getElementById('stockCount').textContent = `Total: ${filteredStocks.length} saham`;
}

// Create stock card element
function createStockCard(stock) {
    const card = document.createElement('div');
    card.className = 'stock-card';
    if (selectedStock && selectedStock.code === stock.code) {
        card.classList.add('active');
    }

    const rec = stock.signal.recommendation;
    const signalClass = rec.includes('BUY') ? 'buy' : rec.includes('SELL') ? 'sell' : 'hold';
    const signalIcon = rec.includes('BUY') ? '📈' : rec.includes('SELL') ? '📉' : '➡️';

    card.innerHTML = `
        <div class="stock-card-header">
            <span class="stock-code">${stock.code}</span>
            <span class="signal-badge ${signalClass}">${signalIcon} ${rec}</span>
        </div>
        <div class="stock-card-info">
            <div><strong>${stock.name.substring(0, 30)}...</strong></div>
            <div>Harga: Rp ${stock.currentPrice.toLocaleString()}</div>
            <div>Sektor: ${stock.sector}</div>
        </div>
    `;

    return card;
}

// Select stock and show details
function selectStock(stock) {
    selectedStock = stock;
    renderStocks();
    renderStockDetails(stock);
    renderSignalAnalysis(stock);
}

// Render stock details
function renderStockDetails(stock) {
    const detailsDiv = document.getElementById('stockDetails');
    const priceChange = stock.price_change_percent;
    const priceClass = priceChange > 0 ? 'price-up' : 'price-down';
    const priceIcon = priceChange > 0 ? '📈' : '📉';

    detailsDiv.innerHTML = `
        <div class="detail-section">
            <h3>${stock.code} - ${stock.name}</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Harga Saham</span>
                    <span class="detail-value">Rp ${stock.currentPrice.toLocaleString()}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Perubahan Harga</span>
                    <span class="detail-value ${priceClass}">${priceIcon} ${priceChange.toFixed(2)}%</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Sektor</span>
                    <span class="detail-value">${stock.sector}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Listing Date</span>
                    <span class="detail-value">${stock.listing_date}</span>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>📊 Fundamental Metrics</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">P/E Ratio</span>
                    <span class="detail-value">${stock.pe_ratio.toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">P/B Ratio</span>
                    <span class="detail-value">${stock.pb_ratio.toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">ROE</span>
                    <span class="detail-value">${stock.roe.toFixed(2)}%</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Debt/Equity</span>
                    <span class="detail-value">${stock.debt_to_equity.toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Revenue Growth</span>
                    <span class="detail-value">${stock.revenue_growth.toFixed(2)}%</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Profit Margin</span>
                    <span class="detail-value">${stock.profit_margin.toFixed(2)}%</span>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>📈 Technical Indicators</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">MA 50</span>
                    <span class="detail-value">Rp ${stock.moving_average_50.toLocaleString('id')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">MA 200</span>
                    <span class="detail-value">Rp ${stock.moving_average_200.toLocaleString('id')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">RSI</span>
                    <span class="detail-value">${stock.rsi.toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">MACD</span>
                    <span class="detail-value">${stock.macd.toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Volume</span>
                    <span class="detail-value">${(stock.volume / 1000000).toFixed(2)}M</span>
                </div>
            </div>
        </div>
    `;
}

// Render signal analysis
function renderSignalAnalysis(stock) {
    const analysisDiv = document.getElementById('signalAnalysis');
    const signal = stock.signal;
    const rec = signal.recommendation;
    const recClass = rec.includes('BUY') ? 'recommendation-buy' : rec.includes('SELL') ? 'recommendation-sell' : 'recommendation-hold';
    const recIcon = rec.includes('BUY') ? '🚀' : rec.includes('SELL') ? '⛔' : '⏸️';

    let fundamentalHtml = signal.fundamental.map(item => `
        <div class="signal-item">
            <span class="signal-metric">${item.metric}</span>
            <span class="signal-value">${item.value}</span>
            <span class="signal-strength strength-${item.strength.toLowerCase()}">${item.signal} (${item.strength})</span>
        </div>
    `).join('');

    let technicalHtml = signal.technical.map(item => `
        <div class="signal-item">
            <span class="signal-metric">${item.metric}</span>
            <span class="signal-value">${item.value}</span>
            <span class="signal-strength strength-${item.strength.toLowerCase()}">${item.signal} (${item.strength})</span>
        </div>
    `).join('');

    analysisDiv.innerHTML = `
        <div class="recommendation-box ${recClass}">
            <div class="recommendation-text">Rekomendasi Keseluruhan</div>
            <div class="recommendation-signal">${recIcon} ${rec}</div>
            <div class="recommendation-text">Score: ${signal.score > 0 ? '+' : ''}${signal.score}</div>
        </div>

        <div class="analysis-section">
            <h4>📊 Analisis Fundamental</h4>
            ${fundamentalHtml || '<div class="signal-item"><span class="signal-value">Tidak ada signal</span></div>'}
        </div>

        <div class="analysis-section">
            <h4>📈 Analisis Teknikal</h4>
            ${technicalHtml || '<div class="signal-item"><span class="signal-value">Tidak ada signal</span></div>'}
        </div>
    `;
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', filterStocks);
    document.getElementById('sectorFilter').addEventListener('change', filterStocks);
}

// Filter stocks
function filterStocks() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const sector = document.getElementById('sectorFilter').value;

    filteredStocks = allStocks.filter(stock => {
        const matchesSearch = stock.code.toLowerCase().includes(searchTerm) ||
                            stock.name.toLowerCase().includes(searchTerm);
        const matchesSector = !sector || stock.sector === sector;
        return matchesSearch && matchesSector;
    });

    renderStocks();
}

// Setup panel dragging
function setupDragging() {
    setupPanelDrag('dragHandleList', 'panelList');
    setupPanelDrag('dragHandleDetails', 'panelDetails');
    setupPanelDrag('dragHandleSignals', 'panelSignals');
}

function setupPanelDrag(handleId, panelId) {
    const handle = document.getElementById(handleId);
    const panel = document.getElementById(panelId);

    if (!handle || !panel) return;

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX;
        startWidth = panel.offsetWidth;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const delta = e.clientX - startX;
        const newWidth = startWidth + delta;
        if (newWidth > 200) {
            panel.style.flex = `0 0 ${newWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

// Toggle panel collapse
function togglePanel(button) {
    const panel = button.closest('.panel');
    const content = panel.querySelector('.panel-content');
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
}

// Float panel
function floatPanel(panelId) {
    const panel = document.getElementById(panelId);
    const header = panel.querySelector('.panel-header h2').textContent;
    const content = panel.querySelector('.panel-content');

    // Create floating panel
    const floatingContainer = document.createElement('div');
    floatingContainer.className = 'floating-panel-container';
    floatingContainer.style.position = 'fixed';
    floatingContainer.style.left = '50px';
    floatingContainer.style.top = '100px';
    floatingContainer.style.width = '400px';
    floatingContainer.style.height = '500px';
    floatingContainer.style.zIndex = '1000';

    const floatingPanel = document.createElement('div');
    floatingPanel.className = 'floating-panel';
    floatingPanel.innerHTML = `
        <div class="panel-header">
            <h2>${header}</h2>
            <div class="panel-controls">
                <button class="btn-panel" onclick="minimizeFloatingPanel(this)">−</button>
                <button class="btn-panel" onclick="closeFloatingPanel(this)">✕</button>
            </div>
        </div>
        <div class="panel-content"></div>
    `;

    floatingPanel.querySelector('.panel-content').appendChild(content.cloneNode(true));
    floatingContainer.appendChild(floatingPanel);
    document.body.appendChild(floatingContainer);

    // Make floating panel draggable
    setupFloatingPanelDrag(floatingPanel, floatingContainer);
}

// Setup floating panel drag
function setupFloatingPanelDrag(floatingPanel, container) {
    const header = floatingPanel.querySelector('.panel-header');
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = container.offsetLeft;
        startTop = container.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        container.style.left = (startLeft + deltaX) + 'px';
        container.style.top = (startTop + deltaY) + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

// Close floating panel
function closeFloatingPanel(button) {
    const container = button.closest('.floating-panel-container');
    if (container) container.remove();
}

// Minimize floating panel
function minimizeFloatingPanel(button) {
    const content = button.closest('.floating-panel').querySelector('.panel-content');
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
}

// Update status
function updateStatus(text) {
    document.getElementById('statusText').textContent = text;
}
