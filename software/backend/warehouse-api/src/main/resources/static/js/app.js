/**
 * ============================================================
 * SMART WAREHOUSE IoT DASHBOARD - GLASSMORPHISM VERSION
 * ============================================================
 */

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
    API_BASE_URL: 'http://localhost:8080/api',
    REFRESH_INTERVAL: 3000,
    STORAGE_KEYS: {
        ESP32_IP: 'esp32_ip',
        ESP32_PORT: 'esp32_port',
        STREAM_ENDPOINT: 'stream_endpoint',
        API_URL: 'api_base_url',
        REFRESH_INTERVAL: 'refresh_interval'
    }
};

// ============================================================
// STATE MANAGEMENT
// ============================================================
const state = {
    isConnected: false,
    autoRefreshEnabled: true,
    refreshIntervalId: null,
    cameraConnected: false,
    currentPage: 'dashboard',
    lastLogIds: new Set(),
    inventory: [],
    logs: [],
    chart: null,
    qrScanIntervalRef: null,
    lastScannedQR: null,
    lastScanTime: 0,
    modeFetchIntervalRef: null,
    esp32Mode: '',
    reconnectIntervalId: null,
    isManualDisconnect: true,
    healthCheckIntervalId: null
};

// ============================================================
// SCAN & GESTURE MANAGEMENT
// ============================================================
const scanState = {
    isRequestInFlight: false,
    lastFrameFingerprint: null,
    globalCooldownUntil: 0
};
const gestureState = {
    history: [], // store last N modes
    requiredVotes: 4, // 4 consecutive detections
    lastValidMode: '',
    cooldownUntil: 0
};

let gestureRecognizer = null;
let isGestureRecognizerReady = false;

async function initGestureRecognizer() {
    try {
        const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3");
        const { GestureRecognizer, FilesetResolver } = vision;
        const visionBase = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        gestureRecognizer = await GestureRecognizer.createFromOptions(visionBase, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
                delegate: "GPU"
            },
            runningMode: "IMAGE"
        });
        isGestureRecognizerReady = true;
        console.log("Gesture Recognizer initialized");
    } catch (e) {
        console.error("Failed to initialize Gesture Recognizer", e);
    }
}

// ============================================================
// DOM ELEMENTS
// ============================================================
const elements = {};

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('Smart Warehouse Dashboard v2.0 initialized');

    // Cache DOM elements
    cacheElements();

    // Load saved settings
    loadSettings();

    // Setup event listeners
    setupEventListeners();

    // Initialize chart
    initChart();

    // Initial data fetch
    fetchAllData();

    // Start auto-refresh
    startAutoRefresh();

    // Init Gesture Recognizer
    initGestureRecognizer();
});

/**
 * Cache all DOM elements
 */
