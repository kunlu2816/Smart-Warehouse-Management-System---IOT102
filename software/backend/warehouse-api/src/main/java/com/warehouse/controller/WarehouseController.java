package com.warehouse.controller;

import com.warehouse.dto.ScanRequest;
import com.warehouse.dto.ScanResponse;
import com.warehouse.entity.Inventory;
import com.warehouse.entity.TransactionLog;
import com.warehouse.service.WarehouseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST Controller for Warehouse API.
 * Handles HTTP requests from ESP32 devices and Web Dashboard.
 * 
 * Endpoints:
 * - POST /api/scan     : Process QR scan from ESP32
 * - GET  /api/inventory: Get all inventory items
 * - GET  /api/logs     : Get all transaction logs
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class WarehouseController {

    private final WarehouseService warehouseService;

    /**
     * POST /api/scan
     * 
     * Process QR code scan from ESP32 device.
     * 
     * Request body: {"qr": "SP-001", "mode": "NHAP"}
     * 
     * Response codes:
     * - 200 OK: Scan processed successfully (NHAP or XUAT success)
     * - 400 Bad Request: Cannot export (quantity = 0) or invalid request
     * - 404 Not Found: QR code does not exist in database
     * 
     * @param request ScanRequest containing qr and mode
     * @return ResponseEntity with ScanResponse
     */
    @PostMapping("/scan")
    public ResponseEntity<ScanResponse> processScan(@Valid @RequestBody ScanRequest request) {
        log.info("Received scan request: QR={}, Mode={}", request.getQr(), request.getMode());
        
        ScanResponse response = warehouseService.processScan(request);
        
        // Determine HTTP status based on response
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        }
        
        // Check if it's a "not found" error
        if (response.getMessage().contains("không tồn tại")) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
        }
        
        // Other errors (e.g., quantity = 0)
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
    }

    /**
     * GET /api/inventory
     * 
     * Get all inventory items sorted by updated_at descending.
     * Used by Web Dashboard to display inventory table.
     * 
     * @return List of Inventory items
     */
    @GetMapping("/inventory")
    public ResponseEntity<List<Inventory>> getAllInventory() {
        log.debug("Fetching all inventory items");
        List<Inventory> inventoryList = warehouseService.getAllInventory();
        return ResponseEntity.ok(inventoryList);
    }

    /**
     * GET /api/logs
     * 
     * Get all transaction logs sorted by created_at descending.
     * Used by Web Dashboard to display transaction history.
     * 
     * @return List of TransactionLog items
     */
    @GetMapping("/logs")
    public ResponseEntity<List<TransactionLog>> getAllLogs() {
        log.debug("Fetching all transaction logs");
        List<TransactionLog> logs = warehouseService.getRecentLogs();
        return ResponseEntity.ok(logs);
    }

    /**
     * GET /api/inventory/{qrCode}
     * 
     * Get specific inventory item by QR code.
     * 
     * @param qrCode The QR code to search
     * @return Inventory item if found, 404 otherwise
     */
    @GetMapping("/inventory/{qrCode}")
    public ResponseEntity<Inventory> getInventoryByQrCode(@PathVariable String qrCode) {
        log.debug("Fetching inventory for QR code: {}", qrCode);
        return warehouseService.getInventoryByQrCode(qrCode)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Health check endpoint
     * Used to verify server is running
     */
    @GetMapping("/health")
    public ResponseEntity<String> healthCheck() {
        return ResponseEntity.ok("Smart Warehouse API is running!");
    }

    /**
     * GET /api/mode
     * Get current warehouse mode
     */
    @GetMapping("/mode")
    public ResponseEntity<java.util.Map<String, String>> getMode() {
        return ResponseEntity.ok(java.util.Map.of("mode", warehouseService.getCurrentMode()));
    }

    /**
     * POST /api/mode
     * Set current warehouse mode
     */
    @PostMapping("/mode")
    public ResponseEntity<java.util.Map<String, String>> setMode(@RequestBody java.util.Map<String, String> request) {
        String mode = request.get("mode");
        try {
            warehouseService.setCurrentMode(mode);
            return ResponseEntity.ok(java.util.Map.of("success", "true", "mode", warehouseService.getCurrentMode()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(java.util.Map.of("success", "false", "message", e.getMessage()));
        }
    }
}
