package com.warehouse.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Entity class representing a product in the warehouse inventory.
 * Maps to the 'inventory' table in PostgreSQL.
 */
@Entity
@Table(name = "inventory")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Inventory {

    /**
     * QR Code - Primary Key
     * Unique identifier for each product
     */
    @Id
    @Column(name = "qr_code", length = 50)
    private String qrCode;

    /**
     * Product name
     */
    @Column(name = "product_name", nullable = false, length = 255)
    private String productName;

    /**
     * Current quantity in stock
     * Must be >= 0
     */
    @Column(name = "quantity", nullable = false)
    private Integer quantity = 0;

    /**
     * Last updated timestamp
     * Auto-updated when quantity changes
     */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * Auto-set updatedAt before persist
     */
    @PrePersist
    protected void onCreate() {
        updatedAt = LocalDateTime.now();
    }

    /**
     * Auto-update updatedAt before update
     */
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