function cacheElements() {
    // Status
    elements.connectionStatus = document.getElementById('connection-status');
    elements.statusDot = document.getElementById('status-dot');
    elements.lastUpdate = document.getElementById('last-update');

    // Navigation
    elements.sidebar = document.getElementById('sidebar');
    elements.mobileMenuBtn = document.getElementById('mobile-menu-btn');
    elements.navItems = document.querySelectorAll('.nav-item');
    elements.pages = document.querySelectorAll('.page');
    elements.pageTitle = document.getElementById('page-title');

    // Stats
    elements.statTotalProducts = document.getElementById('stat-total-products');
    elements.statTotalQuantity = document.getElementById('stat-total-quantity');
    elements.statOutOfStock = document.getElementById('stat-out-of-stock');
    elements.statTodayTransactions = document.getElementById('stat-today-transactions');

    // Tables
    elements.inventoryTbody = document.getElementById('inventory-tbody');
    elements.logsTbody = document.getElementById('logs-tbody');
    elements.recentActivityList = document.getElementById('recent-activity-list');

    // Search & Filters
    elements.inventorySearch = document.getElementById('inventory-search');
    elements.logsSearch = document.getElementById('logs-search');
    elements.logsFilterAction = document.getElementById('logs-filter-action');
    elements.logsFilterStatus = document.getElementById('logs-filter-status');

    // Buttons
    elements.refreshInventoryBtn = document.getElementById('refresh-inventory-btn');
    elements.refreshLogsBtn = document.getElementById('refresh-logs-btn');
    elements.autoRefreshCheckbox = document.getElementById('auto-refresh-checkbox');

    // Camera
    elements.cameraStream = document.getElementById('camera-stream');
    elements.cameraStreamMini = document.getElementById('camera-stream-mini');
    elements.cameraPlaceholder = document.getElementById('camera-placeholder');
    elements.cameraPlaceholderMini = document.getElementById('camera-placeholder-mini');
    elements.esp32Ip = document.getElementById('esp32-ip');
    elements.esp32Port = document.getElementById('esp32-port');
    elements.streamEndpoint = document.getElementById('stream-endpoint');
    elements.streamUrlPreview = document.getElementById('stream-url-preview');
    elements.connectCameraBtn = document.getElementById('connect-camera-btn');
    elements.disconnectCameraBtn = document.getElementById('disconnect-camera-btn');
    elements.saveCameraSettings = document.getElementById('save-camera-settings');
    elements.qrCanvas = document.getElementById('qr-canvas');
    elements.scannedQrList = document.getElementById('scanned-qr-list');
    elements.qrScanStatus = document.getElementById('qr-scan-status');
    elements.cameraCurrentModeSpan = document.getElementById('camera-current-mode-span');
    elements.manualNhapBtn = document.getElementById('manual-nhap-btn');
    elements.manualXuatBtn = document.getElementById('manual-xuat-btn');

    // Settings
    elements.apiBaseUrl = document.getElementById('api-base-url');
    elements.refreshInterval = document.getElementById('refresh-interval');
    elements.saveSettingsBtn = document.getElementById('save-settings-btn');
    elements.testConnectionBtn = document.getElementById('test-connection-btn');

    // Chart
    elements.transactionsChart = document.getElementById('transactions-chart');

    // Toast
    elements.toastContainer = document.getElementById('toast-container');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Navigation
    elements.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateToPage(page);
        });
    });

    // Mobile menu
    elements.mobileMenuBtn?.addEventListener('click', toggleMobileSidebar);

    // Quick navigation buttons (inside cards)
    document.querySelectorAll('[data-page]').forEach(btn => {
        if (!btn.classList.contains('nav-item')) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToPage(btn.dataset.page);
            });
        }
    });

    // Refresh buttons
    elements.refreshInventoryBtn?.addEventListener('click', fetchInventory);
    elements.refreshLogsBtn?.addEventListener('click', fetchLogs);

    // Auto-refresh toggle
    elements.autoRefreshCheckbox?.addEventListener('change', (e) => {
        state.autoRefreshEnabled = e.target.checked;
        if (state.autoRefreshEnabled) {
            startAutoRefresh();
            showToast('Auto refresh enabled', 'info');
        } else {
            stopAutoRefresh();
            showToast('Auto refresh disabled', 'info');
        }
    });

    // Search & Filter
    elements.inventorySearch?.addEventListener('input', debounce(filterInventory, 300));
    elements.logsSearch?.addEventListener('input', debounce(filterLogs, 300));
    elements.logsFilterAction?.addEventListener('change', filterLogs);
    elements.logsFilterStatus?.addEventListener('change', filterLogs);

    // Camera controls
    elements.connectCameraBtn?.addEventListener('click', connectCamera);
    elements.disconnectCameraBtn?.addEventListener('click', disconnectCamera);
    elements.saveCameraSettings?.addEventListener('click', saveCameraSettingsToStorage);
    elements.manualNhapBtn?.addEventListener('click', () => setModeManual('NHAP'));
    elements.manualXuatBtn?.addEventListener('click', () => setModeManual('XUAT'));

    // Camera stream events
    elements.cameraStream?.addEventListener('load', handleCameraLoad);
    elements.cameraStream?.addEventListener('error', handleCameraError);
    
    // Mini camera stream events
    elements.cameraStreamMini?.addEventListener('load', () => {
        if (elements.cameraStreamMini) elements.cameraStreamMini.classList.add('active');
        if (elements.cameraPlaceholderMini) elements.cameraPlaceholderMini.classList.add('hidden');
    });
    elements.cameraStreamMini?.addEventListener('error', () => {
        if (elements.cameraStreamMini) elements.cameraStreamMini.classList.remove('active');
        if (elements.cameraPlaceholderMini) elements.cameraPlaceholderMini.classList.remove('hidden');
    });

    // Camera settings inputs - update preview
    ['esp32-ip', 'esp32-port', 'stream-endpoint'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateStreamUrlPreview);
    });

    // Settings
    elements.saveSettingsBtn?.addEventListener('click', saveSettings);
    elements.testConnectionBtn?.addEventListener('click', testConnection);

    // Close sidebar on overlay click (mobile)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('sidebar-overlay')) {
            toggleMobileSidebar();
        }
    });
}

// ============================================================
// NAVIGATION
// ============================================================

/**
 * Navigate to a page
 */
function navigateToPage(pageName) {
    // Update nav items
    elements.navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });

    // Update pages
    elements.pages.forEach(page => {
        page.classList.toggle('active', page.id === `page-${pageName}`);
    });

    // Update title
    const titles = {
        dashboard: 'Dashboard',
        inventory: 'Quan Ly Ton Kho',
        logs: 'Nhat Ky Giao Dich',
        camera: 'Camera Truc Tiep',
        settings: 'Cai Dat He Thong'
    };
    elements.pageTitle.textContent = titles[pageName] || 'Dashboard';

    state.currentPage = pageName;

    // Close mobile sidebar
    if (window.innerWidth <= 768) {
        elements.sidebar?.classList.remove('open');
        document.querySelector('.sidebar-overlay')?.classList.remove('active');
    }
}

/**
 * Toggle mobile sidebar
 */
function toggleMobileSidebar() {
    elements.sidebar?.classList.toggle('open');

    // Create/toggle overlay
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('active');
}

// ============================================================
// API FUNCTIONS
// ============================================================

/**
 * Fetch all data
 */
async function fetchAllData() {
    await Promise.all([
        fetchInventory(),
        fetchLogs()
    ]);
}

/**
 * Fetch inventory data
 */
async function fetchInventory() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/inventory`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        state.inventory = data;

        renderInventoryTable(data);
        updateStats(data);
        updateConnectionStatus(true);

    } catch (error) {
        console.error('Error fetching inventory:', error);
        updateConnectionStatus(false);
        showToast('Khong the ket noi den server', 'error');
    }
}

/**
 * Fetch transaction logs
 */
async function fetchLogs() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/logs`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        state.logs = data;

        renderLogsTable(data);
        renderRecentActivity(data.slice(0, 5));
        updateChart(data);
        updateTodayTransactions(data);
        updateLastUpdateTime();
        updateConnectionStatus(true);

    } catch (error) {
        console.error('Error fetching logs:', error);
        updateConnectionStatus(false);
    }
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================

/**
 * Render inventory table
 */
