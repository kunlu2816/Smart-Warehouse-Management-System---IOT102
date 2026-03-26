/**
 * ============================================================
 * SMART WAREHOUSE IoT — MODULE CAMERA STREAM
 * ============================================================
 * Camera OV3660 + MJPEG stream port 81.
 * Chạy trên FreeRTOS task (Core 0).
 * ============================================================
 */

#ifndef STREAM_MODULE_H
#define STREAM_MODULE_H

#include "esp_camera.h"
#include <WiFi.h>
#include "config.h"

static WiFiServer   streamServer(STREAM_PORT);
static bool         cameraReady   = false;
static TaskHandle_t streamTaskHandle = NULL;

// ── Pause/Resume flag ────────────────────────────
static volatile bool streamPaused = false;

void pauseStream()  { streamPaused = true;  }
void resumeStream() { streamPaused = false; }

// ── Camera init ──────────────────────────────────────
bool initCameraStream() {
    camera_config_t cfg = {};
    cfg.pin_pwdn = -1;  cfg.pin_reset = -1;
    cfg.pin_xclk = 15;  cfg.pin_sscb_sda = 4;  cfg.pin_sscb_scl = 5;
    cfg.pin_d7 = 16;  cfg.pin_d6 = 17;  cfg.pin_d5 = 18;  cfg.pin_d4 = 12;
    cfg.pin_d3 = 10;  cfg.pin_d2 = 8;   cfg.pin_d1 = 9;   cfg.pin_d0 = 11;
    cfg.pin_vsync = 6;  cfg.pin_href = 7;  cfg.pin_pclk = 13;

    cfg.xclk_freq_hz = 20000000;
    cfg.ledc_timer   = LEDC_TIMER_0;
    cfg.ledc_channel = LEDC_CHANNEL_0;
    cfg.pixel_format = PIXFORMAT_JPEG;
    cfg.frame_size   = FRAMESIZE_VGA;
    cfg.jpeg_quality = 12;
    cfg.fb_count     = 2;
    cfg.fb_location  = CAMERA_FB_IN_PSRAM;
    cfg.grab_mode    = CAMERA_GRAB_LATEST;

    if (esp_camera_init(&cfg) != ESP_OK) {
        Serial.println("[Camera] Init FAIL");
        return false;
    }

    sensor_t* s = esp_camera_sensor_get();
    if (s) { s->set_brightness(s, 1); s->set_saturation(s, 0); }

    cameraReady = true;
    Serial.println("[Camera] OV3660 san sang");
    return true;
}

// ── Stream task (chạy trên Core 0) ───────────────────
void streamTask(void* param) {
    Serial.println("[Stream] Task chay tren Core 0");
    while (true) {
        // Khi stream pause → tạm dừng camera
        if (streamPaused) {
            delay(50);
            continue;
        }

        WiFiClient client = streamServer.available();
        if (client) {
            Serial.println("[Stream] Client ket noi");

            // Đọc request
            while (client.available()) client.read();

            // MJPEG headers
            client.println("HTTP/1.1 200 OK");
            client.println("Content-Type: multipart/x-mixed-replace; boundary=frame");
            client.println("Access-Control-Allow-Origin: *");
            client.println("Cache-Control: no-cache");
            client.println();

            while (client.connected()) {
                // Nếu đang tạm dừng → không gửi frame
                if (streamPaused) { delay(50); continue; }

                camera_fb_t* fb = esp_camera_fb_get();
                if (!fb) { delay(10); continue; }

                client.println("--frame");
                client.println("Content-Type: image/jpeg");
                client.printf("Content-Length: %u\r\n\r\n", fb->len);
                client.write(fb->buf, fb->len);
                client.println();
                esp_camera_fb_return(fb);

                delay(33);  // ~30 FPS
            }
            client.stop();
            Serial.println("[Stream] Client ngat");
        }
        delay(10);
    }
}

// ── Bắt đầu stream ──────────────────────────────────
void startStreamServer() {
    if (!cameraReady) return;
    streamServer.begin();
    Serial.printf("[Stream] Server port %d OK\n", STREAM_PORT);

    // Chạy stream trên Core 0
    xTaskCreatePinnedToCore(streamTask, "cam_stream", 8192, NULL, 1, &streamTaskHandle, 0);
}

// ── In URL ra Serial ─────────────────────────────────
void printStreamInfo() {
    if (WiFi.status() != WL_CONNECTED) return;
    String ip = WiFi.localIP().toString();
    Serial.println("========================================");
    Serial.println("  CAMERA STREAM - SAN SANG!");
    Serial.println("========================================");
    Serial.printf("  Stream URL : http://%s:%d/stream\n", ip.c_str(), STREAM_PORT);
    Serial.println("----------------------------------------");
    Serial.printf("  >> ESP32 IP : %s\n", ip.c_str());
    Serial.printf("  >> Port     : %d\n", STREAM_PORT);
    Serial.printf("  >> Endpoint : /stream\n");
    Serial.println("========================================");
}

#endif
