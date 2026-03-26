package com.warehouse.service;

import com.warehouse.dto.ScanRequest;
import com.warehouse.dto.ScanResponse;
import com.warehouse.entity.Inventory;
import com.warehouse.entity.TransactionLog;
import com.warehouse.repository.InventoryRepository;
import com.warehouse.repository.TransactionLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Service layer for warehouse operations.
 * Handles business logic for inventory management and transaction logging.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WarehouseService {

    private final InventoryRepository inventoryRepository;
    private final TransactionLogRepository transactionLogRepository;

    private String currentMode = ""; // IDLE mode

    public String getCurrentMode() {
        return currentMode;
    }

    public void setCurrentMode(String mode) {
        if (mode == null) mode = "";
        mode = mode.toUpperCase();
        if (mode.equals(TransactionLog.ACTION_NHAP) || mode.equals(TransactionLog.ACTION_XUAT) || mode.isEmpty() || mode.equals("IDLE")) {
            this.currentMode = mode;
            log.info("Backend mode updated to: {}", mode);
        } else {
            throw new IllegalArgumentException("Mode không hợp lệ. Chỉ chấp nhận 'NHAP', 'XUAT' hoặc 'IDLE'");
        }
    }

    /**
     * Process scan request from ESP32 device.
     * 
     * Business Logic:
     * 1. QR code not found -> Log FAILED, return 404
     * 2. Mode = "NHAP" -> quantity++, Log SUCCESS, return 200
     * 3. Mode = "XUAT" && quantity > 0 -> quantity--, Log SUCCESS, return 200
     * 4. Mode = "XUAT" && quantity = 0 -> Log FAILED, return 400
     * 
     * @param request ScanRequest from ESP32
     * @return ScanResponse with operation result
     */
    @Transactional
    public ScanResponse processScan(ScanRequest request) {
        String qrCode = request.getQr();
        String mode = request.getMode();
        String scanEventId = request.getScanEventId();
        
        // Use backend-owned mode if client omits or uses server mode logic
        if (mode == null || mode.trim().isEmpty()) {
            mode = this.currentMode;
        }
        
        log.info("Processing scan request: QR={}, Mode={}, EventId={}", qrCode, mode, scanEventId);

        // Phase 4: Backend Idempotency Check
        if (scanEventId != null && !scanEventId.isEmpty()) {
            Optional<TransactionLog> existingLog = transactionLogRepository.findFirstByScanEventIdOrderByCreatedAtDesc(scanEventId);
            if (existingLog.isPresent()) {
                TransactionLog logEntry = existingLog.get();
                log.info("Duplicate scan event ignored: {}", scanEventId);
                boolean isSuccess = TransactionLog.STATUS_SUCCESS.equals(logEntry.getStatus());
                Optional<Inventory> optInv = inventoryRepository.findByQrCode(qrCode);
                String pName = optInv.map(Inventory::getProductName).orElse("Unknown");
                int pQty = optInv.map(Inventory::getQuantity).orElse(0);
                
                if (isSuccess) {
                    return ScanResponse.success(logEntry.getMessage() + " (Duplicate ignored)", pName, pQty, qrCode, mode);
                } else {
                    return ScanResponse.builder()
                            .success(false)
                            .message(logEntry.getMessage() + " (Duplicate ignored)")
                            .productName(pName)
                            .newQuantity(pQty)
                            .qrCode(qrCode)
                            .action(mode)
                            .build();
                }
            }
        }

        // Find inventory by QR code
        Optional<Inventory> optionalInventory = inventoryRepository.findByQrCode(qrCode);

        // Case 1: QR code not found
        if (optionalInventory.isEmpty()) {
            log.warn("QR code not found: {}", qrCode);
            logTransaction(qrCode, mode, TransactionLog.STATUS_FAILED, 
                          "Mã QR không tồn tại trong hệ thống", scanEventId);
            return ScanResponse.error("Mã QR không tồn tại trong hệ thống");
        }

        Inventory inventory = optionalInventory.get();
        int currentQuantity = inventory.getQuantity();
        int newQuantity;
        String message;

        // Case 2: Mode = NHAP (Import)
        if (TransactionLog.ACTION_NHAP.equals(mode)) {
            newQuantity = currentQuantity + 1;
            inventory.setQuantity(newQuantity);
            inventoryRepository.save(inventory);
            
            message = "Nhập kho thành công";
            log.info("NHAP success: {} - {} ({} -> {})", 
                     qrCode, inventory.getProductName(), currentQuantity, newQuantity);
            
            logTransaction(qrCode, mode, TransactionLog.STATUS_SUCCESS, message, scanEventId);
            
            return ScanResponse.success(
                message, 
                inventory.getProductName(), 
                newQuantity, 
                qrCode, 
                mode
            );
        }

        // Case 3 & 4: Mode = XUAT (Export)
        if (TransactionLog.ACTION_XUAT.equals(mode)) {
            // Case 3: quantity > 0 -> Success
            if (currentQuantity > 0) {
                newQuantity = currentQuantity - 1;
                inventory.setQuantity(newQuantity);
                inventoryRepository.save(inventory);
                
                message = "Xuất kho thành công";
                log.info("XUAT success: {} - {} ({} -> {})", 
                         qrCode, inventory.getProductName(), currentQuantity, newQuantity);
                
                logTransaction(qrCode, mode, TransactionLog.STATUS_SUCCESS, message, scanEventId);
                
                return ScanResponse.success(
                    message, 
                    inventory.getProductName(), 
                    newQuantity, 
                    qrCode, 
                    mode
                );
            }
            
            // Case 4: quantity = 0 -> Failed
            message = "Không thể xuất kho - Số lượng đã bằng 0";
            log.warn("XUAT failed: {} - {} (quantity = 0)", qrCode, inventory.getProductName());
            
            logTransaction(qrCode, mode, TransactionLog.STATUS_FAILED, message, scanEventId);
            
            return ScanResponse.builder()
                    .success(false)
                    .message(message)
                    .productName(inventory.getProductName())
                    .newQuantity(0)
                    .qrCode(qrCode)
                    .action(mode)
                    .build();
        }

        // Invalid mode (should not reach here due to validation)
        log.error("Invalid mode: {}", mode);
        return ScanResponse.error("Mode không hợp lệ. Chỉ chấp nhận 'NHAP' hoặc 'XUAT'");
    }

    /**
     * Log transaction to database
     */
    private void logTransaction(String qrCode, String action, String status, String message, String scanEventId) {
        TransactionLog transactionLog = new TransactionLog();
        transactionLog.setQrCode(qrCode);
        transactionLog.setAction(action);
        transactionLog.setStatus(status);
        transactionLog.setMessage(message);
        transactionLog.setScanEventId(scanEventId);
        transactionLogRepository.save(transactionLog);
        
        log.debug("Transaction logged: QR={}, Action={}, Status={}, EventId={}", qrCode, action, status, scanEventId);
    }

    /**
     * Get all inventory items sorted by updated_at descending
     * 
     * @return List of inventory items
     */
    @Transactional(readOnly = true)
    public List<Inventory> getAllInventory() {
        return inventoryRepository.findAllByOrderByUpdatedAtDesc();
    }

    /**
     * Get all transaction logs sorted by created_at descending
     * 
     * @return List of transaction logs
     */
    @Transactional(readOnly = true)
    public List<TransactionLog> getAllLogs() {
        return transactionLogRepository.findAllByOrderByCreatedAtDesc();
    }

    /**
     * Get recent transaction logs (top 50)
     * 
     * @return List of recent transaction logs
     */
    @Transactional(readOnly = true)
    public List<TransactionLog> getRecentLogs() {
        return transactionLogRepository.findTop50ByOrderByCreatedAtDesc();
    }

    /**
     * Get inventory by QR code
     * 
     * @param qrCode The QR code to search
     * @return Optional containing inventory if found
     */
    @Transactional(readOnly = true)
    public Optional<Inventory> getInventoryByQrCode(String qrCode) {
        return inventoryRepository.findByQrCode(qrCode);
    }
}
