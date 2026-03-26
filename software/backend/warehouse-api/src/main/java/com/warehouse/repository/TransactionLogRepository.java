package com.warehouse.repository;

import com.warehouse.entity.TransactionLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository interface for TransactionLog entity.
 * Provides CRUD operations and custom queries for transaction logging.
 */
@Repository
public interface TransactionLogRepository extends JpaRepository<TransactionLog, UUID> {

    /**
     * Get all transaction logs sorted by created_at descending (newest first)
     * 
     * @return List of transaction logs
     */
    List<TransactionLog> findAllByOrderByCreatedAtDesc();

    /**
     * Get transaction logs by QR code, sorted by created_at descending
     * 
     * @param qrCode The QR code to filter by
     * @return List of transaction logs for the specified product
     */
    List<TransactionLog> findByQrCodeOrderByCreatedAtDesc(String qrCode);

    /**
     * Get the most recent N transaction logs
     *
     * @return List of recent transaction logs
     */
    List<TransactionLog> findTop50ByOrderByCreatedAtDesc();

    /**
     * Find transaction by scan event id (idempotency).
     */
    Optional<TransactionLog> findFirstByScanEventIdOrderByCreatedAtDesc(String scanEventId);

    /**
     * Find recent transaction for duplicate-window guard.
     */
    Optional<TransactionLog> findTop1ByQrCodeAndActionAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(
            String qrCode,
            String action,
            LocalDateTime createdAt
    );
}
