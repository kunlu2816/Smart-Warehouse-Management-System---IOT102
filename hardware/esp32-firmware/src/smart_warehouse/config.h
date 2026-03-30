/**
 * ============================================================
 * SMART WAREHOUSE IoT — CẤU HÌNH HỆ THỐNG
 * ============================================================
 */

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ── WiFi & API Server ──────────────────────────────────
#define WIFI_SSID       "DAITHANH1_A710R"
#define WIFI_PASSWORD   "999999999"
#define WIFI_TIMEOUT_MS 15000
#define STREAM_PORT 81
#define API_PORT    82

// ── PIN — LCD 1602A (I2C) ────────────────────────────
#define LCD_SDA  41
#define LCD_SCL  42

// ── PIN — PIR HC-SR501 ──────────────────────────────
#define PIR_PIN  21  // RTC GPIO — hỗ trợ Deep Sleep Wakeup

// ── PIN — Feedback ───────────────────────────────────
#define LED_GREEN  1
#define BUZZER_PIN 48

// ── Hằng số hệ thống ────────────────────────────────
#define SLEEP_TIMEOUT_MS   20000   // 60s không hoạt động → ngủ

#endif
