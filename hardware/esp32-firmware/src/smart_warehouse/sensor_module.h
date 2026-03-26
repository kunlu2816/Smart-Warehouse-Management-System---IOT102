/**
 * ============================================================
 * SMART WAREHOUSE IoT — MODULE CẢM BIẾN (PIR + DEEP SLEEP)
 * ============================================================
 * PIR HC-SR501 trên GPIO 21 (RTC GPIO).
 * Deep Sleep sử dụng ext0 wakeup — thức khi PIR HIGH.
 *
 * CHIẾN LƯỢC:
 *   - INPUT_PULLDOWN để ổn định điện thế chân GPIO.
 *   - Software Debounce 100ms để lọc nhiễu xung WiFi.
 *   - Cấm sleep trong 30s đầu khi Cold Boot (chờ PIR ổn định).
 * ============================================================
 */

#ifndef SENSOR_MODULE_H
#define SENSOR_MODULE_H

#include <Arduino.h>
#include <esp_sleep.h>
#include "config.h"

#define PIR_CONFIRM_MS 100  // Phải giữ HIGH liên tục 100ms mới tính là có người
#define PIR_WARMUP_MS 30000 // Cấm sleep trong 30s đầu sau Cold Boot

static unsigned long lastActivityMs = 0;
static unsigned long bootTimeMs     = 0;
static bool          isColdBoot     = true;

// ── Kiểm tra lý do thức dậy ─────────────────────────
bool wokeFromSleep() {
    return esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_EXT0;
}

// ── Khởi tạo ────────────────────────────────────────
void initPIR() {
    pinMode(PIR_PIN, INPUT_PULLDOWN);
    lastActivityMs = millis();
    bootTimeMs     = millis();
    isColdBoot     = !wokeFromSleep();
    Serial.printf("[PIR] Init GPIO %d | ColdBoot=%s\n",
                  PIR_PIN, isColdBoot ? "YES" : "NO");
}

// ── Cập nhật timer ───────────────────────────────────
void resetActivityTimer() {
    lastActivityMs = millis();
}

// ── Lấy thời điểm hoạt động cuối ────────────────────
unsigned long getLastActivity() {
    return lastActivityMs;
}

// ── Kiểm tra timeout → nên ngủ? ─────────────────────
bool shouldSleep() {
    return (millis() - lastActivityMs > SLEEP_TIMEOUT_MS);
}

// ── Đọc PIR — Software Debounce (HIGH liên tục 100ms) ──
bool pirDetected() {
    if (digitalRead(PIR_PIN) != HIGH) return false;

    unsigned long start = millis();
    while (millis() - start < PIR_CONFIRM_MS) {
        if (digitalRead(PIR_PIN) == LOW) return false;
        delay(5);
    }
    return true;
}

// ── Có được phép ngủ không? ──────────────────────────
// Cold Boot: cấm ngủ trong 30s đầu (chờ PIR ổn định)
// Wake from Sleep: cho ngủ ngay khi hết timeout
bool sleepAllowed() {
    if (isColdBoot && (millis() - bootTimeMs < PIR_WARMUP_MS)) {
        return false;
    }
    return true;
}

// ── Vào Deep Sleep ───────────────────────────────────
void enterDeepSleep() {
    Serial.println("[Sleep] Vao Deep Sleep...");
    Serial.flush();

    digitalWrite(LED_GREEN, LOW);
    digitalWrite(BUZZER_PIN, LOW);

    esp_sleep_enable_ext0_wakeup((gpio_num_t)PIR_PIN, 1);
    esp_deep_sleep_start();
}

#endif // SENSOR_MODULE_H
