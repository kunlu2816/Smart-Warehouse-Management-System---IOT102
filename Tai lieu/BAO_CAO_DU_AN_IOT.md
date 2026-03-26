# Báo Cáo Dự Án: Hệ Thống IoT Quản Lý Kho Hàng Thông Minh

**Mã dự án:** IOT102-2026  
**Thời gian:** Tháng 3, 2026  
**Nền tảng:** ESP32-S3-N16R8 + Spring Boot Backend

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1 Mục tiêu
Xây dựng hệ thống quản lý kho hàng tự động sử dụng công nghệ IoT:
- **Nhập/Xuất kho**: Nhận diện cử chỉ tay (Gesture) qua camera trên trình duyệt Web (MediaPipe)
- **Quét mã QR**: Camera ESP32 stream lên Web → jsQR decode trên trình duyệt
- **Chống quét trùng**: 5 lớp bảo vệ (frontend + backend idempotency)
- **Giám sát**: Cảm biến chuyển động PIR để tiết kiệm năng lượng (Deep Sleep)
- **Phản hồi**: Màn hình LCD hiển thị trạng thái, LED xanh cảnh báo sắp ngủ
- **Lưu trữ dữ liệu**: Backend Spring Boot + PostgreSQL
- **Dashboard**: Giao diện web Glassmorphism theo dõi thời gian thực

### 1.2 Kiến trúc hệ thống
```
┌──────────────────────────────────────────────────────────────────┐
│                     SMART WAREHOUSE IoT SYSTEM                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐                                            │
│  │   ESP32-S3-N16R8 │                                            │
│  │   ┌────────────┐ │     ┌──────────────┐     ┌──────────────┐  │
│  │   │ OV3660     │ │     │              │     │              │  │
│  │   │ (Camera)   │ │     │  Spring Boot │     │  PostgreSQL  │  │
│  │   ├────────────┤ │     │  (REST API)  │     │  (Database)  │  │
│  │   │ PIR,LCD,   │ │     │  Port 8080   │     │  Port 5432   │  │
│  │   │ LED,Buzzer │ │     └──────┬───────┘     └──────────────┘  │
│  │   └────────────┘ │            │                               │
│  └──────────────────┘            ▼                               │
│                           ┌──────────────┐                       │
│  Browser (MediaPipe +     │  Dashboard   │                       │
│  jsQR + Gesture)    ◄────▶│  (Web UI)    │                      │
│                           └──────────────┘                       │
└──────────────────────────────────────────────────────────────────┘
```

**Luồng dữ liệu chính:**
1. ESP32 stream camera → Web Browser hiển thị
2. Browser nhận diện cử chỉ tay (👍 NHẬP / 👎 XUẤT) → POST /api/mode
3. Browser quét QR từ stream → POST /api/scan (kèm scanEventId)
4. Backend xử lý nhập/xuất kho → cập nhật PostgreSQL
5. Dashboard hiển thị kết quả thời gian thực

---

## 2. THIẾT BỊ PHẦN CỨNG

### 2.1 Danh sách thiết bị

| STT | Thiết bị | Model/Loại | Số lượng | Mục đích |
|-----|----------|------------|----------|----------|
| 1 | Vi điều khiển | ESP32-S3-N16R8 | 1 | Xử lý chính |
| 2 | Camera | OV3660 | 1 | Stream MJPEG cho QR scan + Gesture trên Web |
| 3 | Màn hình LCD | 1602A I2C | 1 | Hiển thị countdown, chế độ, trạng thái |
| 4 | Cảm biến chuyển động | HC-SR501 | 1 | Phát hiện người + đánh thức Deep Sleep |
| 5 | Buzzer | 5V | 1 | Báo âm thanh |
| 6 | Transistor | 2N2222 (NPN) | 1 | Điều khiển Buzzer 5V từ GPIO 3.3V |
| 7 | LED Xanh | 3mm | 1 | Nháy cảnh báo sắp ngủ (countdown < 10s) |
| 8 | Điện trở | 220Ω, 1kΩ | Nhiều | Bảo vệ linh kiện |
| 9 | Breadboard | 400 điểm | 1 | Kết nối |

### 2.2 Sơ đồ đấu nối

