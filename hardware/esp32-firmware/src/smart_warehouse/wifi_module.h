/**
 * ============================================================
 * SMART WAREHOUSE IoT — MODULE WIFI
 * ============================================================
 * Kết nối WiFi. QR scan được xử lý trên Web, không trên ESP32.
 * ============================================================
 */

#ifndef WIFI_MODULE_H
#define WIFI_MODULE_H

#include <WiFi.h>
#include "config.h"

// ── Kết nối WiFi ─────────────────────────────────────
bool connectWiFi() {
    Serial.printf("[WiFi] Ket noi: %s\n", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS) {
        delay(400);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFi] OK! IP: %s  RSSI: %d dBm\n",
                      WiFi.localIP().toString().c_str(), WiFi.RSSI());
        return true;
    }

    Serial.println("\n[WiFi] THAT BAI!");
    return false;
}

// ── Lấy IP dạng chuỗi ───────────────────────────────
String getLocalIP() {
    if (WiFi.status() == WL_CONNECTED)
        return WiFi.localIP().toString();
    return "N/A";
}

#endif // WIFI_MODULE_H
