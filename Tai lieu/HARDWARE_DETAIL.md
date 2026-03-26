# Chi Tiết Phần Cứng — Smart Warehouse IoT

---

## 1. TỔNG QUAN HỆ THỐNG PHẦN CỨNG

Hệ thống sử dụng vi điều khiển **ESP32-S3-N16R8** làm trung tâm xử lý, tích hợp camera để stream hình ảnh, cảm biến chuyển động để tiết kiệm năng lượng, màn hình LCD để hiển thị trạng thái, và các thành phần phản hồi (LED, Buzzer).

### Sơ đồ khối phần cứng

```
                    ┌─────────────────────────────────┐
                    │        ESP32-S3-N16R8            │
                    │   (16MB Flash + 8MB PSRAM)       │
                    │                                  │
    ┌───────┐       │  ┌─────────┐    ┌────────────┐  │
    │OV3660 │◄─────►│  │ Core 0  │    │  Core 1    │  │
    │Camera │ 8-bit │  │ Stream  │    │  Main Loop │  │
    │       │ Bus   │  │ Task    │    │  PIR+LCD+  │  │
    └───────┘       │  │         │    │  Serial    │  │
                    │  └─────────┘    └────────────┘  │
                    │                                  │
    ┌───────┐       │  ┌───────────────────────────┐  │       ┌─────────┐
    │PIR    │──────►│  │                           │  │──────►│ LCD     │
    │HC-SR501│ GPIO │  │      WiFi 802.11 b/g/n    │  │ I2C   │ 1602A   │
    │       │  21   │  │                           │  │ 41,42 │         │
    └───────┘       │  └───────────────────────────┘  │       └─────────┘
                    │                                  │
    ┌───────┐       │  ┌───────────────────────────┐  │       ┌─────────┐
    │LED    │◄─────┤│  │   FreeRTOS + Arduino      │  │──────►│ Buzzer  │
    │Xanh   │ GPIO │  │   Framework                │  │ GPIO  │ 5V      │
    │       │  1    │  │                           │  │  48   │(NPN)    │
    └───────┘       │  └───────────────────────────┘  │       └─────────┘
                    └─────────────────────────────────┘
```

---

## 2. LINH KIỆN CHI TIẾT

### 2.1 ESP32-S3-N16R8

| Thông số | Giá trị |
|----------|---------|
| **MCU** | Xtensa® dual-core 32-bit LX7, lên tới 240 MHz |
| **Flash** | 16 MB (Quad SPI) |
| **PSRAM** | 8 MB (Octal SPI) — dùng cho camera frame buffer |
| **WiFi** | 802.11 b/g/n, 2.4 GHz |
| **GPIO** | 45 chân, hỗ trợ RTC GPIO cho Deep Sleep wakeup |
| **I2C** | 2 bus riêng biệt (Camera bus + LCD bus) |
| **Nguồn** | 3.3V logic, USB 5V input |

**Tại sao chọn S3-N16R8?**
- **PSRAM 8MB**: Bắt buộc cho camera streaming. Mỗi frame JPEG ở VGA (640×480) chiếm ~30-50KB. Với `fb_count = 2` (double buffering), cần ít nhất 100KB RAM liên tục. SRAM nội bộ chỉ có ~512KB, phần lớn đã dùng cho WiFi stack, FreeRTOS, và heap.
- **Dual-core**: Core 0 chạy camera stream task, Core 1 chạy main loop (PIR, LCD, Serial, API). Hai tác vụ hoàn toàn độc lập, không block lẫn nhau.
- **RTC GPIO**: GPIO 21 hỗ trợ RTC domain — duy trì hoạt động ngay cả khi chip ở Deep Sleep, cho phép chân PIR đánh thức ESP32 qua `ext0_wakeup`.

### 2.2 Camera OV3660

| Thông số | Giá trị |
|----------|---------|
| **Cảm biến** | 3MP CMOS |
| **Độ phân giải stream** | VGA (640×480) |
| **Giao tiếp** | 8-bit parallel data bus + I2C control (SCCB) |
| **Pixel format** | JPEG (nén phần cứng trên chip OV3660) |
| **JPEG quality** | 12 (thang 0-63, giá trị thấp = chất lượng cao hơn) |
| **Frame buffer** | 2 buffers trong PSRAM (double buffering, chế độ CAMERA_GRAB_LATEST) |
| **FPS** | ~30 FPS (delay 33ms giữa các frame) |
| **Xung clock** | XCLK 20 MHz |

**Bảng chân kết nối Camera ↔ ESP32:**