function renderInventoryTable(inventory) {
    if (!inventory || inventory.length === 0) {
        elements.inventoryTbody.innerHTML = `
            <tr>
                <td colspan="6" class="loading-cell">Khong co du lieu ton kho</td>
            </tr>
        `;
        return;
    }

    const rows = inventory.map((item, index) => {
        const quantityClass = getQuantityClass(item.quantity);
        const statusBadge = getStockStatusBadge(item.quantity);
        const updatedAt = formatDateTime(item.updatedAt);

        return `
            <tr>
                <td><code>${escapeHtml(item.qrCode)}</code></td>
                <td>${escapeHtml(item.productName)}</td>
                <td class="quantity-cell ${quantityClass}">${item.quantity}</td>
                <td>${statusBadge}</td>
                <td>${updatedAt}</td>
                <td class="qr-cell">
                    <div class="qr-wrapper">
                        <div id="qr-img-${index}" class="qr-container"></div>
                        <button class="btn-qr-download" onclick="downloadQR('qr-img-${index}', '${escapeHtml(item.qrCode)}')" title="Tai ve QR">
                            &#8681; Tai ve
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    elements.inventoryTbody.innerHTML = rows;

    // Generate QR codes after DOM is updated
    inventory.forEach((item, index) => {
        const container = document.getElementById(`qr-img-${index}`);
        if (container) {
            container.innerHTML = '';
            new QRCode(container, {
                text: item.qrCode,
                width: 64,
                height: 64,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    });
}

/**
 * Render transaction logs table
 */
function renderLogsTable(logs) {
    if (!logs || logs.length === 0) {
        elements.logsTbody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-cell">Chua co giao dich nao</td>
            </tr>
        `;
        return;
    }

    // Check for new logs
    const currentLogIds = new Set(logs.map(log => log.id));
    const newLogIds = logs.filter(log => !state.lastLogIds.has(log.id)).map(log => log.id);

    const rows = logs.map(log => {
        const isNew = newLogIds.includes(log.id) && state.lastLogIds.size > 0;
        const actionBadge = log.action === 'NHAP' ? 'badge-nhap' : 'badge-xuat';
        const statusBadge = log.status === 'SUCCESS' ? 'badge-success' : 'badge-failed';
        const createdAt = formatDateTime(log.createdAt);

        return `
            <tr class="${isNew ? 'new-row' : ''}">
                <td>${createdAt}</td>
                <td><code>${escapeHtml(log.qrCode)}</code></td>
                <td><span class="badge ${actionBadge}">${log.action}</span></td>
                <td><span class="badge ${statusBadge}">${log.status}</span></td>
                <td>${escapeHtml(log.message || '-')}</td>
            </tr>
        `;
    }).join('');

    elements.logsTbody.innerHTML = rows;
    state.lastLogIds = currentLogIds;
}

/**
 * Render recent activity list
 */
function renderRecentActivity(logs) {
    if (!logs || logs.length === 0) {
        elements.recentActivityList.innerHTML = `
            <div class="activity-empty">Chua co hoat dong nao</div>
        `;
        return;
    }

    const items = logs.map((log, index) => {
        const isNew = index === 0 && state.lastLogIds.size > 0 && !state.lastLogIds.has(log.id);
        const iconClass = log.status === 'FAILED' ? 'failed' : log.action.toLowerCase();
        const icon = log.action === 'NHAP' ? '&#8595;' : '&#8593;';
        const time = formatTimeAgo(log.createdAt);

        return `
            <div class="activity-item ${isNew ? 'new' : ''}">
                <div class="activity-icon ${iconClass}">${icon}</div>
                <div class="activity-content">
                    <div class="activity-title">${log.action} - ${escapeHtml(log.qrCode)}</div>
                    <div class="activity-subtitle">${escapeHtml(log.message || 'Thanh cong')}</div>
                </div>
                <div class="activity-time">${time}</div>
            </div>
        `;
    }).join('');

    elements.recentActivityList.innerHTML = items;
}

/**
 * Update stats cards
 */
function updateStats(inventory) {
    const totalProducts = inventory.length;
    const totalQuantity = inventory.reduce((sum, item) => sum + item.quantity, 0);
    const outOfStock = inventory.filter(item => item.quantity === 0).length;

    animateValue(elements.statTotalProducts, totalProducts);
    animateValue(elements.statTotalQuantity, totalQuantity);
    animateValue(elements.statOutOfStock, outOfStock);
}

/**
 * Update today's transactions count
 */
function updateTodayTransactions(logs) {
    const today = new Date().toDateString();
    const todayCount = logs.filter(log => {
        return new Date(log.createdAt).toDateString() === today;
    }).length;

    animateValue(elements.statTodayTransactions, todayCount);
}

/**
 * Animate number value
 */
function animateValue(element, newValue) {
    if (!element) return;

    const currentValue = parseInt(element.textContent) || 0;
    const diff = newValue - currentValue;
    const duration = 500;
    const steps = 20;
    const stepValue = diff / steps;
    const stepDuration = duration / steps;

    let current = currentValue;
    let step = 0;

    const animation = setInterval(() => {
        step++;
        current += stepValue;
        element.textContent = Math.round(current);

        if (step >= steps) {
            element.textContent = newValue;
            clearInterval(animation);
        }
    }, stepDuration);
}

// ============================================================
// CHART FUNCTIONS
// ============================================================

/**
 * Initialize Chart.js
 */
function initChart() {
    if (!elements.transactionsChart) return;

    const ctx = elements.transactionsChart.getContext('2d');

    state.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: getLast7Days(),
            datasets: [
                {
                    label: 'Nhap',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Xuat',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: 'rgba(245, 158, 11, 0.7)',
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        stepSize: 1
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

/**
 * Update chart with logs data
 */
function updateChart(logs) {
    if (!state.chart) return;

    const last7Days = getLast7Days();
    const nhapData = new Array(7).fill(0);
    const xuatData = new Array(7).fill(0);

    logs.forEach(log => {
        if (log.status !== 'SUCCESS') return;

        const logDate = new Date(log.createdAt);
        const dateStr = formatDateShort(logDate);
        const dayIndex = last7Days.indexOf(dateStr);

        if (dayIndex !== -1) {
            if (log.action === 'NHAP') {
                nhapData[dayIndex]++;
            } else {
                xuatData[dayIndex]++;
            }
        }
    });

    state.chart.data.datasets[0].data = nhapData;
    state.chart.data.datasets[1].data = xuatData;
    state.chart.update('none');
}

/**
 * Get last 7 days labels
 */
function getLast7Days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push(formatDateShort(date));
    }
    return days;
}

/**
 * Format date as DD/MM
 */
function formatDateShort(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
}

// ============================================================
// FILTER FUNCTIONS
// ============================================================

/**
 * Filter inventory table
 */
function filterInventory() {
    const searchTerm = elements.inventorySearch?.value.toLowerCase() || '';

    const filtered = state.inventory.filter(item => {
        return item.qrCode.toLowerCase().includes(searchTerm) ||
            item.productName.toLowerCase().includes(searchTerm);
    });

    renderInventoryTable(filtered);
}

/**
 * Filter logs table
 */
function filterLogs() {
    const searchTerm = elements.logsSearch?.value.toLowerCase() || '';
    const actionFilter = elements.logsFilterAction?.value || '';
    const statusFilter = elements.logsFilterStatus?.value || '';

    const filtered = state.logs.filter(log => {
        const matchesSearch = log.qrCode.toLowerCase().includes(searchTerm) ||
            (log.message && log.message.toLowerCase().includes(searchTerm));
        const matchesAction = !actionFilter || log.action === actionFilter;
        const matchesStatus = !statusFilter || log.status === statusFilter;

        return matchesSearch && matchesAction && matchesStatus;
    });

    renderLogsTable(filtered);
}

// ============================================================
// CAMERA FUNCTIONS
// ============================================================

/**
 * Connect to camera
 */
function connectCamera(isRetry) {
    const ip = elements.esp32Ip?.value.trim();
    const port = elements.esp32Port?.value.trim() || '81';
    const endpoint = elements.streamEndpoint?.value.trim() || '/stream';

    if (!ip) {
        if (!isRetry) showToast('Vui long nhap dia chi IP', 'error');
        return;
    }

    const streamUrl = `http://${ip}:${port}${endpoint}${isRetry ? '?t=' + Date.now() : ''}`;
    console.log(isRetry ? 'Retrying camera...' : 'Connecting to camera:', streamUrl);

    state.isManualDisconnect = false;

    // Set stream source for both views
    elements.cameraStream.src = streamUrl;
    if (elements.cameraStreamMini) {
        elements.cameraStreamMini.src = streamUrl;
    }

    if (!isRetry) showToast('Dang ket noi camera...', 'info');
}

/**
 * Disconnect camera
 */
function disconnectCamera() {
    state.isManualDisconnect = true;
    if (state.reconnectIntervalId) {
        clearInterval(state.reconnectIntervalId);
        state.reconnectIntervalId = null;
    }

    elements.cameraStream.src = '';
    elements.cameraStream.classList.remove('active');
    elements.cameraPlaceholder?.classList.remove('hidden');
    elements.connectCameraBtn.style.display = 'inline-flex';
    elements.disconnectCameraBtn.style.display = 'none';

    if (elements.cameraStreamMini) {
        elements.cameraStreamMini.src = '';
        elements.cameraStreamMini.classList.remove('active');
    }
    if (elements.cameraPlaceholderMini) {
        elements.cameraPlaceholderMini.classList.remove('hidden');
    }

    stopQRScanner();
    if (state.modeFetchIntervalRef) {
        clearInterval(state.modeFetchIntervalRef);
        state.modeFetchIntervalRef = null;
    }
    if (elements.cameraCurrentModeSpan) {
        elements.cameraCurrentModeSpan.className = 'badge';
        elements.cameraCurrentModeSpan.textContent = "CHUA KET NOI";
    }

    state.cameraConnected = false;
    showToast('Da ngat ket noi camera', 'info');
    stopHealthCheck();
}

/**
 * Handle camera load success
 */
function handleCameraLoad() {
    elements.cameraStream?.classList.add('active');
    elements.cameraPlaceholder?.classList.add('hidden');
    elements.connectCameraBtn.style.display = 'none';
    elements.disconnectCameraBtn.style.display = 'inline-flex';

    if (elements.cameraStreamMini) {
        elements.cameraStreamMini.classList.add('active');
    }
    elements.cameraPlaceholderMini?.classList.add('hidden');

    // Clear auto-reconnect timer if running
    const wasReconnecting = !!state.reconnectIntervalId;
    if (state.reconnectIntervalId) {
        clearInterval(state.reconnectIntervalId);
        state.reconnectIntervalId = null;
    }

    state.cameraConnected = true;
    showToast(wasReconnecting ? 'Camera da tu dong ket noi lai!' : 'Ket noi camera thanh cong!', 'success');

    startModePolling();
    startQRScanner();
    startHealthCheck();
}

/**
 * Handle camera error
 */
function handleCameraError() {
    elements.cameraStream?.classList.remove('active');
    if (elements.cameraStreamMini) {
        elements.cameraStreamMini.classList.remove('active');
    }
    state.cameraConnected = false;
    stopQRScanner();

    // Neu nguoi dung chu dong ngat -> reset UI binh thuong
    if (state.isManualDisconnect) {
        elements.cameraPlaceholder?.classList.remove('hidden');
        if (elements.cameraPlaceholderMini) {
            elements.cameraPlaceholderMini.classList.remove('hidden');
        }
        elements.connectCameraBtn.style.display = 'inline-flex';
        elements.disconnectCameraBtn.style.display = 'none';
        
        showToast('Khong the ket noi camera', 'error');
        return;
    }

    // ESP32 di ngu -> giu nut "Ngat" va bat dau tu dong thu lai
    elements.cameraPlaceholder?.classList.remove('hidden');
    if (elements.cameraPlaceholderMini) {
        elements.cameraPlaceholderMini.classList.remove('hidden');
    }
    showToast('Dang thu ket noi lai camera...', 'warning');
    if (elements.cameraPlaceholder) {
        const hint = elements.cameraPlaceholder.querySelector('.placeholder-hint');
        if (hint) hint.textContent = 'Mat ket noi - Dang tu dong thu lai...';
    }
    if (elements.cameraCurrentModeSpan) {
        elements.cameraCurrentModeSpan.className = 'badge badge-failed pulse';
        elements.cameraCurrentModeSpan.textContent = 'DANG TIM CAMERA...';
    }

    // Start retry loop (5s interval)
    if (!state.reconnectIntervalId) {
        stopHealthCheck();
        state.reconnectIntervalId = setInterval(() => {
            if (!state.isManualDisconnect && !state.cameraConnected) {
                connectCamera(true);
            }
        }, 5000);
    }
}

/**
 * Health check: Ping ESP32 every 10s to detect frozen stream
 * When ESP32 goes to sleep, MJPEG stream freezes but img.onerror never fires.
 * This watchdog detects that and force-reloads the stream.
 */
function startHealthCheck() {
    stopHealthCheck();
    state.healthCheckIntervalId = setInterval(() => {
        if (!state.cameraConnected || state.isManualDisconnect) return;

        const ip = elements.esp32Ip?.value.trim();
        const port = elements.esp32Port?.value.trim() || '81';
        if (!ip) return;

        const testImg = new Image();
        let responded = false;

        const timeout = setTimeout(() => {
            if (responded) return;
            responded = true;
            testImg.src = '';
            console.log('Health check timeout - ESP32 sleeping, force-reloading stream...');
            // Force reload stream src -> triggers error -> reconnect loop
            const endpoint = elements.streamEndpoint?.value.trim() || '/stream';
            elements.cameraStream.src = `http://${ip}:${port}${endpoint}?t=${Date.now()}`;
        }, 8000);

        testImg.onload = testImg.onerror = () => {
            if (responded) return;
            responded = true;
            clearTimeout(timeout);
            // ESP32 is alive, stream should be fine
        };

        testImg.src = `http://${ip}:${port}/capture?t=${Date.now()}`;
    }, 10000);
}

function stopHealthCheck() {
    if (state.healthCheckIntervalId) {
        clearInterval(state.healthCheckIntervalId);
        state.healthCheckIntervalId = null;
    }
}

/**
 * Update stream URL preview
 */
function updateStreamUrlPreview() {
    const ip = elements.esp32Ip?.value.trim() || '[IP]';
    const port = elements.esp32Port?.value.trim() || '81';
    const endpoint = elements.streamEndpoint?.value.trim() || '/stream';

    if (elements.streamUrlPreview) {
        elements.streamUrlPreview.textContent = `http://${ip}:${port}${endpoint}`;
    }
}

/**
 * Save camera settings to localStorage
 */
function saveCameraSettingsToStorage() {
    const ip = elements.esp32Ip?.value.trim();
    const port = elements.esp32Port?.value.trim();
    const endpoint = elements.streamEndpoint?.value.trim();

    localStorage.setItem(CONFIG.STORAGE_KEYS.ESP32_IP, ip);
    localStorage.setItem(CONFIG.STORAGE_KEYS.ESP32_PORT, port);
    localStorage.setItem(CONFIG.STORAGE_KEYS.STREAM_ENDPOINT, endpoint);

    showToast('Da luu cau hinh camera', 'success');
}

/**
 * Start QR Scanner on Canvas
 */
function startQRScanner() {
    if (!elements.qrCanvas || !elements.cameraStream) return;

    if (elements.qrScanStatus) {
        elements.qrScanStatus.textContent = "Dang quet...";
        elements.qrScanStatus.className = "badge badge-success pulse";
    }

    stopQRScanner();

    const ctx = elements.qrCanvas.getContext('2d', { willReadFrequently: true });

    state.qrScanIntervalRef = setInterval(() => {
        if (!state.cameraConnected) return;

        try {
            if (elements.cameraStream.naturalWidth === 0) return;

            elements.qrCanvas.width = elements.cameraStream.naturalWidth;
            elements.qrCanvas.height = elements.cameraStream.naturalHeight;

            // Draw image stream to canvas (XOAY 180 ĐỘ DO CAMERA GẮN NGƯỢC)
            ctx.save();
            ctx.translate(elements.qrCanvas.width / 2, elements.qrCanvas.height / 2);
            ctx.rotate(Math.PI); // 180 degrees
            ctx.drawImage(elements.cameraStream, -elements.qrCanvas.width / 2, -elements.qrCanvas.height / 2, elements.qrCanvas.width, elements.qrCanvas.height);
            ctx.restore();

            // Extract raw image pixels
            const imageData = ctx.getImageData(0, 0, elements.qrCanvas.width, elements.qrCanvas.height);

            // Decode with jsQR
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                handleScannedQR(code.data, imageData);
            }

            // Gesture classification
            if (isGestureRecognizerReady && gestureRecognizer) {
                const results = gestureRecognizer.recognize(elements.qrCanvas);
                if (results.gestures && results.gestures.length > 0) {
                    const categoryName = results.gestures[0][0].categoryName;
                    const score = results.gestures[0][0].score;
                    if (score > 0.6) {
                        handleGestureDetection(categoryName);
                    }
                } else {
                    // Reset if no hand detected
                    gestureState.history = [];
                }
            }
        } catch (error) {
            console.error("QR Scan/Gesture error:", error);
            // Có thể xảy ra CORS error nếu ESP32 không trả về Header CORS.
        }
    }, 500); // 500ms
}

function handleGestureDetection(categoryName) {
    if (Date.now() < gestureState.cooldownUntil) return; // In cooldown

    let detectedMode = null;
    if (categoryName === 'Thumb_Up') detectedMode = 'NHAP';
    else if (categoryName === 'Thumb_Down') detectedMode = 'XUAT';

    if (!detectedMode) {
        gestureState.history = [];
        return;
    }

    gestureState.history.push(detectedMode);
    if (gestureState.history.length > gestureState.requiredVotes) {
        gestureState.history.shift();
    }

    if (gestureState.history.length === gestureState.requiredVotes) {
        const allMatch = gestureState.history.every(m => m === detectedMode);
        if (allMatch && gestureState.lastValidMode !== detectedMode) {
            setModeManual(detectedMode);
        }
    }
}

async function setModeManual(mode) {
    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode })
        });
        if (res.ok) {
            showToast(`Đã chuyển sang chế độ ${mode}`, 'success');
            gestureState.history = [];
            gestureState.lastValidMode = mode;
            gestureState.cooldownUntil = Date.now() + 3000; // 3 giây cooldown chống nhấp nháy

            // Notify ESP32 to update its LCD immediately (Use Image to avoid CORS/PNA blocks)
            const ip = elements.esp32Ip?.value.trim();
            if (ip) {
                const img = new Image();
                img.src = `http://${ip}:82/set_mode?mode=${mode}&t=${Date.now()}`;
            }
        } else {
            showToast(`Khong the chuyen che do ${mode}`, 'error');
        }
    } catch (e) {
        showToast(`Loi chuyen che do ${mode}`, 'error');
    }
}

