# Chi Tiết Phần Mềm — Smart Warehouse IoT

---

## 1. TỔNG QUAN KIẾN TRÚC PHẦN MỀM

Hệ thống phần mềm gồm 3 lớp: **Backend API** (Spring Boot), **Frontend Web** (Vanilla JS), và **Database** (PostgreSQL), giao tiếp qua REST API.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           BROWSER                                    │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  MediaPipe    │  │  jsQR        │  │  Dashboard UI            │   │
│  │  Gesture      │  │  QR Scanner  │  │  (Chart.js + Tables)     │   │
│  │  Recognition  │  │              │  │                          │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘   │
│         │                 │                        │                  │
│         │ POST /api/mode  │ POST /api/scan         │ GET /api/*      │
│         └────────┬────────┴────────────────────────┘                  │
│                  │                                                    │
└──────────────────┼────────────────────────────────────────────────────┘
                   │ HTTP REST
                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     SPRING BOOT (Port 8080)                          │
│                                                                      │
│  ┌────────────────────┐     ┌────────────────────┐                   │
│  │ WarehouseController│────▶│  WarehouseService   │                   │
│  │                    │     │  - Mode state       │                   │
│  │  /api/scan         │     │  - Idempotency      │                   │
│  │  /api/mode         │     │  - Business logic   │                   │
│  │  /api/inventory    │     │                    │                   │
│  │  /api/logs         │     └─────────┬──────────┘                   │
│  │  /api/health       │               │ JPA                         │
│  └────────────────────┘               ▼                              │
│                          ┌────────────────────────┐                  │
│                          │  Spring Data JPA        │                  │
│                          │  - InventoryRepository  │                  │
│                          │  - TransactionLogRepo   │                  │
│                          └─────────┬──────────────┘                  │
│                                    │ JDBC                            │
└────────────────────────────────────┼─────────────────────────────────┘
                                     ▼
                          ┌────────────────────────┐
                          │  PostgreSQL (5432)      │
                          │  warehouse_db           │
                          │  - inventory            │
                          │  - transaction_logs     │
                          └────────────────────────┘
```

---

## 2. BACKEND — SPRING BOOT

### 2.1 Công nghệ

| Thành phần | Phiên bản | Mục đích |
|------------|-----------|----------|
| Spring Boot | 3.2 | Framework chính |
| Java | 21 | Ngôn ngữ lập trình |
| Spring Data JPA | 3.2 | ORM, quản lý database |
| Hibernate | 6.x | JPA implementation |
| PostgreSQL Driver | 42.x | JDBC driver |
| Lombok | 1.18.x | Giảm boilerplate code |
| Maven | 3.x | Build tool |

### 2.2 Cấu trúc package

```
com.warehouse/
├── controller/
│   └── WarehouseController.java   ← REST endpoints
├── service/
│   └── WarehouseService.java      ← Business logic + Mode state
├── dto/
│   ├── ScanRequest.java           ← Request DTO (qr, mode, scanEventId)
│   └── ScanResponse.java          ← Response DTO (success, message, ...)
├── entity/
│   ├── Inventory.java             ← JPA entity → bảng inventory
│   └── TransactionLog.java        ← JPA entity → bảng transaction_logs
├── repository/
│   ├── InventoryRepository.java   ← Spring Data JPA interface
│   └── TransactionLogRepository.java
└── WarehouseApiApplication.java   ← Main class
```

### 2.3 API Endpoints chi tiết

#### `POST /api/scan` — Xử lý quét QR

**Request:**
```json
{
    "qr": "SP-001",
    "mode": "NHAP",
    "scanEventId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Business Logic:**
```
1. Nhận request (qr, mode, scanEventId)
        │
        ▼
2. Kiểm tra scanEventId trùng?
   ├── CÓ → Trả kết quả cũ (idempotent), không mutate DB
   └── KHÔNG → Tiếp tục
        │
        ▼
3. Tìm sản phẩm theo qr_code
   ├── KHÔNG TÌM THẤY → Log FAILED + HTTP 404
   └── TÌM THẤY → Tiếp tục
        │
        ▼
4. Xử lý theo mode:
   ├── NHAP → quantity += 1 → Log SUCCESS → HTTP 200
   └── XUAT
        ├── quantity > 0 → quantity -= 1 → Log SUCCESS → HTTP 200
        └── quantity = 0 → Log FAILED → HTTP 400
```

**Response (200 OK):**
```json
{
    "success": true,
    "message": "Nhập kho thành công",
    "productName": "Laptop Dell XPS 15",
    "newQuantity": 26,
    "qrCode": "SP-001",
    "action": "NHAP"
}
```

**Idempotency:**
- Mỗi request scan kèm `scanEventId` (UUID, sinh bởi Frontend)
- Backend tìm trong bảng `transaction_logs` theo `scanEventId`
- Nếu đã tồn tại → trả kết quả cũ, **không** thay đổi `quantity`
- Điều này đảm bảo: dù network retry hay frontend gửi trùng, kho vẫn chính xác

**Annotation `@Transactional`:**
- Toàn bộ `processScan()` chạy trong 1 database transaction
- Nếu bất kỳ bước nào fail → rollback toàn bộ
- Đảm bảo tính nguyên tử: `inventory.quantity` và `transaction_logs` luôn đồng bộ

---

#### `GET /api/mode` — Lấy chế độ hiện tại

**Response:**
```json
{
    "mode": "NHAP"
}
```

Mode được lưu **trong bộ nhớ Backend** (`WarehouseService.currentMode`), không phải trong database. Khi Backend restart, mode reset về `""` (IDLE).

---

#### `POST /api/mode` — Đặt chế độ

**Request:**
```json
{
    "mode": "NHAP"
}
```

**Validation:** Chỉ chấp nhận `NHAP`, `XUAT`, `IDLE`, hoặc `""`. Các giá trị khác → HTTP 400.

---

#### `GET /api/inventory` — Danh sách tồn kho

Trả về toàn bộ bảng `inventory`, sắp xếp theo `updated_at DESC` (sản phẩm mới cập nhật lên đầu).

---

#### `GET /api/logs` — Lịch sử giao dịch

Trả về 50 bản ghi `transaction_logs` mới nhất, sắp xếp theo `created_at DESC`.

---

#### `GET /api/health` — Kiểm tra server

Trả về text: `"Smart Warehouse API is running!"`. Frontend dùng endpoint này để test kết nối.

---

### 2.4 Cấu hình (`application.properties`)

| Key | Giá trị | Mục đích |
|-----|---------|----------|
| `server.port` | 8080 | Port HTTP |
| `spring.datasource.url` | `jdbc:postgresql://localhost:5432/warehouse_db` | PostgreSQL URL |
| `spring.jpa.hibernate.ddl-auto` | `update` | Tự tạo/cập nhật bảng khi schema thay đổi |
| `spring.jpa.properties.hibernate.timezone.default_storage` | `NORMALIZE` | Đồng bộ timezone |

**`ddl-auto=update`:** Hibernate so sánh entity Java với schema hiện tại trong database. Nếu có cột mới (ví dụ `scan_event_id`) → tự động `ALTER TABLE` thêm cột. Không xóa cột cũ.

### 2.5 Static Files

Spring Boot phục vụ frontend từ thư mục `src/main/resources/static/`. Khi truy cập `http://localhost:8080/`, Spring Boot trả về `index.html` từ thư mục này.

**Cấu trúc:**
```
src/main/resources/static/
├── index.html
├── css/style.css
└── js/app.js
```

Các file này là **bản sao** (copy) từ `software/frontend/`. Khi chỉnh sửa, cần cập nhật **cả hai** nơi.

---

## 3. FRONTEND — WEB DASHBOARD

### 3.1 Công nghệ

| Thư viện | Phiên bản | CDN | Mục đích |
|----------|-----------|-----|----------|
| **MediaPipe Tasks Vision** | 0.10.3 | jsdelivr.net | Nhận diện cử chỉ tay (Gesture Recognition) |
| **jsQR** | — | CDN | Giải mã QR code từ canvas pixels |
| **Chart.js** | 4.x | CDN | Biểu đồ giao dịch 7 ngày |
| **QRCode.js** | — | CDN | Sinh mã QR hiển thị trong bảng kho |
| **Google Fonts (Inter)** | — | fonts.googleapis.com | Typography |

### 3.2 Kiến trúc Frontend

```
app.js (1473 dòng)
│
├── CONFIG — Cấu hình API URL, refresh interval
├── STATE — Trạng thái ứng dụng (connection, camera, mode, ...)
│
├── SCAN STATE — Chống quét trùng (cooldown, in-flight lock, fingerprint)
├── GESTURE STATE — Bộ đếm consensus cho gesture (4 frame liên tiếp)
│
├── INITIALIZATION
│   ├── cacheElements() — Cache tất cả DOM elements
│   ├── loadSettings() — Load từ localStorage
│   ├── setupEventListeners() — Gắn event handlers
│   ├── initChart() — Khởi tạo Chart.js
│   ├── fetchAllData() — Fetch dữ liệu ban đầu
│   └── initGestureRecognizer() — Load MediaPipe model
│
├── DATA FETCHING (auto-refresh mỗi 3s)
│   ├── fetchAllData() → /api/inventory + /api/logs
│   ├── renderInventoryTable()
│   ├── renderLogsTable()
│   ├── renderRecentActivity()
│   └── updateStats()
│
├── CAMERA
│   ├── connectCamera() — Kết nối MJPEG stream từ ESP32
│   ├── startQRScanner() — setInterval 500ms, đọc canvas
│   ├── startModePolling() — setInterval 2s, GET /api/mode
│   └── handleCameraError()
│
├── QR SCANNING (trong startQRScanner)
│   ├── Canvas drawImage (xoay 180°)
│   ├── jsQR decode
│   ├── handleScannedQR() — 5 lớp chống trùng
│   └── addScannedToUI()
│
├── GESTURE RECOGNITION (trong startQRScanner)
│   ├── gestureRecognizer.recognize(canvas)
│   ├── handleGestureDetection() — Temporal consensus
│   └── setModeManual() — POST /api/mode
│
└── UTILITIES
    ├── showToast() — Thông báo
    ├── formatDateTime() / formatTimeAgo()
    └── downloadQR() — Tải mã QR dạng PNG
```

### 3.3 Gesture Recognition — Chi tiết kỹ thuật

**Công nghệ:** Google MediaPipe Tasks Vision (WebAssembly + GPU delegate)

**Model:** `gesture_recognizer.task` (float16, ~5MB)
- Được load từ Google Storage CDN
- Chạy inference trên **GPU trình duyệt** thông qua WebGL
- Hỗ trợ nhận diện: Thumbs Up/Down, Open Palm, Closed Fist, Victory, Pointing Up, ILoveYou

**Luồng xử lý:**
```
Camera stream (MJPEG từ ESP32 port 81)
        │
        ▼
Canvas buffer (ẩn, không hiển thị)
        │
    ctx.rotate(Math.PI)    ← Xoay 180° vì camera gắn ngược
        │
        ▼
gestureRecognizer.recognize(canvas)
        │
        ▼
Kết quả: { categoryName: "Thumb_Up", score: 0.85 }
        │
        ▼
Score > 0.6?
├── NO → Bỏ qua
└── YES → handleGestureDetection()
             │
             ▼
        Temporal Consensus (4 frame liên tiếp)
             │
        gestureState.history = ["NHAP", "NHAP", "NHAP", "NHAP"]
             │
        Tất cả 4 frame giống nhau?
        ├── NO → Chờ thêm frame
        └── YES → Khác mode hiện tại?
                  ├── NO → Bỏ qua (đã set rồi)
                  └── YES → setModeManual() → POST /api/mode
                             │
                        Cooldown 3 giây (chống jitter)
```

**Tại sao cần Temporal Consensus (4 frame)?**
MediaPipe có thể nhận diện sai trong 1-2 frame riêng lẻ (ví dụ: tay đang giơ nửa chừng). Bằng cách yêu cầu 4 frame liên tiếp cùng một cử chỉ, hệ thống loại bỏ false positive gần như hoàn toàn.

### 3.4 QR Scanning — Chi tiết kỹ thuật

**Thư viện:** jsQR (pure JavaScript, không dependency)

**Luồng xử lý:**
```
Mỗi 500ms (setInterval):
│
├── Kiểm tra camera connected?
│   └── NO → Skip
│
├── Lấy naturalWidth/Height từ <img> MJPEG
│
├── Set canvas.width/height
│
├── ctx.save() → ctx.translate → ctx.rotate(Math.PI) → ctx.drawImage → ctx.restore()
│   (Xoay 180° trước khi vẽ do camera gắn ngược)
│
├── ctx.getImageData() → Raw pixel array (RGBA)
│
├── jsQR(imageData.data, width, height)
│   ├── Tìm thấy QR → handleScannedQR()
│   └── Không tìm thấy → Tiếp tục
│
└── gestureRecognizer.recognize(canvas)  ← Song song quét gesture
```

### 3.5 Hệ thống chống quét QR trùng — 5 lớp

| Lớp | Tên | Cơ chế | Vấn đề giải quyết |
|-----|-----|--------|-------------------|
| **1** | Global Cooldown | 2s sau mỗi scan thành công, 1s sau fail | Ngăn burst scan liên tiếp |
| **2** | Same-QR Cooldown | 4s cho cùng mã QR | Camera giữ QR lâu → quét lặp |
| **3** | In-flight Lock | Boolean flag, chỉ 1 request tại 1 thời điểm | Network chậm → frontend gửi lại |
| **4** | Frame Fingerprint | Hash pixels, bỏ qua frame đóng băng | Stream lag → cùng frame quét nhiều lần |
| **5** | Backend Idempotency | scanEventId (UUID) check trùng | Network retry → duplicate mutation |

**Frame Fingerprint hoạt động như thế nào?**
```javascript
function calculateFrameFingerprint(imageData) {
    let sum = 0;
    // Lấy mẫu mỗi pixel thứ 400 (nhanh, không tốn CPU)
    for (let i = 0; i < imageData.data.length; i += 1600) {
        sum += imageData.data[i] + imageData.data[i+1] + imageData.data[i+2];
    }
    return sum;
}
```
- Tính tổng RGB của ~0.25% pixels → tạo "dấu vân tay" khung hình
- So sánh với frame trước: nếu chênh lệch < 500 → frame đóng băng → bỏ qua
- Ngưỡng 500 đủ nhỏ để phát hiện frame clone, đủ lớn để không bị ảnh hưởng bởi noise JPEG

### 3.6 Camera Connection

**Giao thức:** MJPEG over HTTP (multipart/x-mixed-replace)

```
Browser <img> ──HTTP GET──> ESP32 Port 81
                              │
                              ▼
                    HTTP 200 OK
                    Content-Type: multipart/x-mixed-replace; boundary=frame
                    
                    --frame
                    Content-Type: image/jpeg
                    Content-Length: 35420
                    
                    [JPEG binary data...]
                    
                    --frame
                    Content-Type: image/jpeg
                    Content-Length: 34890
                    
                    [JPEG binary data...]
                    ... (liên tục, ~30 FPS)
```

**Cách kết nối:**
1. Người dùng nhập IP ESP32 + Port (81) + Endpoint (/stream) trên trang Camera
2. Frontend set `<img src="http://[IP]:81/stream">`
3. Tag `<img>` browser tự xử lý MJPEG → hiển thị hình liên tục
4. CSS `transform: rotate(180deg)` xoay hình hiển thị
5. Canvas ẩn vẽ lại frame (có xoay) → cung cấp pixels cho jsQR và MediaPipe

### 3.7 UI Design — Glassmorphism

**Phong cách:** Glassmorphism — hiệu ứng kính mờ (frosted glass)

**Kỹ thuật CSS:**
```css
.card {
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
}
```

**Các thành phần UI chính:**
- **Dashboard**: 4 stat cards (tổng SP, tổng SL, hết hàng, giao dịch hôm nay) + biểu đồ 7 ngày + hoạt động gần đây
- **Kho hàng**: Bảng inventory + QR code + nút tải QR
- **Lịch sử**: Bảng transaction logs + highlight dòng mới
- **Camera**: Stream trực tiếp + trạng thái quét QR + chế độ hiện tại + nút NHẬP/XUẤT
- **Cài đặt**: IP camera, API URL, refresh interval, test connection

### 3.8 Mode Polling

Frontend poll chế độ từ Backend mỗi 2 giây:

```
setInterval(async () => {
    const res = await fetch('/api/mode');
    const data = await res.json();      // {"mode": "NHAP"}
    state.esp32Mode = data.mode;
    // Cập nhật badge UI: "NHẬP KHO (Ghi tăng)" hoặc "XUẤT KHO (Ghi giảm)"
}, 2000);
```

---

## 4. DATABASE — POSTGRESQL

### 4.1 Schema

#### Bảng `inventory`

| Cột | Kiểu | Ràng buộc | Mô tả |
|-----|------|-----------|-------|
| `qr_code` | VARCHAR(50) | **PRIMARY KEY** | Mã QR duy nhất |
| `product_name` | VARCHAR(255) | NOT NULL | Tên sản phẩm |
| `quantity` | INT | NOT NULL, DEFAULT 0, CHECK >= 0 | Số lượng tồn |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT NOW | Lần cập nhật cuối |

**Constraint `CHECK (quantity >= 0)`:** Database tự đảm bảo quantity không bao giờ âm, kể cả khi application logic bug.

#### Bảng `transaction_logs`

| Cột | Kiểu | Ràng buộc | Mô tả |
|-----|------|-----------|-------|
| `id` | UUID | **PRIMARY KEY**, DEFAULT gen_random_uuid() | ID giao dịch |
| `qr_code` | VARCHAR(50) | NOT NULL | Mã QR sản phẩm |
| `action` | VARCHAR(10) | NOT NULL, CHECK IN ('NHAP','XUAT') | Loại hành động |
| `status` | VARCHAR(10) | NOT NULL, CHECK IN ('SUCCESS','FAILED') | Kết quả |
| `message` | VARCHAR(255) | | Thông báo chi tiết |
| `scan_event_id` | VARCHAR(255) | | UUID chống trùng (idempotency) |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT NOW | Thời gian giao dịch |

**Indexes:**
| Index | Cột | Mục đích |
|-------|-----|----------|
| `idx_transaction_logs_created_at` | `created_at DESC` | Sắp xếp nhanh khi hiển thị lịch sử |
| `idx_transaction_logs_qr_code` | `qr_code` | Tìm kiếm nhanh theo sản phẩm |
| `idx_transaction_logs_scan_event_id` | `scan_event_id` | Kiểm tra trùng idempotency nhanh |

**Tại sao không có Foreign Key?**
Bảng `transaction_logs` **không có FK** tới `inventory`. Lý do: khi QR code không tồn tại → vẫn cần ghi log FAILED. Nếu có FK, INSERT sẽ bị constraint violation.

### 4.2 Sample Data

File `init.sql` chứa 10 sản phẩm mẫu (SP-001 → SP-010) và 10 giao dịch mẫu phân bố trong 2 giờ gần nhất.

---

## 5. LUỒNG DỮ LIỆU TOÀN HỆ THỐNG

### 5.1 Quét QR thành công

```
[1] Camera ESP32 ──MJPEG──> Browser <img>
                               │
[2] Browser Canvas ──pixels──> jsQR.decode()
                               │ QR = "SP-001"
                               │
[3] 5-layer anti-dup check ────┤ (tất cả pass?)
                               │
[4] fetch('POST /api/scan', {  │
      qr: "SP-001",            │
      mode: "NHAP",            │
      scanEventId: "uuid-xxx"  │
    })                         │
                               ▼
[5] WarehouseController.processScan()
                               │
[6] WarehouseService:          │
    - Check idempotency        │
    - Find inventory           │
    - quantity += 1            │
    - Save inventory           │
    - Log transaction          │
                               ▼
[7] Response 200: { success: true, newQuantity: 26 }
                               │
[8] Browser: showToast("Quét thành công")
             addScannedToUI()
             fetchAllData() ← Refresh bảng kho
```

### 5.2 Chuyển chế độ bằng gesture

```
[1] Camera frame ──Canvas──> MediaPipe.recognize()
                               │
[2] Result: { Thumb_Up, score: 0.87 }
                               │
[3] Temporal consensus: 4/4 frames = "NHAP"
                               │
[4] fetch('POST /api/mode', { mode: "NHAP" })
                               │
[5] WarehouseService.setCurrentMode("NHAP")
                               │
[6] Response 200: { success: true, mode: "NHAP" }
                               │
[7] showToast("Đã chuyển sang chế độ NHẬP")
    Cooldown 3 giây
                               │
[8] Mode polling (GET /api/mode mỗi 2s) cập nhật badge UI
```

---

## 6. BẢO MẬT VÀ HẠN CHẾ

| Hạn chế | Chi tiết |
|---------|----------|
| **Không authentication** | Bất kỳ ai trên mạng LAN đều có thể gọi API |
| **CORS mở hoàn toàn** | `Access-Control-Allow-Origin: *` |
| **Mode trong RAM** | Backend restart → mode reset về IDLE |
| **Không encryption** | HTTP (không HTTPS), dữ liệu truyền plaintext |
| **Single instance** | Không hỗ trợ multiple backend instances (mode state trong RAM) |

**Phạm vi sử dụng:** Chỉ phù hợp cho **mạng nội bộ/lab**, không deploy public internet.
