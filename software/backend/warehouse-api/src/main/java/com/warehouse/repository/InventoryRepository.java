package com.warehouse.repository;

import com.warehouse.entity.Inventory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository interface for Inventory entity.
 * Provides CRUD operations and custom queries for inventory management.
 */
@Repository
public interface InventoryRepository extends JpaRepository<Inventory, String> {

    /**
     * Find inventory item by QR code
     * 
     * @param qrCode The QR code to search
     * @return Optional containing the inventory item if found
     */
    Optional<Inventory> findByQrCode(String qrCode);

    /**
     * Get all inventory items sorted by updated_at descending (newest first)
     * 
     * @return List of inventory items
     */
    List<Inventory> findAllByOrderByUpdatedAtDesc();

    /**
     * Check if a product exists by QR code
     * 
     * @param qrCode The QR code to check
     * @return true if exists, false otherwise
     */
    boolean existsByQrCode(String qrCode);
}
