package com.warehouse.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Entity class representing a transaction log entry.
 * Records all scan operations (NHAP/XUAT) from ESP32 devices.
 * Maps to the 'transaction_logs' table in PostgreSQL.
 */
@Entity
@Table(name = "transaction_logs", indexes = {
    @Index(name = "idx_transaction_logs_created_at", columnList = "created_at DESC"),
    @Index(name = "idx_transaction_logs_qr_code", columnList = "qr_code"),
    @Index(name = "idx_transaction_logs_scan_event_id", columnList = "scan_event_id")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TransactionLog {

    /**
     * UUID - Primary Key
     * Auto-generated unique identifier
     */
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    /**
     * QR Code of the scanned product
     * Foreign key reference to inventory table
     */
    @Column(name = "qr_code", nullable = false, length = 50)
    private String qrCode;

    /**
     * Action type: NHAP (import) or XUAT (export)
     */
    @Column(name = "action", nullable = false, length = 10)
    private String action;

    /**
     * Transaction status: SUCCESS or FAILED
     */
    @Column(name = "status", nullable = false, length = 10)
    private String status;

    /**
     * Detailed message about the transaction
     */
    @Column(name = "message", length = 255)
    private String message;

    /**
     * Optional idempotency key from client scan event.
     */
    @Column(name = "scan_event_id", length = 100)
    private String scanEventId;

    /**
     * Timestamp when transaction occurred
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * Auto-set createdAt before persist
     */
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    /**
     * Constants for action types
     */
    public static final String ACTION_NHAP = "NHAP";
    public static final String ACTION_XUAT = "XUAT";

    /**
     * Constants for status types
     */
    public static final String STATUS_SUCCESS = "SUCCESS";
    public static final String STATUS_FAILED = "FAILED";
}