#### Bảng chân ESP32-S3-N16R8

| Thiết bị | Chân ESP32 | Ghi chú |
|----------|------------|---------|
| **Camera OV3660** | | |
| XCLK | 15 | Clock cho camera |
| PCLK | 13 | Pixel clock |
| VSYNC | 6 | Vertical sync |
| HREF | 7 | Horizontal reference |
| D0-D7 | 11,9,8,10,12,18,17,16 | Data bus |
| SIOD/SIOC | 4, 5 | I2C camera bus |
| **LCD 1602A I2C** | | |
| SDA | 41 | I2C Data — LCD bus (bus riêng) |
| SCL | 42 | I2C Clock — LCD bus (bus riêng) |
| **Cảm biến PIR** | | |
| OUT | 21 | RTC GPIO — hỗ trợ Deep Sleep wakeup |
| **Buzzer + Transistor** | | |
| Base (2N2222) | 48 | Điều khiển qua transistor NPN |
| **LED** | | |
| LED Xanh | 1 | Qua điện trở 220Ω — chỉ nháy khi sắp ngủ |

#### Sơ đồ đấu nối Buzzer (Transistor 2N2222)
```
GPIO 48 ──── 1kΩ ──── Base (B) 2N2222
                       │
                      Emitter (E) ── GND
                       │
                      Collector (C) ── Buzzer (-) ── Buzzer (+) ── 5V
```

#### Sơ đồ đấu nối LED
```
GPIO 1 (Xanh) ── 220Ω ── LED Anode (+) ── LED Cathode (-) ── GND
```

---

## 3. CẤU TRÚC PHẦN MỀM

### 3.1 Thư mục dự án

```
D:\Semester_4\IOT102\Project\
├── BAO_CAO_DU_AN_IOT.md             # Báo cáo dự án (file này)
├── CLAUDE.md                         # Hướng dẫn cho AI
├── hardware/
│   └── esp32-firmware/
│       └── src/
│           └── smart_warehouse/      # Firmware chính
│               ├── smart_warehouse.ino
│               ├── config.h
│               ├── camera_module.h
│               ├── display_module.h
│               ├── feedback_module.h
│               ├── sensor_module.h
│               ├── stream_module.h
│               └── wifi_module.h
├── software/
│   ├── backend/
│   │   └── warehouse-api/            # Spring Boot REST API
│   │       ├── pom.xml
│   │       └── src/main/java/com/warehouse/
│   │           ├── controller/WarehouseController.java
│   │           ├── service/WarehouseService.java
│   │           ├── dto/ScanRequest.java
│   │           ├── entity/TransactionLog.java, Inventory.java
│   │           └── repository/...
│   ├── frontend/
│   │   ├── index.html                # Dashboard SPA
│   │   ├── css/style.css
│   │   └── js/app.js                 # Gesture + QR + Mode
│   └── database/
│       └── init.sql                  # PostgreSQL schema
└── docker/                           # Docker config (tương lai)
```

### 3.2 Firmware ESP32

**`smart_warehouse.ino`** — State machine chính:
- `STATE_ACTIVE`: Hoạt động — LCD countdown, PIR detection, camera stream
- `STATE_SLEEP`: Deep Sleep — PIR wakeup qua ext0

**Luồng hoạt động:**
```
Boot → LCD "Khoi dong" → Init Camera, PIR, WiFi
     → Camera stream Port 81
     → PIR warm-up guard 30s (cấm sleep, PIR vẫn đọc)
     → Countdown → LED xanh nháy khi <10s → Sleep khi =0
     → PIR wakeup → Boot lại (không warm-up)
```

**Serial commands (debug):** `NHAP`, `XUAT`, `SLEEP`, `WAKEUP`, `STREAM`, `STATUS`, `HELP`

