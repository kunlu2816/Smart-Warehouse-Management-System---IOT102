package com.warehouse.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for sending scan response back to ESP32 devices and frontend.
 * 
 * Response JSON format:
 * {
 *   "success": true,
 *   "message": "Nhập kho thành công",
 *   "productName": "Laptop Dell XPS 15",
 *   "newQuantity": 26
 * }
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScanResponse {

    /**
     * Operation success status
     */
    private boolean success;

    /**
     * Detailed message about the operation result
     */
    private String message;

    /**
     * Name of the scanned product
     */
    private String productName;

    /**
     * Updated quantity after the operation
     */
    private Integer newQuantity;

    /**
     * QR code of the product
     */
    private String qrCode;

    /**
     * Action performed (NHAP/XUAT)
     */
    private String action;

    /**
     * Factory method for success response
     */
    public static ScanResponse success(String message, String productName, 
                                        Integer newQuantity, String qrCode, String action) {
        return ScanResponse.builder()
                .success(true)
                .message(message)
                .productName(productName)
                .newQuantity(newQuantity)
                .qrCode(qrCode)
                .action(action)
                .build();
    }

    /**
     * Factory method for error response
     */
    public static ScanResponse error(String message) {
        return ScanResponse.builder()
                .success(false)
                .message(message)
                .build();
    }
}
