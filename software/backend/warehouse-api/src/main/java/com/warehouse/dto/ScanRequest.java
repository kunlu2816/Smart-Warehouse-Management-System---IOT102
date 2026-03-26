package com.warehouse.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for receiving scan requests from ESP32 devices.
 * 
 * Expected JSON format from ESP32:
 * {
 *   "qr": "SP-001",
 *   "mode": "NHAP"
 * }
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScanRequest {

    /**
     * QR code scanned by ESP32 camera
     */
    @NotBlank(message = "QR code is required")
    private String qr;

    /**
     * Operation mode: NHAP (import) or XUAT (export)
     * Optional when backend-owned mode is enabled; if provided, must be valid.
     */
    @Pattern(regexp = "^(NHAP|XUAT|)$", message = "Mode must be 'NHAP' or 'XUAT'")
    private String mode;

    /**
     * Optional idempotency key from client to prevent duplicate stock updates.
     */
    @Size(max = 100, message = "scanEventId must be <= 100 characters")
    private String scanEventId;
}
