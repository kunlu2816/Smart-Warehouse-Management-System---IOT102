/**
 * ============================================================
 *              SMART WAREHOUSE IoT SYSTEM
 * ============================================================
 *
 * LUỒNG HOẠT ĐỘNG:
 *   1. Khởi động → WiFi → Camera stream (Core 0)
 *   2. LCD hiện countdown + chế độ hiện tại
 *   3. Chế độ NHAP/XUAT được set từ WEB (Gesture hoặc nút bấm)
 *   4. QR được quét từ WEB → gửi API Backend → xử lý kho
 *   5. PIR chuyển động → reset countdown
 *   6. Countdown = 0 → Deep Sleep → PIR wakeup → quay lại 2
 *
 * Serial: NHAP / XUAT / SLEEP / WAKEUP / STREAM / STATUS / HELP
 *
 * PHẦN CỨNG:
 *   - ESP32-S3 + OV3660 Camera
 *   - LCD 1602A (I2C)
 *   - PIR HC-SR501 (GPIO 21)
 *   - LED Xanh (GPIO 1) — chỉ nháy cảnh báo sắp ngủ
 *   - Buzzer (GPIO 48)
 *
 * ============================================================
 */

#include "config.h"
#include "display_module.h"
#include "feedback_module.h"
#include "sensor_module.h"
#include "wifi_module.h"
#include "stream_module.h"

// ============================================================
// TRẠNG THÁI
// ============================================================
enum State {
    STATE_BOOT,
    STATE_ACTIVE,
    STATE_SLEEP
};

static State    currentState   = STATE_BOOT;
static String   currentMode    = "";           // "NHAP", "XUAT", hoặc ""
static bool     wifiConnected  = false;
static unsigned long displayNotifyUntil = 0;
WiFiServer apiServer(API_PORT);

// ============================================================
// SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(300);

    Serial.println("\n========================================");
    Serial.println("  SMART WAREHOUSE IoT  —  Khoi dong");
    Serial.println("========================================");

    // 1. LCD
    initDisplay();
    lcdBoot();

    // 2. LED Xanh + Buzzer
    initFeedback();

    // 3. PIR
    initPIR();

    // 4. Camera
    initCameraStream();

    // 5. WiFi
    lcdWiFiConnecting(WIFI_SSID);
    wifiConnected = connectWiFi();
    if (wifiConnected) {
        lcdWiFiOK(getLocalIP().c_str());
        startStreamServer();
        apiServer.begin();
        printStreamInfo();
    } else {
        lcdWiFiFail();
    }
    delay(1500);

    // Sẵn sàng
    if (wokeFromSleep()) {
        Serial.println("[System] Thuc day tu PIR");
        lcdWakeup();
        delay(1000);
    }

    resetActivityTimer();
    currentState = STATE_ACTIVE;

    Serial.println("[System] HELP de xem lenh test");
    Serial.println("========================================\n");
}

// ============================================================
// LOOP Core 1
// ============================================================
void loop() {
    handleSerial();
    handleAPI();

    switch (currentState) {

    case STATE_ACTIVE:
        processActive();
        break;

    case STATE_SLEEP:
        doSleep();
        break;

    default:
        currentState = STATE_ACTIVE;
        break;
    }

    delay(10);
}

// ============================================================
// XỬ LÝ TRẠNG THÁI ACTIVE
// ============================================================
void processActive() {
    // ── Tính countdown ───────────────────────────────
    unsigned long elapsed = millis() - getLastActivity();
    int remaining = (SLEEP_TIMEOUT_MS - elapsed) / 1000;
    if (remaining < 0) remaining = 0;

    // ── Kiểm tra PIR → reset countdown ───────────────
    if (pirDetected()) {
        resetActivityTimer();
        remaining = SLEEP_TIMEOUT_MS / 1000;
    }

    // ── Timeout → Sleep (chỉ khi được phép) ──────────
    if (remaining == 0) {
        if (sleepAllowed()) {
            currentState = STATE_SLEEP;
            return;
        } else {
            resetActivityTimer();
            remaining = SLEEP_TIMEOUT_MS / 1000;
        }
    }

    // ── LED: chỉ nháy cảnh báo sắp ngủ ──────────────
    if (remaining <= 10) {
        ledsSleepWarning();
    } else {
        ledsOff();
    }

    // ── LCD: thông báo tạm hoặc countdown ────────────
    if (millis() < displayNotifyUntil) {
        // Đang hiển thị thông báo tạm
    } else if (!sleepAllowed()) {
        lcdWarmingUp();
    } else {
        lcdCountdown(remaining, currentMode.c_str());
    }
}