/**
 * Stop QR Scanner
 */
function stopQRScanner() {
    if (state.qrScanIntervalRef) {
        clearInterval(state.qrScanIntervalRef);
        state.qrScanIntervalRef = null;
    }
    if (elements.qrScanStatus) {
        elements.qrScanStatus.textContent = "San sang";
        elements.qrScanStatus.className = "badge badge-success";
    }
}

function calculateFrameFingerprint(imageData) {
    if (!imageData) return null;
    let sum = 0;
    // Sample every 400th pixel to be fast and avoid heavy CPU usage
    for (let i = 0; i < imageData.data.length; i += 1600) {
        sum += imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2];
    }
    return sum;
}

/**
 * Handle success QR code scanned from Web UI
 */
async function handleScannedQR(qrData, imageData) {
    const now = Date.now();

    // 1. Mode-required gate
    if (!state.esp32Mode || (state.esp32Mode !== 'NHAP' && state.esp32Mode !== 'XUAT')) {
        return; // Do not scan unless mode is set
    }

    // ═══════════════════════════════════════════════════
    // LỚP 1: Global Cooldown — Sau mỗi scan thành công,
    //         TOÀN BỘ hệ thống scan bị khóa 2 giây
    // ═══════════════════════════════════════════════════
    if (now < scanState.globalCooldownUntil) {
        return;
    }

    // ═══════════════════════════════════════════════════
    // LỚP 2: Same-QR Cooldown — Cùng một mã QR không được
    //         quét lại trong vòng 4 giây
    // ═══════════════════════════════════════════════════
    if (state.lastScannedQR === qrData && (now - state.lastScanTime) < 4000) {
        return;
    }

    // ═══════════════════════════════════════════════════
    // LỚP 3: In-flight Lock — Chỉ cho phép 1 request
    //         gửi đến server tại một thời điểm
    // ═══════════════════════════════════════════════════
    if (scanState.isRequestInFlight) {
        return; // Đang có request chờ phản hồi → bỏ qua
    }

    // ═══════════════════════════════════════════════════
    // LỚP 4: Frame Fingerprint — Kiểm tra frame hiện tại
    //         có thay đổi so với frame trước không
    //         (phát hiện camera đóng băng/giữ cùng 1 hình)
    // ═══════════════════════════════════════════════════
    const currentFingerprint = Math.round(calculateFrameFingerprint(imageData));
    if (scanState.lastFrameFingerprint !== null) {
        const diff = Math.abs(currentFingerprint - scanState.lastFrameFingerprint);
        if (diff < 500) {
            return; // Frame gần giống hệt → có thể bị đóng băng → bỏ qua
        }
    }

    // ═══════════════════════════════════════════════════
    // KHÓA VÀ GỬI REQUEST
    // ═══════════════════════════════════════════════════
    scanState.isRequestInFlight = true;  // Khóa lớp 3
    state.lastScannedQR = qrData;        // Ghi nhớ cho lớp 2
    state.lastScanTime = now;
    scanState.lastFrameFingerprint = currentFingerprint;

    // ═══════════════════════════════════════════════════
    // LỚP 5 (chuẩn bị): Tạo UUID duy nhất cho mỗi lần scan
    //         → gửi kèm request → Backend kiểm tra trùng lặp
    // ═══════════════════════════════════════════════════
    const scanEventId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);

    try {
        const payload = {
            qr: qrData,
            mode: state.esp32Mode,
            scanEventId: scanEventId // ← UUID gửi kèm
        };

        const res = await fetch(`${CONFIG.API_BASE_URL}/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (res.ok && result.success) {
            showToast(`Quét thành công: ${qrData} (${state.esp32Mode})`, 'success');
            scanState.globalCooldownUntil = Date.now() + 2000; // 2s lock

            // Add to UI
            addScannedToUI(qrData, result.productName || 'Sản phẩm', state.esp32Mode);

            // Auto refresh tables to show new data
            fetchAllData();
        } else {
            showToast(`Lỗi quét: ${result.message || 'Thất bại'}`, 'error');
            scanState.globalCooldownUntil = Date.now() + 1000; // 1s lock on fail
        }
    } catch (e) {
        console.error("Scan fetch error:", e);
        showToast(`Lỗi mạng khi quét mã`, 'error');
        scanState.globalCooldownUntil = Date.now() + 1000;
    } finally {
        scanState.isRequestInFlight = false;
    }
}

function addScannedToUI(qrData, productName, mode) {
    if (!elements.scannedQrList) return;

    const emptyMsg = elements.scannedQrList.querySelector('.activity-empty');
    if (emptyMsg) emptyMsg.remove();

    const timeStr = new Date().toLocaleTimeString('vi-VN');
    const newItem = document.createElement('div');
    newItem.className = 'activity-item new';

    const iconColor = mode === 'NHAP' ? '#10b981' : '#f59e0b';
    const actionText = mode === 'NHAP' ? 'NHẬP' : 'XUẤT';

    newItem.innerHTML = `
        <div class="activity-icon" style="background-color:${iconColor}; color:white; font-size: 16px;">&#128269;</div>
        <div class="activity-content">
            <div class="activity-title">${escapeHtml(qrData)} - ${escapeHtml(productName)}</div>
            <div class="activity-subtitle" style="color:${iconColor};">${actionText} thành công</div>
        </div>
        <div class="activity-time">${timeStr}</div>
    `;

    elements.scannedQrList.prepend(newItem);

    while (elements.scannedQrList.children.length > 6) {
        elements.scannedQrList.removeChild(elements.scannedQrList.lastChild);
    }
}

/**
 * Start polling ESP32 Mode from Port 82
 */
function startModePolling() {
    const ip = elements.esp32Ip?.value.trim();
    if (!ip) return;

    if (state.modeFetchIntervalRef) clearInterval(state.modeFetchIntervalRef);

    const fetchMode = async () => {
        if (!state.cameraConnected) return;
        try {
            // Fetch mode from Spring Boot backend instead of Port 82 on ESP32
            const res = await fetch(`${CONFIG.API_BASE_URL}/mode`);
            if (res.ok) {
                const data = await res.json();
                state.esp32Mode = data.mode;

                if (elements.cameraCurrentModeSpan) {
                    if (data.mode === 'NHAP') {
                        elements.cameraCurrentModeSpan.className = 'badge badge-nhap pulse';
                        elements.cameraCurrentModeSpan.textContent = 'NHẬP KHO (Ghi tăng)';
                    } else if (data.mode === 'XUAT') {
                        elements.cameraCurrentModeSpan.className = 'badge badge-xuat pulse';
                        elements.cameraCurrentModeSpan.textContent = 'XUẤT KHO (Ghi giảm)';
                    } else {
                        elements.cameraCurrentModeSpan.className = 'badge badge-failed';
                        elements.cameraCurrentModeSpan.textContent = 'CHƯA CHỌN CHẾ ĐỘ';
                    }
                }
            }
        } catch (e) {
            console.error("Mode fetch error:", e);
            if (elements.cameraCurrentModeSpan) {
                elements.cameraCurrentModeSpan.className = 'badge badge-failed';
                elements.cameraCurrentModeSpan.textContent = 'MẤT KẾT NỐI API MODE';
            }
        }
    };

    fetchMode();
    state.modeFetchIntervalRef = setInterval(fetchMode, 2000);
}

// ============================================================
// SETTINGS FUNCTIONS
// ============================================================

/**
 * Load settings from localStorage
 */
function loadSettings() {
    // Camera settings
    const savedIp = localStorage.getItem(CONFIG.STORAGE_KEYS.ESP32_IP);
    const savedPort = localStorage.getItem(CONFIG.STORAGE_KEYS.ESP32_PORT);
    const savedEndpoint = localStorage.getItem(CONFIG.STORAGE_KEYS.STREAM_ENDPOINT);

    if (savedIp && elements.esp32Ip) elements.esp32Ip.value = savedIp;
    if (savedPort && elements.esp32Port) elements.esp32Port.value = savedPort;
    if (savedEndpoint && elements.streamEndpoint) elements.streamEndpoint.value = savedEndpoint;

    // API settings
    const savedApiUrl = localStorage.getItem(CONFIG.STORAGE_KEYS.API_URL);
    const savedRefreshInterval = localStorage.getItem(CONFIG.STORAGE_KEYS.REFRESH_INTERVAL);

    if (savedApiUrl) {
        CONFIG.API_BASE_URL = savedApiUrl;
        if (elements.apiBaseUrl) elements.apiBaseUrl.value = savedApiUrl;
    }

    if (savedRefreshInterval) {
        CONFIG.REFRESH_INTERVAL = parseInt(savedRefreshInterval);
        if (elements.refreshInterval) elements.refreshInterval.value = savedRefreshInterval;
    }

    // Update stream URL preview
    updateStreamUrlPreview();
}

/**
 * Save settings
 */
function saveSettings() {
    const apiUrl = elements.apiBaseUrl?.value.trim();
    const refreshInterval = elements.refreshInterval?.value;

    if (apiUrl) {
        CONFIG.API_BASE_URL = apiUrl;
        localStorage.setItem(CONFIG.STORAGE_KEYS.API_URL, apiUrl);
    }

    if (refreshInterval) {
        CONFIG.REFRESH_INTERVAL = parseInt(refreshInterval);
        localStorage.setItem(CONFIG.STORAGE_KEYS.REFRESH_INTERVAL, refreshInterval);

        // Restart auto-refresh with new interval
        if (state.autoRefreshEnabled) {
            stopAutoRefresh();
            startAutoRefresh();
        }
    }

    showToast('Da luu cai dat', 'success');
}

/**
 * Test API connection
 */
async function testConnection() {
    showToast('Dang test ket noi...', 'info');

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/health`);

        if (response.ok) {
            showToast('Ket noi thanh cong!', 'success');
            updateConnectionStatus(true);
        } else {
            showToast(`Loi: ${response.status}`, 'error');
            updateConnectionStatus(false);
        }
    } catch (error) {
        showToast('Khong the ket noi den server', 'error');
        updateConnectionStatus(false);
    }
}

