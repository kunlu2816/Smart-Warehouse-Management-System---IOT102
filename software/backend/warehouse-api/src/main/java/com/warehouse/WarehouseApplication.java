package com.warehouse;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Smart Warehouse IoT System - Main Application
 * 
 * REST API Backend for managing warehouse inventory
 * via ESP32 QR code scanning devices.
 * 
 * @author Smart Warehouse Team
 * @version 1.0.0
 */
@SpringBootApplication
public class WarehouseApplication {

    public static void main(String[] args) {
        SpringApplication.run(WarehouseApplication.class, args);
        System.out.println("==============================================");
        System.out.println("  Smart Warehouse IoT API Started!");
        System.out.println("  Server running on http://localhost:8080");
        System.out.println("==============================================");
    }
}