| Chân Camera | GPIO ESP32 | Chức năng |
|-------------|------------|-----------|
| XCLK | 15 | Master clock (20MHz) — ESP32 cung cấp xung nhịp cho camera |
| PCLK | 13 | Pixel clock — camera báo khi pixel data sẵn sàng |
| VSYNC | 6 | Vertical sync — báo hiệu bắt đầu/kết thúc 1 frame |
| HREF | 7 | Horizontal reference — báo hiệu bắt đầu/kết thúc 1 dòng pixel |
| D0 | 11 | Data bit 0 (LSB) |
| D1 | 9 | Data bit 1 |
| D2 | 8 | Data bit 2 |
| D3 | 10 | Data bit 3 |
| D4 | 12 | Data bit 4 |
| D5 | 18 | Data bit 5 |
| D6 | 17 | Data bit 6 |
| D7 | 16 | Data bit 7 (MSB) |
| SIOD (SDA) | 4 | I2C Data — Camera control bus |
| SIOC (SCL) | 5 | I2C Clock — Camera control bus |
| PWDN | -1 | Không dùng (kéo xuống bên trong) |
| RESET | -1 | Không dùng |

**Cách hoạt động streaming:**
1. ESP32 cấp xung XCLK 20MHz cho camera
2. Camera nén ảnh JPEG bằng phần cứng nội bộ (không tốn CPU ESP32)
3. Dữ liệu JPEG được truyền song song qua 8 chân D0-D7, đồng bộ bằng PCLK/VSYNC/HREF
4. DMA controller ESP32 tự động copy dữ liệu vào frame buffer trong PSRAM
5. `esp_camera_fb_get()` trả về con trỏ tới buffer sẵn sàng
6. Stream task gửi buffer qua HTTP MJPEG (multipart/x-mixed-replace)

**Camera gắn ngược 180°:**
Camera được gắn cố định trên mạch ở vị trí lật ngược. Thay vì xử lý trên ESP32 (tốn CPU), hệ thống xử lý trên trình duyệt:
- CSS: `transform: rotate(180deg)` trên thẻ `<img>` hiển thị
- Canvas: `ctx.rotate(Math.PI)` trước khi vẽ vào buffer quét QR/Gesture

### 2.3 PIR HC-SR501

| Thông số | Giá trị |
|----------|---------|
| **Loại** | Pyroelectric Infrared (hồng ngoại thụ động) |
| **Điện áp** | 4.5V - 20V |
| **Output** | Digital HIGH (3.3V) khi phát hiện chuyển động |
| **Góc phát hiện** | ~120° |
| **Khoảng cách** | 3-7m (điều chỉnh bằng biến trở) |
| **GPIO** | 21 (RTC GPIO, hỗ trợ ext0 wakeup) |

**Nguyên lý hoạt động:**
- Phần tử pyroelectric bên trong phản ứng với **sự thay đổi bức xạ hồng ngoại** (nhiệt cơ thể người di chuyển)
- Khi người di chuyển qua vùng phát hiện → sự thay đổi nhiệt tạo ra tín hiệu điện → bộ khuếch đại trong module → output HIGH

**Vấn đề warm-up và giải pháp:**

Khi mới cấp nguồn, phần tử pyroelectric cần thời gian (~30 giây) để đạt cân bằng nhiệt với môi trường. Trong thời gian này, PIR phát tín hiệu HIGH/LOW ngẫu nhiên (nhiễu).

**Giải pháp phần mềm (Tối ưu chống nhiễu):**
- **Software Debounce (100ms)**: Tín hiệu PIR phải giữ HIGH liên tục trong 100ms mới xác nhận có người. Loại bỏ các xung nhiễu ngắn từ WiFi.
- **Hardware Pull-down**: Cấu hình `INPUT_PULLDOWN` trên ESP32 để giữ điện thế chân GPIO ổn định khi không có tín hiệu.
- **Warm-up guard (30s)**: Cấm sleep trong 30s đầu sau Cold Boot để tránh vòng lặp sleep → wake → sleep. Khi được đánh thức từ Deep Sleep (`wokeFromSleep() == true`), bỏ qua warm-up và cho phép ngủ ngay.

**2 biến trở trên HC-SR501:**
- **Sensitivity (Sx)**: Điều chỉnh khoảng cách phát hiện (3-7m). Xoay xuôi kim đồng hồ = xa hơn.
- **Time Delay (Tx)**: Thời gian output duy trì HIGH sau khi phát hiện (3s-300s). Nên vặn về mức tối thiểu (~3s) để PIR nhạy nhất.