// ============================================================
// AUTO-REFRESH
// ============================================================

/**
 * Start auto-refresh
 */
function startAutoRefresh() {
    if (state.refreshIntervalId) {
        clearInterval(state.refreshIntervalId);
    }

    state.refreshIntervalId = setInterval(() => {
        if (state.autoRefreshEnabled) {
            fetchAllData();
        }
    }, CONFIG.REFRESH_INTERVAL);

    console.log(`Auto-refresh started (${CONFIG.REFRESH_INTERVAL}ms)`);
}

/**
 * Stop auto-refresh
 */
function stopAutoRefresh() {
    if (state.refreshIntervalId) {
        clearInterval(state.refreshIntervalId);
        state.refreshIntervalId = null;
    }
    console.log('Auto-refresh stopped');
}

// ============================================================
// UI HELPERS
// ============================================================

/**
 * Update connection status
 */
function updateConnectionStatus(connected) {
    state.isConnected = connected;

    elements.connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
    elements.statusDot?.classList.toggle('connected', connected);
}

/**
 * Update last update time
 */
function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN');
    elements.lastUpdate.textContent = `Cap nhat: ${timeStr}`;
}

/**
 * Get stock status badge HTML
 */
function getStockStatusBadge(quantity) {
    if (quantity === 0) {
        return '<span class="status-badge status-out-of-stock">Het hang</span>';
    } else if (quantity <= 5) {
        return '<span class="status-badge status-low-stock">Sap het</span>';
    }
    return '<span class="status-badge status-in-stock">Con hang</span>';
}