// ============================================================
// SLEEP
// ============================================================
void doSleep() {
    Serial.println("[System] → SLEEP");
    lcdSleep();
    delay(1500);

    lcdOff();
    ledsOff();

    enterDeepSleep();
}

// ============================================================
// SERIAL COMMANDS
// ============================================================
void handleSerial() {
    if (!Serial.available()) return;

    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();

    if (cmd == "NHAP") {
        currentMode = "NHAP";
        beepShort();
        lcdModeChanged("NHAP");
        displayNotifyUntil = millis() + 2000;
        resetActivityTimer();
        Serial.println("[Manual] Mode → NHAP");

    } else if (cmd == "XUAT") {
        currentMode = "XUAT";
        beepShort();
        lcdModeChanged("XUAT");
        displayNotifyUntil = millis() + 2000;
        resetActivityTimer();
        Serial.println("[Manual] Mode → XUAT");

    } else if (cmd == "SLEEP") {
        Serial.println("[Manual] → SLEEP");
        currentState = STATE_SLEEP;

    } else if (cmd == "WAKEUP" || cmd == "WAKE") {
        Serial.println("[Manual] → Reset countdown");
        resetActivityTimer();
        lcdOn();
        currentState = STATE_ACTIVE;

    } else if (cmd == "STREAM") {
        printStreamInfo();

    } else if (cmd == "STATUS") {
        int rem = (SLEEP_TIMEOUT_MS - (millis() - getLastActivity())) / 1000;
        if (rem < 0) rem = 0;
        Serial.println("───── STATUS ─────");
        Serial.printf("  State     : %s\n", currentState == STATE_ACTIVE ? "ACTIVE" : "SLEEP");
        Serial.printf("  Mode      : %s\n", currentMode.c_str());
        Serial.printf("  Countdown : %ds\n", rem);
        Serial.printf("  WiFi      : %s\n", wifiConnected ? "OK" : "FAIL");
        Serial.printf("  IP        : %s\n", getLocalIP().c_str());
        Serial.printf("  PIR       : %s\n", pirDetected() ? "HIGH" : "LOW");
        Serial.printf("  Camera    : %s\n", cameraReady ? "OK" : "FAIL");
        Serial.printf("  Heap      : %d KB\n", ESP.getFreeHeap() / 1024);
        Serial.printf("  PSRAM     : %d KB\n", ESP.getFreePsram() / 1024);
        Serial.println("──────────────────");

    } else if (cmd == "HELP") {
        Serial.println("───── HELP ───────");
        Serial.println("  NHAP   — Set mode NHAP");
        Serial.println("  XUAT   — Set mode XUAT");
        Serial.println("  SLEEP  — Di ngu ngay");
        Serial.println("  WAKEUP — Reset countdown");
        Serial.println("  STREAM — Hien Stream URL");
        Serial.println("  STATUS — Trang thai he thong");
        Serial.println("  HELP   — Tro giup");
        Serial.println("──────────────────");
    }
}

// ============================================================
// API ENDPOINTS (PORT 82)
// ============================================================
void handleAPI() {
    if (!wifiConnected) return;
    WiFiClient client = apiServer.available();
    if (client) {
        client.setTimeout(250);
        unsigned long startWait = millis();
        while(!client.available() && millis() - startWait < 1000) { delay(10); }
        
        if (client.available()) {
            String req = client.readStringUntil('\r');
            
            // Read and discard remainder of HTTP headers
            while (client.connected() && client.available()) {
                String line = client.readStringUntil('\n');
                if (line == "\r") break; // empty line marks end of headers
            }
            
            if (req.indexOf("GET /set_mode?mode=NHAP") != -1) {
                currentMode = "NHAP";
                beepShort();
                lcdModeChanged("NHAP");
                displayNotifyUntil = millis() + 2000;
                resetActivityTimer();
                Serial.println("[API] Mode -> NHAP");
            } else if (req.indexOf("GET /set_mode?mode=XUAT") != -1) {
                currentMode = "XUAT";
                beepShort();
                lcdModeChanged("XUAT");
                displayNotifyUntil = millis() + 2000;
                resetActivityTimer();
                Serial.println("[API] Mode -> XUAT");
            }
            
            client.println("HTTP/1.1 200 OK");
            client.println("Content-Type: application/json");
            client.println("Access-Control-Allow-Origin: *");
            client.println("Access-Control-Allow-Methods: GET, POST, OPTIONS");
            client.println("Access-Control-Allow-Headers: *");
            client.println("Connection: close");
            client.println();
            client.print("{\"mode\":\"" + currentMode + "\"}");
        }
        client.stop();
    }
}
