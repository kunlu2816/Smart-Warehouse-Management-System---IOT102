/**
 * ============================================================
 * SMART WAREHOUSE IoT — MODULE HIỂN THỊ (LCD 1602A I2C)
 * ============================================================
 * LCD 16x2: Dòng 1 = trạng thái, Dòng 2 = đếm ngược sleep
 * ============================================================
 */

#ifndef DISPLAY_MODULE_H
#define DISPLAY_MODULE_H

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "config.h"

static LiquidCrystal_I2C* lcd = nullptr;
static int lastShownSeconds = -1;     // Tránh nhấp nháy
static String lastLine1 = "";

// ── Quét I2C tìm LCD ────────────────────────────────
static uint8_t scanLcdAddress() {
    Wire.begin(LCD_SDA, LCD_SCL);
    const uint8_t candidates[] = {0x27, 0x3F, 0x20, 0x3E};
    for (uint8_t addr : candidates) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf("[LCD] Dia chi 0x%02X\n", addr);
            return addr;
        }
    }
    Serial.println("[LCD] Khong tim thay!");
    return 0;
}

void initDisplay() {
    uint8_t addr = scanLcdAddress();
    if (addr == 0) return;
    lcd = new LiquidCrystal_I2C(addr, 16, 2);
    lcd->init();
    lcd->backlight();
    lcd->clear();
    lastShownSeconds = -1;
    lastLine1 = "";
    Serial.println("[LCD] San sang");
}

// ── Hiển thị chung ───────────────────────────────────
void lcdShow(const char* line1, const char* line2 = "") {
    if (!lcd) return;
    lcd->clear();
    lcd->setCursor(0, 0);  lcd->print(line1);
    if (line2[0] != '\0') {
        lcd->setCursor(0, 1);  lcd->print(line2);
    }
    lastShownSeconds = -1;
    lastLine1 = "";
}

// ── Đếm ngược + trạng thái (gọi mỗi loop) ──────────
// Chỉ update LCD khi giá trị thay đổi (tránh nhấp nháy)
void lcdCountdown(int seconds, const char* mode) {
    // Xây dòng 1: trạng thái chế độ
    String line1;
    if (mode[0] != '\0') {
        // Có mode: ">> NHAP <<"  hoặc ">> XUAT <<"
        line1 = ">> ";
        line1 += mode;
        line1 += " <<";
    } else {
        line1 = "Cho lenh NH/XU";
    }

    // Chỉ update khi thay đổi
    if (seconds == lastShownSeconds && line1 == lastLine1) return;
    lastShownSeconds = seconds;
    lastLine1 = line1;

    if (!lcd) return;

    // Dòng 1
    lcd->setCursor(0, 0);
    lcd->print("                ");  // Xóa dòng
    lcd->setCursor(0, 0);
    lcd->print(line1.c_str());

    // Dòng 2: đếm ngược
    lcd->setCursor(0, 1);
    lcd->print("                ");
    lcd->setCursor(0, 1);
    if (seconds <= 10) {
        lcd->print("Sap ngu: ");
    } else {
        lcd->print("Sleep:   ");
    }
    lcd->print(seconds);
    lcd->print("s ");
}

// ── Các hàm trạng thái đặc biệt ─────────────────────

void lcdBoot() {
    lcdShow("Smart Warehouse", "Khoi dong...");
}

void lcdWiFiConnecting(const char* ssid) {
    lcdShow("Ket noi WiFi...", ssid);
}

void lcdWiFiOK(const char* ip) {
    lcdShow("WiFi OK!", ip);
}

void lcdWiFiFail() {
    lcdShow("WiFi THAT BAI!", "Retrying...");
}

void lcdModeChanged(const char* mode) {
    char line1[17], line2[17];
    snprintf(line1, 17, "DA NHAN: %s!", mode);
    snprintf(line2, 17, "Cho quet QR...");
    lcdShow(line1, line2);
}

void lcdQRScanned(const char* qrCode, const char* mode, bool success) {
    char line1[17], line2[17];
    snprintf(line1, 17, "%.10s %s", qrCode, mode);
    snprintf(line2, 17, success ? "Thanh cong!" : "That bai!");
    lcdShow(line1, line2);
}

void lcdSleep() {
    lcdShow("DI NGU...", "Bye bye!");
}

void lcdWakeup() {
    lcdShow("THUC DAY!", "PIR phat hien");
}

void lcdWarmingUp() {
    lcdShow("DANG ON DINH...", "Vui long cho PIR");
}

// ── Tắt/Bật ──────────────────────────────────────────
void lcdOff() {
    if (lcd) { lcd->noBacklight(); lcd->clear(); }
    lastShownSeconds = -1;
    lastLine1 = "";
}

void lcdOn() {
    if (lcd) { lcd->backlight(); }
    lastShownSeconds = -1;
    lastLine1 = "";
}

#endif
