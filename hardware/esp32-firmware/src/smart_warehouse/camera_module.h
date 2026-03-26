/**
 * ============================================================
 * SMART WAREHOUSE IoT — MODULE CAMERA (Tùy chọn)
 * ============================================================
 * Khởi tạo OV3660 cho mục đích streaming.
 * QR decode thực hiện trên Web Server, KHÔNG trên ESP32.
 *
 * LƯU Ý: Camera streaming chính sử dụng firmware riêng
 *         (esp32_camera_stream). Module này dành cho trường hợp
 *         muốn tích hợp camera vào firmware chính.
 * ============================================================
 */

#ifndef CAMERA_MODULE_H
#define CAMERA_MODULE_H

#include "esp_camera.h"
#include "config.h"

static bool cameraOK = false;

// ── Khởi tạo OV3660 ─────────────────────────────────
bool initCamera() {
    camera_config_t cfg = {};

    cfg.pin_pwdn     = -1;
    cfg.pin_reset    = -1;
    cfg.pin_xclk     = 15;
    cfg.pin_sscb_sda = 4;
    cfg.pin_sscb_scl = 5;
    cfg.pin_d7       = 16;
    cfg.pin_d6       = 17;
    cfg.pin_d5       = 18;
    cfg.pin_d4       = 12;
    cfg.pin_d3       = 10;
    cfg.pin_d2       = 8;
    cfg.pin_d1       = 9;
    cfg.pin_d0       = 11;
    cfg.pin_vsync    = 6;
    cfg.pin_href     = 7;
    cfg.pin_pclk     = 13;

    cfg.xclk_freq_hz = 20000000;
    cfg.ledc_timer   = LEDC_TIMER_0;
    cfg.ledc_channel = LEDC_CHANNEL_0;
    cfg.pixel_format = PIXFORMAT_JPEG;
    cfg.frame_size   = FRAMESIZE_QVGA;
    cfg.jpeg_quality = 12;
    cfg.fb_count     = 1;
    cfg.fb_location  = CAMERA_FB_IN_PSRAM;

    esp_err_t err = esp_camera_init(&cfg);
    if (err != ESP_OK) {
        Serial.printf("[Camera] Init FAIL: 0x%x\n", err);
        return false;
    }

    cameraOK = true;
    Serial.println("[Camera] OV3660 san sang");
    return true;
}

// ── Chụp 1 frame ────────────────────────────────────
camera_fb_t* captureFrame() {
    if (!cameraOK) return nullptr;
    return esp_camera_fb_get();
}

void releaseFrame(camera_fb_t* fb) {
    if (fb) esp_camera_fb_return(fb);
}

// ── Dừng camera ──────────────────────────────────────
void stopCamera() {
    if (cameraOK) {
        esp_camera_deinit();
        cameraOK = false;
    }
}

#endif // CAMERA_MODULE_H