### 2.4 LCD 1602A (I2C)

| Thông số | Giá trị |
|----------|---------|
| **Hiển thị** | 16 ký tự × 2 dòng |
| **Giao tiếp** | I2C qua module PCF8574 |
| **Địa chỉ I2C** | Tự động quét: 0x27, 0x3F, 0x20, 0x3E |
| **SDA** | GPIO 41 |
| **SCL** | GPIO 42 |
| **Nguồn** | 5V (từ USB ESP32) |

**Lưu ý bus I2C:**
ESP32-S3 hỗ trợ nhiều bus I2C phần cứng. Trong hệ thống này:
- **Bus 1** (GPIO 4, 5): Dành cho camera (giao thức SCCB — tương thích I2C)
- **Bus 2** (GPIO 41, 42): Dành cho LCD

Hai bus này hoạt động **hoàn toàn độc lập**, không xung đột.

**Cơ chế chống nhấp nháy:**
LCD chỉ được cập nhật khi dữ liệu hiển thị **thay đổi thực sự** (so sánh `lastShownSeconds` và `lastLine1`). Nếu giá trị giống frame trước → bỏ qua → giảm traffic I2C và loại bỏ hiện tượng nhấp nháy.

**Các trạng thái hiển thị:**

| Trạng thái | Dòng 1 | Dòng 2 |
|------------|--------|--------|
| Khởi động | `Smart Warehouse` | `Khoi dong...` |
| Kết nối WiFi | `Ket noi WiFi...` | `[SSID]` |
| WiFi OK | `WiFi OK!` | `[IP Address]` |
| Warm-up PIR | `DANG ON DINH...` | `Vui long cho PIR` |
| Chờ chế độ | `Cho lenh NH/XU` | `Sleep: XXs` |
| Chế độ NHẬP | `>> NHAP <<` | `Sleep: XXs` |
| Chế độ XUẤT | `>> XUAT <<` | `Sleep: XXs` |
| Sắp ngủ | Giữ nguyên | `Sap ngu: Xs` |
| Đi ngủ | `DI NGU...` | `Bye bye!` |
| Thức dậy | `THUC DAY!` | `PIR phat hien` |

### 2.5 LED Xanh

| Thông số | Giá trị |
|----------|---------|
| **GPIO** | 1 |
| **Điện trở** | 220Ω (hạn dòng) |
| **Chức năng** | Nháy cảnh báo khi countdown < 10s (sắp ngủ) |
| **Tần số nháy** | 1 Hz (500ms ON / 500ms OFF) |

**Lưu ý:** LED **KHÔNG** sáng khi đổi chế độ NHẬP/XUẤT. Chỉ nháy duy nhất khi sắp vào Deep Sleep.

### 2.6 Buzzer 5V + Transistor 2N2222

| Thông số | Giá trị |
|----------|---------|
| **GPIO** | 48 |
| **Transistor** | 2N2222 NPN |
| **Điện trở Base** | 1kΩ |

**Tại sao cần transistor?**
ESP32 GPIO output 3.3V, dòng tối đa ~40mA. Buzzer 5V cần dòng lớn hơn. Transistor 2N2222 đóng vai trò switch:
- GPIO 48 HIGH → Base nhận dòng qua 1kΩ → Transistor dẫn → Buzzer kêu
- GPIO 48 LOW → Transistor ngắt → Buzzer tắt

**Sơ đồ mạch:**
```
GPIO 48 ──── 1kΩ ──── Base (B)
                       │
                    2N2222
                       │
              Emitter (E) ──── GND
                       │
              Collector (C) ──── Buzzer (-) ──── Buzzer (+) ──── 5V
```

**Các pattern âm thanh:**
- `beepShort()`: 120ms — khi set mode qua Serial
- `beepSuccess()`: 350ms — quét QR thành công
- `beepError()`: 3×(70ms ON + 70ms OFF) — quét QR thất bại

---

## 3. LUỒNG HOẠT ĐỘNG FIRMWARE

### 3.1 Boot Sequence

```
Power ON / Reset
       │
       ▼
┌─────────────────────┐
│ 1. Serial 115200    │
│ 2. Init LCD → Boot  │
│ 3. Init LED + Buzz  │  ← LED xanh nháy 1 lần + beep test
│ 4. Init PIR GPIO 21 │
│ 5. Init Camera      │  ← OV3660, VGA, JPEG, 2 buffers
│ 6. Connect WiFi     │  ← Timeout 15s
│ 7. Start Stream     │  ← Port 81, FreeRTOS Core 0
│ 8. Start API Server │  ← Port 82
└─────────────────────┘
       │
       ▼
  STATE_ACTIVE
```