/**
 * Get quantity CSS class
 */
function getQuantityClass(quantity) {
    if (quantity === 0) return 'quantity-low';
    if (quantity <= 5) return 'quantity-medium';
    return 'quantity-high';
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '&#10003;',
        error: '&#10007;',
        info: '&#8505;',
        warning: '&#9888;'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" onclick="closeToast(this)">&times;</button>
    `;

    elements.toastContainer?.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

/**
 * Close toast
 */
function closeToast(button) {
    const toast = button.closest('.toast');
    toast?.classList.add('hiding');
    setTimeout(() => toast?.remove(), 300);
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Format date/time
 */
function formatDateTime(dateStr) {
    if (!dateStr) return '-';

    try {
        const date = new Date(dateStr);
        return date.toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        return dateStr;
    }
}

/**
 * Format time ago
 */
function formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Vua xong';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} phut truoc`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} gio truoc`;
    return `${Math.floor(seconds / 86400)} ngay truoc`;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Make closeToast available globally
window.closeToast = closeToast;

/**
 * Download QR code as PNG
 */
function downloadQR(containerId, qrCode) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const qrSize = 200;
    const padding = 24;
    const labelHeight = 36;

    // Try to get source: canvas first, then img
    const sourceCanvas = container.querySelector('canvas');
    const sourceImg = container.querySelector('img');

    function renderAndDownload(source) {
        const dlCanvas = document.createElement('canvas');
        dlCanvas.width = qrSize + padding * 2;
        dlCanvas.height = qrSize + padding * 2 + labelHeight;
        const ctx = dlCanvas.getContext('2d');

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dlCanvas.width, dlCanvas.height);

        // Draw QR code (scaled to qrSize)
        ctx.drawImage(source, padding, padding, qrSize, qrSize);

        // Label text below
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 16px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(qrCode, dlCanvas.width / 2, qrSize + padding + labelHeight - 8);

        // Trigger download
        const link = document.createElement('a');
        link.download = `QR_${qrCode}.png`;
        link.href = dlCanvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    if (sourceCanvas) {
        renderAndDownload(sourceCanvas);
    } else if (sourceImg && sourceImg.src) {
        // QRCode.js may render as <img> — need to load into new Image first
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            renderAndDownload(img);
        };
        img.src = sourceImg.src;
    } else {
        alert('Khong tim thay ma QR de tai ve');
    }
}

window.downloadQR = downloadQR;
