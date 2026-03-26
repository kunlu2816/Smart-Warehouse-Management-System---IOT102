-- ============================================================
-- SMART WAREHOUSE IoT SYSTEM - DATABASE INITIALIZATION SCRIPT
-- PostgreSQL DDL + Sample Data
-- ============================================================

-- Drop tables if exist (for development reset)
DROP TABLE IF EXISTS transaction_logs CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;

-- ============================================================
-- TABLE: inventory
-- Stores product information with QR code as primary key
-- ============================================================
CREATE TABLE inventory (
    qr_code VARCHAR(50) PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment for documentation
COMMENT ON TABLE inventory IS 'Bảng lưu trữ thông tin sản phẩm trong kho';
COMMENT ON COLUMN inventory.qr_code IS 'Mã QR duy nhất của sản phẩm (Primary Key)';
COMMENT ON COLUMN inventory.product_name IS 'Tên sản phẩm';
COMMENT ON COLUMN inventory.quantity IS 'Số lượng tồn kho hiện tại';
COMMENT ON COLUMN inventory.updated_at IS 'Thời gian cập nhật gần nhất';

-- ============================================================
-- TABLE: transaction_logs
-- Stores all scan transactions from ESP32 devices
-- ============================================================
CREATE TABLE transaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code VARCHAR(50) NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('NHAP', 'XUAT')),
    status VARCHAR(10) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    message VARCHAR(255),
    scan_event_id VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    
    -- NOTE: Removed FK constraint to allow logging unknown QR codes
);

-- Create index on created_at for faster sorting queries
CREATE INDEX idx_transaction_logs_created_at ON transaction_logs(created_at DESC);

-- Create index on qr_code for faster lookups
CREATE INDEX idx_transaction_logs_qr_code ON transaction_logs(qr_code);

-- Create index on scan_event_id for idempotency check
CREATE INDEX idx_transaction_logs_scan_event_id ON transaction_logs(scan_event_id);

-- Add comments for documentation
COMMENT ON TABLE transaction_logs IS 'Bảng lưu trữ nhật ký giao dịch quét mã';
COMMENT ON COLUMN transaction_logs.id IS 'UUID duy nhất của giao dịch';
COMMENT ON COLUMN transaction_logs.qr_code IS 'Mã QR sản phẩm được quét';
COMMENT ON COLUMN transaction_logs.action IS 'Loại hành động: NHAP hoặc XUAT';
COMMENT ON COLUMN transaction_logs.status IS 'Trạng thái: SUCCESS hoặc FAILED';
COMMENT ON COLUMN transaction_logs.message IS 'Thông báo chi tiết về giao dịch';
COMMENT ON COLUMN transaction_logs.created_at IS 'Thời gian thực hiện giao dịch';

-- ============================================================
-- SAMPLE DATA: Insert sample products
-- ============================================================
INSERT INTO inventory (qr_code, product_name, quantity, updated_at) VALUES
    ('SP-001', 'Laptop Dell XPS 15', 25, CURRENT_TIMESTAMP),
    ('SP-002', 'Chuột Logitech MX Master 3', 50, CURRENT_TIMESTAMP),
    ('SP-003', 'Bàn phím cơ Keychron K8', 30, CURRENT_TIMESTAMP),
    ('SP-004', 'Màn hình LG 27" 4K', 15, CURRENT_TIMESTAMP),
    ('SP-005', 'Tai nghe Sony WH-1000XM5', 40, CURRENT_TIMESTAMP),
    ('SP-006', 'Ổ cứng SSD Samsung 1TB', 100, CURRENT_TIMESTAMP),
    ('SP-007', 'RAM Kingston 16GB DDR5', 80, CURRENT_TIMESTAMP),
    ('SP-008', 'Webcam Logitech C920', 35, CURRENT_TIMESTAMP),
    ('SP-009', 'Sạc dự phòng Anker 20000mAh', 60, CURRENT_TIMESTAMP),
    ('SP-010', 'Cáp USB-C Ugreen 2m', 200, CURRENT_TIMESTAMP);

-- ============================================================
-- SAMPLE DATA: Insert sample transaction logs
-- ============================================================
INSERT INTO transaction_logs (qr_code, action, status, message, created_at) VALUES
    ('SP-001', 'NHAP', 'SUCCESS', 'Nhập kho thành công', CURRENT_TIMESTAMP - INTERVAL '2 hours'),
    ('SP-001', 'NHAP', 'SUCCESS', 'Nhập kho thành công', CURRENT_TIMESTAMP - INTERVAL '1 hour 50 minutes'),
    ('SP-002', 'XUAT', 'SUCCESS', 'Xuất kho thành công', CURRENT_TIMESTAMP - INTERVAL '1 hour 30 minutes'),
    ('SP-003', 'NHAP', 'SUCCESS', 'Nhập kho thành công', CURRENT_TIMESTAMP - INTERVAL '1 hour'),
    ('SP-004', 'XUAT', 'SUCCESS', 'Xuất kho thành công', CURRENT_TIMESTAMP - INTERVAL '45 minutes'),
    ('SP-005', 'XUAT', 'SUCCESS', 'Xuất kho thành công', CURRENT_TIMESTAMP - INTERVAL '30 minutes'),
    ('SP-002', 'NHAP', 'SUCCESS', 'Nhập kho thành công', CURRENT_TIMESTAMP - INTERVAL '15 minutes'),
    ('SP-006', 'XUAT', 'SUCCESS', 'Xuất kho thành công', CURRENT_TIMESTAMP - INTERVAL '10 minutes'),
    ('SP-007', 'NHAP', 'SUCCESS', 'Nhập kho thành công', CURRENT_TIMESTAMP - INTERVAL '5 minutes'),
    ('SP-001', 'XUAT', 'SUCCESS', 'Xuất kho thành công', CURRENT_TIMESTAMP);

-- ============================================================
-- VERIFICATION: Check tables and data
-- ============================================================
-- SELECT * FROM inventory ORDER BY qr_code;
-- SELECT * FROM transaction_logs ORDER BY created_at DESC;
