package com.warehouse.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Camera Proxy Controller
 * 
 * Proxies MJPEG stream from ESP32 camera to avoid CORS issues.
 * Frontend connects to /api/camera/stream instead of directly to ESP32.
 * 
 * Endpoints:
 * - GET /api/camera/stream?ip=192.168.1.214&port=81 : Proxy MJPEG stream
 * - GET /api/camera/capture?ip=192.168.1.214        : Capture single image
 * - GET /api/camera/status?ip=192.168.1.214         : Get camera status
 */
@RestController
@RequestMapping("/api/camera")
@Slf4j
public class CameraController {

    private static final int CONNECTION_TIMEOUT = 5000;
    private static final int READ_TIMEOUT = 0;  // 0 = infinite timeout for streaming
    private static final int BUFFER_SIZE = 8192;  // Larger buffer for better performance
    private static final String DEFAULT_PORT = "81";
    private static final String DEFAULT_ENDPOINT = "/stream";

    /**
     * GET /api/camera/stream
     * 
     * Proxy MJPEG stream from ESP32 camera.
     * This solves CORS issues by having backend fetch the stream.
     * 
     * @param ip   ESP32 IP address (required)
     * @param port ESP32 stream port (default: 81)
     * @return StreamingResponseBody with MJPEG content
     */
    @GetMapping(value = "/stream", produces = "multipart/x-mixed-replace;boundary=123456789000000000000987654321")
    public ResponseEntity<StreamingResponseBody> proxyStream(
            @RequestParam String ip,
            @RequestParam(defaultValue = "81") String port) {
        
        String streamUrl = String.format("http://%s:%s/stream", ip, port);
        log.info("[Camera Proxy] Connecting to: {}", streamUrl);

        StreamingResponseBody stream = outputStream -> {
            HttpURLConnection connection = null;
            InputStream inputStream = null;
            
            try {
                URL url = new URL(streamUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(CONNECTION_TIMEOUT);
                connection.setReadTimeout(READ_TIMEOUT);
                connection.setDoInput(true);
                
                int responseCode = connection.getResponseCode();
                if (responseCode != 200) {
                    log.error("[Camera Proxy] ESP32 returned status: {}", responseCode);
                    return;
                }
                
                inputStream = connection.getInputStream();
                byte[] buffer = new byte[BUFFER_SIZE];
                int bytesRead;
                
                log.info("[Camera Proxy] Stream started");
                
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                    outputStream.flush();
                }
                
            } catch (Exception e) {
                log.error("[Camera Proxy] Stream error: {}", e.getMessage());
            } finally {
                try {
                    if (inputStream != null) inputStream.close();
                    if (connection != null) connection.disconnect();
                } catch (Exception e) {
                    log.error("[Camera Proxy] Cleanup error: {}", e.getMessage());
                }
                log.info("[Camera Proxy] Stream ended");
            }
        };

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("multipart/x-mixed-replace;boundary=123456789000000000000987654321"))
                .body(stream);
    }

    /**
     * GET /api/camera/capture
     * 
     * Capture single image from ESP32 camera.
     * 
     * @param ip   ESP32 IP address (required)
     * @param port ESP32 HTTP port (default: 80)
     * @return JPEG image
     */
    @GetMapping(value = "/capture", produces = MediaType.IMAGE_JPEG_VALUE)
    public ResponseEntity<byte[]> captureImage(
            @RequestParam String ip,
            @RequestParam(defaultValue = "80") String port) {
        
        String captureUrl = String.format("http://%s:%s/capture", ip, port);
        log.info("[Camera Proxy] Capturing from: {}", captureUrl);

        try {
            URL url = new URL(captureUrl);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(CONNECTION_TIMEOUT);
            connection.setReadTimeout(READ_TIMEOUT);
            
            int responseCode = connection.getResponseCode();
            if (responseCode != 200) {
                log.error("[Camera Proxy] Capture failed, status: {}", responseCode);
                return ResponseEntity.status(responseCode).build();
            }
            
            InputStream inputStream = connection.getInputStream();
            byte[] imageBytes = inputStream.readAllBytes();
            inputStream.close();
            connection.disconnect();
            
            log.info("[Camera Proxy] Captured {} bytes", imageBytes.length);
            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_JPEG)
                    .body(imageBytes);
                    
        } catch (Exception e) {
            log.error("[Camera Proxy] Capture error: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * GET /api/camera/status
     * 
     * Get camera status/settings from ESP32.
     * 
     * @param ip   ESP32 IP address (required)
     * @param port ESP32 HTTP port (default: 80)
     * @return JSON with camera settings
     */
    @GetMapping(value = "/status", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getCameraStatus(
            @RequestParam String ip,
            @RequestParam(defaultValue = "80") String port) {
        
        String statusUrl = String.format("http://%s:%s/status", ip, port);
        log.info("[Camera Proxy] Getting status from: {}", statusUrl);

        try {
            URL url = new URL(statusUrl);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(CONNECTION_TIMEOUT);
            connection.setReadTimeout(READ_TIMEOUT);
            
            int responseCode = connection.getResponseCode();
            if (responseCode != 200) {
                log.error("[Camera Proxy] Status failed, code: {}", responseCode);
                return ResponseEntity.status(responseCode).build();
            }
            
            InputStream inputStream = connection.getInputStream();
            String json = new String(inputStream.readAllBytes());
            inputStream.close();
            connection.disconnect();
            
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(json);
                    
        } catch (Exception e) {
            log.error("[Camera Proxy] Status error: {}", e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("{\"error\": \"" + e.getMessage() + "\"}");
        }
    }

    /**
     * GET /api/camera/test
     * 
     * Test if ESP32 camera is reachable.
     * 
     * @param ip   ESP32 IP address
     * @param port ESP32 stream port (default: 81)
     * @return JSON with connection status
     */
    @GetMapping(value = "/test", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> testConnection(
            @RequestParam String ip,
            @RequestParam(defaultValue = "81") String port) {
        
        String testUrl = String.format("http://%s:%s/stream", ip, port);
        log.info("[Camera Proxy] Testing connection to: {}", testUrl);

        try {
            URL url = new URL(testUrl);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(CONNECTION_TIMEOUT);
            connection.setReadTimeout(3000);
            
            int responseCode = connection.getResponseCode();
            connection.disconnect();
            
            if (responseCode == 200) {
                log.info("[Camera Proxy] Connection successful");
                return ResponseEntity.ok("{\"success\": true, \"message\": \"Camera is reachable\"}");
            } else {
                log.warn("[Camera Proxy] Connection failed, code: {}", responseCode);
                return ResponseEntity.ok("{\"success\": false, \"message\": \"Camera returned status " + responseCode + "\"}");
            }
            
        } catch (Exception e) {
            log.error("[Camera Proxy] Test failed: {}", e.getMessage());
            return ResponseEntity.ok("{\"success\": false, \"message\": \"" + e.getMessage() + "\"}");
        }
    }
}