### 3.3 Backend API (Spring Boot)

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/mode` | GET | Lấy chế độ hiện tại |
| `/api/mode` | POST | Đặt chế độ (NHAP/XUAT/IDLE) |
| `/api/scan` | POST | Xử lý quét QR (có idempotency) |
| `/api/inventory` | GET | Danh sách tồn kho |
| `/api/logs` | GET | 50 giao dịch gần nhất |
| `/api/camera/stream` | GET | Proxy MJPEG stream (chống CORS) |

**Business Logic:**
- **NHAP**: quantity += 1, ghi TransactionLog SUCCESS
- **XUAT**: quantity -= 1 (nếu > 0), ghi TransactionLog SUCCESS hoặc FAILED
- **Idempotency**: `scanEventId` (UUID) → nếu trùng thì trả kết quả cũ, không mutate

### 3.4 Frontend Web

**Công nghệ:** Vanilla HTML/CSS/JS + MediaPipe Tasks Vision + jsQR

**Chức năng chính:**
1. **Gesture Recognition**: MediaPipe Hands — 👍 Thumbs Up = NHẬP, 👎 Thumbs Down = XUẤT
2. **Nút bấm thủ công**: NHẬP / XUẤT trên giao diện
3. **QR Scanning**: jsQR decode từ camera stream
4. **Camera xoay 180°**: CSS `rotate(180deg)` + Canvas `ctx.rotate(Math.PI)` (camera gắn ngược)
5. **Dashboard**: Biểu đồ, bảng tồn kho, lịch sử giao dịch

**Chống quét QR trùng (5 lớp):**

| Lớp | Vị trí | Cơ chế |
|-----|--------|--------|
| 1 | Frontend | Global cooldown 2s sau mỗi scan |
| 2 | Frontend | Same-QR cooldown 4s |
| 3 | Frontend | In-flight lock (1 request/thời điểm) |
| 4 | Frontend | Frame fingerprint (chặn frame đóng băng) |
| 5 | Backend | `scanEventId` idempotency check |

---

## 4. DATABASE

### 4.1 Schema

```sql
-- Bảng tồn kho
CREATE TABLE inventory (
    qr_code      VARCHAR(50) PRIMARY KEY,
    product_name VARCHAR(200) NOT NULL,
    quantity     INTEGER DEFAULT 0 CHECK (quantity >= 0),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lịch sử giao dịch
CREATE TABLE transaction_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code       VARCHAR(50) NOT NULL,
    action        VARCHAR(10) NOT NULL,  -- 'NHAP' | 'XUAT'
    status        VARCHAR(10) NOT NULL,  -- 'SUCCESS' | 'FAILED'
    message       TEXT,
    scan_event_id VARCHAR(255),          -- UUID chống trùng
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. HƯỚNG DẪN CHẠY

### 5.1 Database
```bash
# PostgreSQL phải chạy trên localhost:5432
psql -U postgres -d warehouse_db -f software/database/init.sql
```

### 5.2 Backend
```bash
cd software/backend/warehouse-api
mvn spring-boot:run    # Port 8080
```

### 5.3 ESP32
1. Mở `hardware/esp32-firmware/src/smart_warehouse/smart_warehouse.ino` trong Arduino IDE
2. Board: `ESP32-S3 Dev Module`, Partition: `Huge APP (3MB No OTA)`
3. Sửa WiFi trong `config.h` nếu cần
4. Upload firmware

### 5.4 Sử dụng
1. Mở trình duyệt → `http://localhost:8080`
2. Vào trang Camera → nhập IP ESP32 → Kết nối
3. Giơ 👍 để chuyển NHẬP hoặc 👎 để chuyển XUẤT
4. Đưa mã QR trước camera → hệ thống tự quét và cập nhật kho

---

## 6. GHI CHÚ KỸ THUẬT

- **Camera gắn ngược**: Đã xử lý bằng CSS rotate + Canvas rotate trong frontend
- **PIR noise reduction**: Warm-up guard 30s (Cold Boot), filter 100ms và INPUT_PULLDOWN để loại bỏ tín hiệu giả. Bỏ qua warm-up khi được đánh thức từ Deep Sleep.
- **Camera auto-reconnect**: Health check watchdog ping ESP32 mỗi 10s. Khi ESP32 ngủ, tự động retry kết nối mỗi 5s cho đến khi thành công.
- **LED**: Chỉ dùng LED xanh, nháy khi countdown < 10s. Không LED khi đổi chế độ
- **Voice**: Đã loại bỏ hoàn toàn — chế độ được set từ Web (Gesture hoặc nút bấm)
- **Security**: Không có authentication. Chỉ dùng trên mạng nội bộ