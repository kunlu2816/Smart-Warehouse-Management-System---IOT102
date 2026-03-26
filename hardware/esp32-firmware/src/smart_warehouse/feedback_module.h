/**
 * ============================================================
 * SMART WAREHOUSE IoT — MODULE PHẢN HỒI (LED + BUZZER)
 * ============================================================
 * LED Xanh (GPIO 1): Nháy cảnh báo sắp ngủ (<10s)
 * Buzzer: Beep khi quét QR thành công / lỗi
 * LED KHÔNG sáng khi đổi chế độ.
 * ============================================================
 */

#ifndef FEEDBACK_MODULE_H
#define FEEDBACK_MODULE_H

#include "config.h"

void initFeedback() {
    pinMode(LED_GREEN, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);

    // Test nhanh: nháy LED xanh 1 lần
    digitalWrite(LED_GREEN, HIGH);
    delay(300);
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(60);
    digitalWrite(BUZZER_PIN, LOW);

    Serial.println("[Feedback] San sang (LED Xanh + Buzzer)");
}

// ── Buzzer ───────────────────────────────────────────
void beepShort()   { digitalWrite(BUZZER_PIN, HIGH); delay(120); digitalWrite(BUZZER_PIN, LOW); }
void beepSuccess() { digitalWrite(BUZZER_PIN, HIGH); delay(350); digitalWrite(BUZZER_PIN, LOW); }
void beepError()   {
    for (int i = 0; i < 3; i++) {
        digitalWrite(BUZZER_PIN, HIGH); delay(70);
        digitalWrite(BUZZER_PIN, LOW);  delay(70);
    }
}

// ── Tắt tất cả ──────────────────────────────────────
void ledsOff() {
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
}

// ── Nháy cảnh báo sắp ngủ (gọi trong loop) ──────────
// Nháy LED xanh chậm khi countdown < 10s
void ledsSleepWarning() {
    static unsigned long lastBlink = 0;
    static bool blinkOn = false;
    if (millis() - lastBlink > 500) {
        blinkOn = !blinkOn;
        digitalWrite(LED_GREEN, blinkOn);
        lastBlink = millis();
    }
}

#endif