### 3.2 State Machine

```
    ┌────────────────────────┐
    │                        │
    ▼                        │
STATE_ACTIVE                 │
    │                        │
    ├── PIR HIGH → Reset     │
    │   countdown            │
    │                        │
    ├── Countdown < 10s →    │
    │   LED nháy             │
    │                        │
    ├── Countdown = 0 →      │
    │   (sleepAllowed?)      │
    │   ├── YES → SLEEP ─────┘ (PIR wakeup → RESET → Boot lại)
    │   └── NO → Reset countdown (warm-up guard)
    │
    └── Serial command → Xử lý (NHAP/XUAT/SLEEP/STATUS...)
```

### 3.3 Dual-Core Architecture

| Core | Task | Priority | Chức năng |
|------|------|----------|-----------|
| **Core 0** | `cam_stream` | 1 | MJPEG streaming liên tục, phục vụ client Web |
| **Core 1** | `loop()` | 1 | Main loop: PIR, LCD, LED, Serial, API server port 82 |

Hai core hoạt động **song song thực sự** (không phải time-sharing). Camera stream không bao giờ bị gián đoạn bởi logic chính trên Core 1.

### 3.4 Deep Sleep

**Tiêu thụ năng lượng:**
- Active: ~180-240mA (WiFi + Camera + LCD)
- Deep Sleep: ~10µA (chỉ RTC domain duy trì)

**Quy trình:**
1. Countdown chạm 0 và `sleepAllowed() == true`
2. LCD hiển thị "DI NGU..." 1.5 giây
3. Tắt LCD backlight, tắt LED, tắt Buzzer
4. Gọi `esp_sleep_enable_ext0_wakeup(GPIO_21, HIGH)` — wakeup khi PIR output HIGH
5. `esp_deep_sleep_start()` — chip vào Deep Sleep, CPU tắt hoàn toàn
6. Khi PIR phát hiện chuyển động → GPIO 21 HIGH → ESP32 hardware reset
7. `setup()` chạy lại từ đầu, nhưng `wokeFromSleep()` trả `true` → bỏ qua warm-up guard

### 3.5 API Server (Port 82)

ESP32 chạy một WiFiServer đơn giản trên port 82 để trả về chế độ hiện tại dưới dạng JSON:

```json
{"mode":"NHAP"}
```

- Timeout: 50ms (non-blocking, không ảnh hưởng PIR polling)
- CORS: Mở hoàn toàn (`Access-Control-Allow-Origin: *`)
- Mục đích: Legacy endpoint, Web hiện tại poll từ Backend `/api/mode` thay vì port 82

---

## 4. SƠ ĐỒ ĐIỆN HOÀN CHỈNH

```
                               5V USB
                                │
                    ┌───────────┴───────────┐
                    │     ESP32-S3-N16R8    │
                    │                       │
   OV3660 Camera    │                       │     LCD 1602A
   ┌─────────┐      │  GPIO 15 ← XCLK      │     ┌─────────┐
   │ D0-D7   │◄────►│  GPIO 4  ← SIOD      │     │ SDA     │◄── GPIO 41
   │ VSYNC   │──────│  GPIO 5  ← SIOC      │     │ SCL     │◄── GPIO 42
   │ HREF    │──────│  GPIO 13 ← PCLK      │     │ VCC     │◄── 5V
   │ PCLK    │      │  GPIO 6  ← VSYNC     │     │ GND     │◄── GND
   │ VCC=3.3V│      │  GPIO 7  ← HREF      │     └─────────┘
   └─────────┘      │                       │
                    │                       │
   PIR HC-SR501     │  GPIO 21 ← PIR OUT    │
   ┌─────────┐      │                       │     Buzzer Circuit
   │ OUT     │──────│                       │     ┌──────────────────┐
   │ VCC=5V  │      │  GPIO 48 ── 1kΩ ──┐  │     │  5V ── Buzz+ ── │
   │ GND     │      │                   │  │     │  Buzz- ── C     │
   └─────────┘      │              Base(B) 2N2222│     │           E ── GND │
                    │                       │     └──────────────────┘
   LED Xanh         │                       │
   ┌─────────┐      │  GPIO 1 ── 220Ω ──LED│
   │ Anode   │◄─────│                       │
   │ Cathode │──GND │                       │
   └─────────┘      └───────────────────────┘
```
