CREATE DATABASE IF NOT EXISTS tkc_hotel_dev;
USE tkc_hotel_dev;
SELECT DATABASE();
CREATE TABLE IF NOT EXISTS tkc_hotel_dev.Customer (
    customer_id INT NOT NULL AUTO_INCREMENT,
    user_id INT DEFAULT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) DEFAULT NULL,
    phone VARCHAR(20) NOT NULL,
    identity_type VARCHAR(20) NOT NULL,
    identity_number VARCHAR(30) NOT NULL,
    password_hash VARCHAR(255) DEFAULT NULL,
    PRIMARY KEY (customer_id)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DESCRIBE tkc_hotel_dev.Customer;


CREATE TABLE IF NOT EXISTS tkc_hotel_dev.Booking (
  booking_id INT NOT NULL AUTO_INCREMENT,
  customer_id INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    channel VARCHAR(20) DEFAULT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    expected_arrival_at TIMESTAMP  NULL,
    hold_expires_at TIMESTAMP  NULL,
    proof_sent_at TIMESTAMP  NULL,
    deposit_rate DECIMAL(5,2) NOT NULL,
    total_snapshot DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (booking_id),
    Foreign Key (customer_id) REFERENCES tkc_hotel_dev.Customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 

DESCRIBE tkc_hotel_dev.Booking;


CREATE TABLE IF NOT EXISTS tkc_hotel_dev.Employee (
   employee_id INT NOT NULL AUTO_INCREMENT,
    department_name VARCHAR(100) NOT NULL ,
    role_name VARCHAR(100) NOT NULL ,
    name VARCHAR(150) NOT NULL,
     email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (employee_id )
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 

DESCRIBE tkc_hotel_dev.Employee;

CREATE TABLE IF NOT EXISTS tkc_hotel_dev.Payment (
    payment_id INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL ,
    verified_by INT  NULL ,
    method VARCHAR(30) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(30) NOT NULL,
    proof_reference VARCHAR(500)  NULL,
    submitted_at TIMESTAMP NOT NULL,
    auto_check_result TEXT  NULL,
    verified_at TIMESTAMP  NULL,
    PRIMARY KEY (payment_id),
    Foreign Key (booking_id) REFERENCES tkc_hotel_dev.Booking (booking_id),
    FOREIGN KEY (verified_by) REFERENCES tkc_hotel_dev.Employee (employee_id)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 

DESCRIBE tkc_hotel_dev.Payment;

CREATE TABLE IF NOT EXISTS tkc_hotel_dev.RoomType (
   room_type_id INT NOT NULL AUTO_INCREMENT,
    type_name VARCHAR(50) NOT NULL ,
    capacity INT NOT NULL ,
    price_per_night DECIMAL(12,2) NOT NULL,
    breakfast_daily_rate DECIMAL(12,2) NOT NULL ,
    
    PRIMARY KEY (room_type_id  )
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 

DESCRIBE tkc_hotel_dev.RoomType;

CREATE TABLE IF NOT EXISTS Room (
    room_id INT NOT NULL AUTO_INCREMENT,
    room_type_id INT NOT NULL,
    room_code VARCHAR(20) NOT NULL UNIQUE,
    current_status VARCHAR(100) NOT NULL DEFAULT 'AVAILABLE',
    area VARCHAR(100) DEFAULT NULL,
    -- เพิ่มการรายงานแม่บ้าน
   /* ALTER TABLE tkc_hotel_dev.Room
    ADD COLUMN damage_item VARCHAR(150) DEFAULT NULL,
    ADD COLUMN damage_description TEXT NULL,
    ADD COLUMN damage_photo_reference VARCHAR(500) DEFAULT NULL,
    ADD COLUMN damage_reported_at TIMESTAMP NULL DEFAULT NULL,
    ADD COLUMN damage_reported_by INT DEFAULT NULL,
    ADD CONSTRAINT fk_room_damage_reported_by
        FOREIGN KEY (damage_reported_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id);
SHOW CREATE TABLE tkc_hotel_dev.Room;*/
    PRIMARY KEY (room_id),
    FOREIGN KEY (room_type_id) REFERENCES RoomType (room_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
DESCRIBE tkc_hotel_dev.Room;

-- 2. รายการห้องในใบจอง
CREATE TABLE IF NOT EXISTS BookingRoom (
    booking_room_id INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL,
    room_type_id INT NOT NULL,
    guest_count INT NOT NULL,
    nightly_rate_snapshot DECIMAL(12,2) NOT NULL,
    net_amount DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (booking_room_id),
    FOREIGN KEY (booking_id) REFERENCES Booking (booking_id),
    FOREIGN KEY (room_type_id) REFERENCES RoomType (room_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. ประวัติการจัดและย้ายห้อง
CREATE TABLE IF NOT EXISTS RoomAssignment (
    assignment_id INT NOT NULL AUTO_INCREMENT,
    booking_room_id INT NOT NULL,
    room_id INT NOT NULL,
    assigned_by INT NOT NULL,
    approved_by INT DEFAULT NULL,
    effective_from TIMESTAMP NOT NULL,
    effective_to TIMESTAMP NULL DEFAULT NULL,
    reason TEXT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (assignment_id),
    FOREIGN KEY (booking_room_id) REFERENCES BookingRoom (booking_room_id),
    FOREIGN KEY (room_id) REFERENCES Room (room_id),
    FOREIGN KEY (assigned_by) REFERENCES Employee (employee_id),
    FOREIGN KEY (approved_by) REFERENCES Employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. รายการบริการของโรงแรม
CREATE TABLE IF NOT EXISTS Service (
    service_id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    charge_unit VARCHAR(30) NOT NULL,
    default_rate DECIMAL(12,2) NOT NULL,
    included_in_room BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. บริการที่เลือกในใบจอง
CREATE TABLE IF NOT EXISTS BookingService (
    booking_service_id INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL,
    service_type INT NOT NULL,
    added_by INT DEFAULT NULL,
    selected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) NOT NULL DEFAULT 'SELECTED',
    PRIMARY KEY (booking_service_id),
    FOREIGN KEY (booking_id) REFERENCES Booking (booking_id),
    FOREIGN KEY (service_type) REFERENCES Service (service_id),
    FOREIGN KEY (added_by) REFERENCES Employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. รายละเอียดการใช้บริการและราคาที่ตกลง
CREATE TABLE IF NOT EXISTS ServiceUsage (
    service_usage_id INT NOT NULL AUTO_INCREMENT,
    booking_service_id INT NOT NULL,
    booking_room_id INT NOT NULL,
    usage_date DATE DEFAULT NULL,
    unit_price_snapshot DECIMAL(12,2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    PRIMARY KEY (service_usage_id),
    FOREIGN KEY (booking_service_id) REFERENCES BookingService (booking_service_id),
    FOREIGN KEY (booking_room_id) REFERENCES BookingRoom (booking_room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. รายการจองทัวร์ พร้อมวันและเวลาเริ่มรอบ
CREATE TABLE IF NOT EXISTS TourReservation (
    tour_reservation_id INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL,
    tour_date DATE NOT NULL,
    start_time TIME NOT NULL,
    recorded_by INT DEFAULT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tour_reservation_id),
    FOREIGN KEY (booking_id) REFERENCES Booking (booking_id),
    FOREIGN KEY (recorded_by) REFERENCES Employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SHOW TABLES FROM tkc_hotel_dev;

/*ALTER TABLE tkc_hotel_dev.Payment
    ADD COLUMN rejection_reason VARCHAR(250) NULL;*/


START TRANSACTION;

INSERT INTO tkc_hotel_dev.RoomType
    (type_name, capacity, price_per_night, breakfast_daily_rate)
SELECT seed.type_name, seed.capacity, seed.nightly_rate, seed.breakfast_rate
FROM (
    SELECT 'Standard Room' AS type_name, 2 AS capacity,
           1000.00 AS nightly_rate, 350.00 AS breakfast_rate
    UNION ALL SELECT 'Deluxe Room',   2, 2000.00, 350.00
    UNION ALL SELECT 'Superior Room', 3, 1500.00, 350.00
    UNION ALL SELECT 'Family Room',   6, 4500.00, 500.00
) AS seed
WHERE NOT EXISTS (
    SELECT 1
    FROM tkc_hotel_dev.RoomType AS rt
    WHERE rt.type_name = seed.type_name
);

INSERT INTO tkc_hotel_dev.Room (room_type_id, room_code)
WITH RECURSIVE room_numbers AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1 FROM room_numbers WHERE n < 300
),
room_ranges AS (
    SELECT 'Standard Room' AS type_name, 'Std' AS prefix, 300 AS room_count
    UNION ALL SELECT 'Deluxe Room',   'Dlx', 250
    UNION ALL SELECT 'Superior Room', 'Sup', 150
    UNION ALL SELECT 'Family Room',   'Fam', 100
)
SELECT rt.room_type_id, CONCAT(rr.prefix, LPAD(rn.n, 3, '0'))
FROM room_ranges AS rr
JOIN tkc_hotel_dev.RoomType AS rt ON rt.type_name = rr.type_name
JOIN room_numbers AS rn ON rn.n <= rr.room_count
WHERE NOT EXISTS (
    SELECT 1
    FROM tkc_hotel_dev.Room AS r
    WHERE r.room_code = CONCAT(rr.prefix, LPAD(rn.n, 3, '0'))
);

COMMIT;

SELECT rt.type_name, COUNT(r.room_id) AS room_count,
       MIN(r.room_code) AS first_code, MAX(r.room_code) AS last_code
FROM tkc_hotel_dev.RoomType AS rt
LEFT JOIN tkc_hotel_dev.Room AS r ON r.room_type_id = rt.room_type_id
GROUP BY rt.room_type_id, rt.type_name;


SHOW COLUMNS FROM tkc_hotel_dev.Payment LIKE 'rejection_reason';

INSERT INTO tkc_hotel_dev.Service
    (name, charge_unit, default_rate, included_in_room, active)
SELECT seed.name, seed.charge_unit, seed.default_rate, seed.included_in_room, TRUE
FROM (
    SELECT 'อาหารเช้า' AS name, 'PER_ROOM_PER_DAY' AS charge_unit,
           0.00 AS default_rate, FALSE AS included_in_room
    UNION ALL
    SELECT 'สระว่ายน้ำ', 'INCLUDED', 0.00, TRUE
) AS seed
WHERE NOT EXISTS (
    SELECT 1 FROM tkc_hotel_dev.Service AS s WHERE s.name = seed.name
);

SELECT name, charge_unit, default_rate, included_in_room, active
FROM tkc_hotel_dev.Service;


-- ============================================================================
-- PLAN B START
-- เริ่มเก็บตกโครงสร้างฐานข้อมูลเพื่อรองรับการพัฒนา API
-- วันที่จัดทำ: 2026-11-15
--
-- ข้อสำคัญ
-- 1. SQL เดิมด้านบนยังคงไว้ทั้งหมด
-- 2. ส่วน PLAN B เป็น migration สำหรับ MySQL 8 และควรรันเพียงหนึ่งครั้ง
-- 3. ให้รันส่วน PRECHECK ก่อน หากพบข้อมูลผิดเงื่อนไขให้หยุดและแก้ข้อมูลก่อน
-- 4. ฐานข้อมูล local ถูก migrate แล้วเมื่อ 2026-11-15; ดู database/migration-record.md
--    ห้ามรันซ้ำบน schema เดิม ให้ใช้ database/schema.sql สำหรับฐานข้อมูลใหม่
-- 5. Customer.user_id ยังคงไว้เป็น legacy เพื่อไม่ลบข้อมูลเดิม แต่ API ใหม่ไม่ใช้
-- 6. ก่อนรันส่วน WRITE ให้สำรองฐานข้อมูล และรันทีละบล็อก PLAN B-01 ถึง B-14
--    เพราะ MySQL จะ commit คำสั่ง DDL แยกกัน หากบล็อกใดล้มเหลวห้ามรันทั้งช่วงซ้ำ
-- 7. API ต้องปิดบัญชี Customer/Employee ด้วย active = FALSE ไม่ใช้ hard delete
--    Foreign Key ของข้อมูลประวัติจึงตั้ง ON DELETE RESTRICT เพื่อรักษาชื่อผู้กระทำ
-- ============================================================================

-- กำหนด schema ให้ถูกต้อง แม้ผู้ใช้เลือก Execute เฉพาะส่วน PLAN B
USE tkc_hotel_dev;


-- ============================================================================
-- PLAN B PRECHECK (READ ONLY)
-- รันเฉพาะช่วงนี้ก่อน ส่วนนี้ไม่แก้ข้อมูล
-- ============================================================================

SELECT VERSION() AS mysql_version, DATABASE() AS current_database;

-- ต้องไม่พบอีเมลซ้ำ หากมีผลลัพธ์ให้แก้ข้อมูลก่อนเพิ่ม UNIQUE(email)
SELECT email, COUNT(*) AS duplicate_count
FROM tkc_hotel_dev.Customer
WHERE email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1;

-- สถานะห้องเดิมที่อยู่นอกชุดสถานะทางกายภาพใหม่
-- หากมีผลลัพธ์ ให้พิจารณาแปลงค่าเป็น AVAILABLE, OCCUPIED,
-- NEEDS_CLEANING หรือ OUT_OF_SERVICE ก่อนรัน PLAN B-04
SELECT room_id, room_code, current_status
FROM tkc_hotel_dev.Room
WHERE current_status NOT IN (
    'AVAILABLE', 'OCCUPIED', 'NEEDS_CLEANING', 'OUT_OF_SERVICE'
);

-- ต้องไม่พบ Booking ที่ผิดกฎวันที่หรือมียอดรวมติดลบ
-- หากมีผลลัพธ์ ให้แก้ข้อมูลก่อนเพิ่ม CHECK constraint ใน PLAN B-02
SELECT booking_id, check_in_date, check_out_date, total_snapshot
FROM tkc_hotel_dev.Booking
WHERE check_out_date <= check_in_date
   OR total_snapshot < 0;

-- ต้องไม่พบ Payment ที่ยอดเป็นศูนย์หรือติดลบ
-- จำนวนเงินเก็บเป็นค่าบวกเสมอ และใช้ direction ระบุทิศทางเงิน
SELECT payment_id, booking_id, amount, status
FROM tkc_hotel_dev.Payment
WHERE amount <= 0;

-- ต้องไม่พบชื่อ Service ซ้ำก่อนเพิ่ม UNIQUE(name)
SELECT name, COUNT(*) AS duplicate_count
FROM tkc_hotel_dev.Service
GROUP BY name
HAVING COUNT(*) > 1;

-- ต้องไม่พบ Service ที่ราคาติดลบ
SELECT service_id, name, default_rate
FROM tkc_hotel_dev.Service
WHERE default_rate < 0;

-- ต้องไม่พบค่าประเภทห้องผิดเงื่อนไขก่อนเพิ่ม CHECK constraint
SELECT room_type_id, type_name, capacity, price_per_night, breakfast_daily_rate
FROM tkc_hotel_dev.RoomType
WHERE capacity <= 0
   OR price_per_night < 0
   OR breakfast_daily_rate < 0;

-- ต้องไม่พบจำนวนผู้พักหรือยอด snapshot ของรายการห้องที่ผิดเงื่อนไข
SELECT booking_room_id, guest_count, nightly_rate_snapshot, net_amount
FROM tkc_hotel_dev.BookingRoom
WHERE guest_count <= 0
   OR nightly_rate_snapshot < 0
   OR net_amount < 0;

-- ต้องไม่พบจำนวนหรือราคาบริการที่ผิดเงื่อนไข
SELECT service_usage_id, unit_price_snapshot, quantity
FROM tkc_hotel_dev.ServiceUsage
WHERE unit_price_snapshot < 0
   OR quantity <= 0;

-- รอบทัวร์เดิมต้องไม่มีแถวที่ยังมีผลเกินความจุ 10 ที่นั่ง
-- หากมีผลลัพธ์ ให้ยกเลิก/แก้สถานะรายการส่วนเกินก่อนรัน PLAN B-11
SELECT tour_date, start_time, COUNT(*) AS active_participant_rows
FROM tkc_hotel_dev.TourReservation
WHERE status NOT IN ('CANCELLED', 'REJECTED', 'REFUNDED')
GROUP BY tour_date, start_time
HAVING COUNT(*) > 10;

-- ต้องไม่มีตารางหรือคอลัมน์ PLAN B จากการรันครั้งก่อน
-- หาก query ใดด้านล่างมีผลลัพธ์ ให้หยุดและตรวจว่ารันค้างถึงบล็อกใด
SELECT table_name AS existing_plan_b_table
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
      'Promotion', 'BookingPromotion', 'RoomEvent', 'TourRound',
      'Review', 'ChatMessage', 'AuditLog'
  )
ORDER BY table_name;

SELECT table_name, column_name AS existing_plan_b_column
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND (
      (table_name = 'Customer' AND column_name = 'member_status')
      OR (table_name = 'Booking' AND column_name = 'booking_code')
      OR (table_name = 'Payment' AND column_name = 'transaction_type')
      OR (table_name = 'Room' AND column_name = 'status_version')
      OR (table_name = 'Service' AND column_name = 'service_kind')
      OR (table_name = 'BookingService' AND column_name = 'service_id')
      OR (table_name = 'TourReservation' AND column_name = 'tour_round_id')
  )
ORDER BY table_name, column_name;

-- ตรวจจำนวนตารางตั้งต้น ปกติควรพบ 12 ตารางเดิม
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;


-- ============================================================================
-- PLAN B MIGRATION (WRITE)
-- เริ่มแก้โครงสร้างจริงตั้งแต่ PLAN B-01 เป็นต้นไป
-- ============================================================================


-- ----------------------------------------------------------------------------
-- [PLAN B-01] ปรับ Customer ให้รองรับสมาชิกและ Walk-in ในตารางเดียว
-- เหตุผล: ไม่เพิ่ม UserAccount ตามแผน B
-- หมายเหตุ: user_id คงไว้เป็น legacy และไม่สร้าง Foreign Key เพิ่ม
-- ----------------------------------------------------------------------------

ALTER TABLE tkc_hotel_dev.Customer
    MODIFY COLUMN user_id INT NULL
        COMMENT 'Legacy account reference; API Plan B does not use this column',
    ADD COLUMN member_status ENUM('WALK_IN', 'ACTIVE', 'SUSPENDED')
        NOT NULL DEFAULT 'WALK_IN' AFTER password_hash,
    ADD COLUMN registered_at TIMESTAMP NULL DEFAULT NULL AFTER member_status,
    ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL AFTER registered_at,
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE AFTER last_login_at,
    ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER active,
    ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- ลูกค้าเดิมที่มีทั้งอีเมลและรหัสผ่านถือว่าเป็นสมาชิกเดิม
-- แถวที่ข้อมูลบัญชีไม่ครบจะคงเป็น WALK_IN เพื่อไม่สร้างสมาชิกที่เข้าสู่ระบบไม่ได้
UPDATE tkc_hotel_dev.Customer
SET member_status = 'ACTIVE',
    registered_at = COALESCE(registered_at, CURRENT_TIMESTAMP)
WHERE email IS NOT NULL
  AND password_hash IS NOT NULL;

ALTER TABLE tkc_hotel_dev.Customer
    ADD CONSTRAINT uq_customer_email UNIQUE (email),
    ADD CONSTRAINT chk_customer_member_credentials
        CHECK (
            member_status = 'WALK_IN'
            OR (email IS NOT NULL AND password_hash IS NOT NULL)
        );


-- ----------------------------------------------------------------------------
-- [PLAN B-02] ปรับ Booking ให้เก็บสถานะปัจจุบันและ snapshot สำหรับ API
-- เหตุผล: ประวัติสถานะทั้งหมดจะเก็บใน AuditLog ไม่สร้าง BookingStatusHistory
-- ----------------------------------------------------------------------------

ALTER TABLE tkc_hotel_dev.Booking
    ADD COLUMN booking_code VARCHAR(20) NULL AFTER booking_id,
    ADD COLUMN status_changed_at TIMESTAMP NULL DEFAULT NULL AFTER status,
    ADD COLUMN status_changed_by INT NULL AFTER status_changed_at,
    ADD COLUMN room_subtotal_snapshot DECIMAL(12,2)
        NULL DEFAULT NULL AFTER deposit_rate,
    ADD COLUMN service_subtotal_snapshot DECIMAL(12,2)
        NULL DEFAULT NULL AFTER room_subtotal_snapshot,
    ADD COLUMN discount_total_snapshot DECIMAL(12,2)
        NULL DEFAULT NULL AFTER service_subtotal_snapshot,
    ADD COLUMN actual_check_in_at TIMESTAMP NULL DEFAULT NULL AFTER total_snapshot,
    ADD COLUMN actual_check_out_at TIMESTAMP NULL DEFAULT NULL AFTER actual_check_in_at,
    ADD COLUMN checked_in_by INT NULL AFTER actual_check_out_at,
    ADD COLUMN checked_out_by INT NULL AFTER checked_in_by,
    ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER checked_out_by,
    ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- สร้างรหัสแสดงผลให้ Booking เดิมก่อนบังคับ NOT NULL
UPDATE tkc_hotel_dev.Booking
SET booking_code = CONCAT('BKG-', LPAD(booking_id, 8, '0'))
WHERE booking_code IS NULL;

-- Booking เดิมมีเพียง total_snapshot จึงไม่แต่งองค์ประกอบย้อนหลังเป็น 0.00
-- ค่าองค์ประกอบทั้งสามคง NULL = ไม่ทราบ; API ต้องกรอกครบสำหรับ Booking ใหม่

ALTER TABLE tkc_hotel_dev.Booking
    MODIFY COLUMN booking_code VARCHAR(20) NOT NULL,
    ADD CONSTRAINT uq_booking_code UNIQUE (booking_code),
    ADD CONSTRAINT fk_booking_status_changed_by
        FOREIGN KEY (status_changed_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT fk_booking_checked_in_by
        FOREIGN KEY (checked_in_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT fk_booking_checked_out_by
        FOREIGN KEY (checked_out_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT chk_booking_date_range
        CHECK (check_out_date > check_in_date),
    ADD CONSTRAINT chk_booking_snapshot_amounts
        CHECK (
            total_snapshot >= 0
            AND (
                (
                    room_subtotal_snapshot IS NULL
                    AND service_subtotal_snapshot IS NULL
                    AND discount_total_snapshot IS NULL
                )
                OR
                (
                    room_subtotal_snapshot IS NOT NULL
                    AND service_subtotal_snapshot IS NOT NULL
                    AND discount_total_snapshot IS NOT NULL
                    AND room_subtotal_snapshot >= 0
                    AND service_subtotal_snapshot >= 0
                    AND discount_total_snapshot >= 0
                )
            )
        );

CREATE INDEX idx_booking_availability
    ON tkc_hotel_dev.Booking
    (status, check_in_date, check_out_date, hold_expires_at);


-- ----------------------------------------------------------------------------
-- [PLAN B-03] ปรับ Payment ให้รองรับรับเงิน คำขอคืนเงิน และการคืนเงินจริง
-- เหตุผล: Refund ใช้หลายแถวใน Payment และไม่แก้ทับรายการรับเงินเดิม
-- ----------------------------------------------------------------------------

ALTER TABLE tkc_hotel_dev.Payment
    MODIFY COLUMN method VARCHAR(30) NULL,
    ADD COLUMN transaction_type ENUM(
        'PAYMENT',
        'DEPOSIT',
        'BALANCE',
        'FULL_PAYMENT',
        'SERVICE_PAYMENT',
        'REFUND_REQUEST',
        'REFUND_PAYOUT'
    ) NOT NULL DEFAULT 'PAYMENT' AFTER booking_id,
    ADD COLUMN direction ENUM('IN', 'OUT', 'NONE')
        NOT NULL DEFAULT 'IN' AFTER transaction_type,
    ADD COLUMN related_payment_id INT NULL AFTER payment_id,
    ADD COLUMN requested_by INT NULL AFTER verified_at,
    ADD COLUMN requested_at TIMESTAMP NULL DEFAULT NULL AFTER requested_by,
    ADD COLUMN request_reason TEXT NULL AFTER requested_at,
    ADD COLUMN approved_by INT NULL AFTER request_reason,
    ADD COLUMN approved_at TIMESTAMP NULL DEFAULT NULL AFTER approved_by,
    ADD COLUMN processed_by INT NULL AFTER approved_at,
    ADD COLUMN processed_at TIMESTAMP NULL DEFAULT NULL AFTER processed_by,
    ADD COLUMN rejection_reason VARCHAR(250) NULL AFTER processed_at,
    ADD COLUMN idempotency_key VARCHAR(100) NULL AFTER rejection_reason,
    ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        AFTER idempotency_key;

ALTER TABLE tkc_hotel_dev.Payment
    ADD CONSTRAINT uq_payment_idempotency_key UNIQUE (idempotency_key),
    ADD CONSTRAINT fk_payment_related_payment
        FOREIGN KEY (related_payment_id)
        REFERENCES tkc_hotel_dev.Payment (payment_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT fk_payment_requested_by
        FOREIGN KEY (requested_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT fk_payment_approved_by
        FOREIGN KEY (approved_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT fk_payment_processed_by
        FOREIGN KEY (processed_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT chk_payment_amount_positive CHECK (amount > 0),
    ADD CONSTRAINT chk_payment_refund_reference
        CHECK (
            transaction_type NOT IN ('REFUND_REQUEST', 'REFUND_PAYOUT')
            OR related_payment_id IS NOT NULL
        ),
    ADD CONSTRAINT chk_payment_refund_request
        CHECK (
            transaction_type <> 'REFUND_REQUEST'
            OR (
                requested_by IS NOT NULL
                AND requested_at IS NOT NULL
                AND request_reason IS NOT NULL
                AND method IS NULL
            )
        ),
    ADD CONSTRAINT chk_payment_method
        CHECK (
            transaction_type = 'REFUND_REQUEST'
            OR method IS NOT NULL
        ),
    ADD CONSTRAINT chk_payment_direction
        CHECK (
            (transaction_type = 'REFUND_REQUEST' AND direction = 'NONE')
            OR
            (transaction_type = 'REFUND_PAYOUT' AND direction = 'OUT')
            OR
            (transaction_type NOT IN ('REFUND_REQUEST', 'REFUND_PAYOUT') AND direction = 'IN')
        );

-- กฎสำหรับ API: REFUND_REQUEST เป็น workflow จึง direction = NONE
-- ส่วน REFUND_PAYOUT เท่านั้นที่ direction = OUT และใช้หักยอดเงินจริงในรายงาน
-- related_payment_id ของ REFUND_REQUEST ชี้รายการรับเงินเดิม
-- related_payment_id ของ REFUND_PAYOUT ชี้ REFUND_REQUEST ที่อนุมัติแล้ว
-- การอนุมัติ/ปฏิเสธแก้เฉพาะแถว REFUND_REQUEST; ห้ามแก้ทับรายการรับเงินเดิม

CREATE INDEX idx_payment_booking_status
    ON tkc_hotel_dev.Payment (booking_id, status, transaction_type);


-- ----------------------------------------------------------------------------
-- [PLAN B-04] ปรับ Room ให้เก็บเฉพาะสถานะทางกายภาพปัจจุบัน
-- เหตุผล: ประวัติทำความสะอาด ความเสียหาย และปิดซ่อมเก็บใน RoomEvent
-- ----------------------------------------------------------------------------

ALTER TABLE tkc_hotel_dev.Room
    ADD COLUMN status_changed_at TIMESTAMP NULL DEFAULT NULL AFTER current_status,
    ADD COLUMN status_changed_by INT NULL AFTER status_changed_at,
    ADD COLUMN status_reason VARCHAR(250) NULL AFTER status_changed_by,
    ADD COLUMN status_version INT NOT NULL DEFAULT 0 AFTER status_reason,
    ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP AFTER area;

ALTER TABLE tkc_hotel_dev.Room
    ADD CONSTRAINT fk_room_status_changed_by
        FOREIGN KEY (status_changed_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT chk_room_current_status
        CHECK (current_status IN (
            'AVAILABLE', 'OCCUPIED', 'NEEDS_CLEANING', 'OUT_OF_SERVICE'
        )),
    ADD CONSTRAINT chk_room_status_version CHECK (status_version >= 0);

CREATE INDEX idx_room_type_status
    ON tkc_hotel_dev.Room (room_type_id, current_status);


-- ----------------------------------------------------------------------------
-- [PLAN B-04A] เพิ่มข้อกำหนดจำนวนและยอดเงินในตารางเดิมที่โครงสร้างไม่เปลี่ยน
-- เหตุผล: ป้องกันค่าติดลบและจำนวนศูนย์ตามกฎธุรกิจ โดยไม่เพิ่ม entity ใหม่
-- ----------------------------------------------------------------------------

ALTER TABLE tkc_hotel_dev.RoomType
    ADD CONSTRAINT chk_room_type_values
        CHECK (
            capacity > 0
            AND price_per_night >= 0
            AND breakfast_daily_rate >= 0
        );

ALTER TABLE tkc_hotel_dev.BookingRoom
    ADD CONSTRAINT chk_booking_room_values
        CHECK (
            guest_count > 0
            AND nightly_rate_snapshot >= 0
            AND net_amount >= 0
        );

ALTER TABLE tkc_hotel_dev.ServiceUsage
    ADD CONSTRAINT chk_service_usage_values
        CHECK (unit_price_snapshot >= 0 AND quantity > 0);


-- ----------------------------------------------------------------------------
-- [PLAN B-05] ปรับ Service ให้เป็น catalog ของบริการและสถานที่แนะนำ
-- เหตุผล: Attraction ใช้ Service ที่ service_kind = ATTRACTION
-- ----------------------------------------------------------------------------

ALTER TABLE tkc_hotel_dev.Service
    ADD COLUMN service_kind ENUM(
        'OTHER', 'BREAKFAST', 'FITNESS', 'SAUNA', 'POOL', 'TOUR', 'ATTRACTION'
    ) NOT NULL DEFAULT 'OTHER' AFTER name,
    ADD COLUMN description TEXT NULL AFTER service_kind,
    ADD COLUMN image_reference VARCHAR(500) NULL AFTER description,
    ADD COLUMN season VARCHAR(30) NULL AFTER image_reference,
    ADD COLUMN visible BOOLEAN NOT NULL DEFAULT TRUE AFTER season,
    ADD COLUMN schedule_json JSON NULL AFTER visible,
    ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER active,
    ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

UPDATE tkc_hotel_dev.Service
SET service_kind = CASE name
    WHEN 'อาหารเช้า' THEN 'BREAKFAST'
    WHEN 'ฟิตเนส' THEN 'FITNESS'
    WHEN 'ซาวน่า' THEN 'SAUNA'
    WHEN 'สระว่ายน้ำ' THEN 'POOL'
    WHEN 'เที่ยวตลาดกลางคืน' THEN 'TOUR'
    ELSE service_kind
END;

ALTER TABLE tkc_hotel_dev.Service
    ADD CONSTRAINT uq_service_name UNIQUE (name),
    ADD CONSTRAINT chk_service_rate_non_negative CHECK (default_rate >= 0);

-- เพิ่มเฉพาะบริการที่มีราคาและกฎระบุไว้แล้วใน Requirement
INSERT INTO tkc_hotel_dev.Service
    (name, service_kind, charge_unit, default_rate, included_in_room, active)
SELECT 'ฟิตเนส', 'FITNESS', 'PER_ROOM_PER_STAY', 500.00, FALSE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM tkc_hotel_dev.Service WHERE name = 'ฟิตเนส'
);

INSERT INTO tkc_hotel_dev.Service
    (name, service_kind, charge_unit, default_rate, included_in_room, active)
SELECT 'ซาวน่า', 'SAUNA', 'PER_ROOM_PER_STAY', 300.00, FALSE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM tkc_hotel_dev.Service WHERE name = 'ซาวน่า'
);

INSERT INTO tkc_hotel_dev.Service
    (name, service_kind, charge_unit, default_rate, included_in_room, active)
SELECT 'เที่ยวตลาดกลางคืน', 'TOUR', 'PER_PERSON_PER_ROUND', 50.00, FALSE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM tkc_hotel_dev.Service WHERE name = 'เที่ยวตลาดกลางคืน'
);


-- ----------------------------------------------------------------------------
-- [PLAN B-06] เปลี่ยนชื่อ BookingService.service_type เป็น service_id
-- เหตุผล: คอลัมน์นี้เป็น Foreign Key ไม่ใช่ข้อความประเภทบริการ
-- ----------------------------------------------------------------------------

ALTER TABLE tkc_hotel_dev.BookingService
    RENAME COLUMN service_type TO service_id;

CREATE INDEX idx_booking_service_booking_status
    ON tkc_hotel_dev.BookingService (booking_id, status, service_id);


-- ----------------------------------------------------------------------------
-- [PLAN B-07] เพิ่ม Promotion
-- หนึ่งแถวแทนโปรโมชั่นเปอร์เซ็นต์หนึ่งรายการ
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tkc_hotel_dev.Promotion (
    promotion_id INT NOT NULL AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    discount_percent DECIMAL(5,2) NOT NULL,
    priority INT NOT NULL DEFAULT 0,
    valid_from TIMESTAMP NULL DEFAULT NULL,
    valid_until TIMESTAMP NULL DEFAULT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (promotion_id),
    UNIQUE KEY uq_promotion_code (code),
    CONSTRAINT fk_promotion_created_by
        FOREIGN KEY (created_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_promotion_percent
        CHECK (discount_percent > 0 AND discount_percent <= 100),
    CONSTRAINT chk_promotion_period
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------------------
-- [PLAN B-08] เพิ่ม BookingPromotion
-- หนึ่งแถวแทนหนึ่งลำดับการใช้โปรโมชั่นและ snapshot การคำนวณ
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tkc_hotel_dev.BookingPromotion (
    booking_promotion_id INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL,
    promotion_id INT NOT NULL,
    sequence_no INT NOT NULL,
    percent_snapshot DECIMAL(5,2) NOT NULL,
    base_amount_before DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) NOT NULL,
    base_amount_after DECIMAL(12,2) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (booking_promotion_id),
    UNIQUE KEY uq_booking_promotion (booking_id, promotion_id),
    UNIQUE KEY uq_booking_promotion_sequence (booking_id, sequence_no),
    CONSTRAINT fk_booking_promotion_booking
        FOREIGN KEY (booking_id)
        REFERENCES tkc_hotel_dev.Booking (booking_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_booking_promotion_promotion
        FOREIGN KEY (promotion_id)
        REFERENCES tkc_hotel_dev.Promotion (promotion_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_booking_promotion_sequence CHECK (sequence_no > 0),
    CONSTRAINT chk_booking_promotion_percent
        CHECK (percent_snapshot > 0 AND percent_snapshot <= 100),
    CONSTRAINT chk_booking_promotion_amounts
        CHECK (
            base_amount_before >= 0
            AND discount_amount >= 0
            AND base_amount_after >= 0
            AND base_amount_after = base_amount_before - discount_amount
        )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------------------
-- [PLAN B-09] เพิ่ม RoomEvent
-- รวมประวัติทำความสะอาด ความเสียหาย ปิดซ่อม และเปิดห้อง
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tkc_hotel_dev.RoomEvent (
    room_event_id INT NOT NULL AUTO_INCREMENT,
    room_id INT NOT NULL,
    booking_room_id INT NULL,
    event_type ENUM(
        'CLEANING_QUEUED',
        'CLEANING_STARTED',
        'CLEANING_COMPLETED',
        'DAMAGE_REPORTED',
        'DAMAGE_REVIEWED',
        'DAMAGE_RESOLVED',
        'ROOM_CLOSED',
        'ROOM_REOPENED'
    ) NOT NULL,
    status VARCHAR(30) NULL,
    employee_id INT NULL,
    related_event_id INT NULL,
    item VARCHAR(150) NULL,
    description TEXT NULL,
    photo_reference VARCHAR(500) NULL,
    reason TEXT NULL,
    started_at TIMESTAMP NULL DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    effective_from TIMESTAMP NULL DEFAULT NULL,
    effective_to TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_event_id),
    CONSTRAINT fk_room_event_room
        FOREIGN KEY (room_id)
        REFERENCES tkc_hotel_dev.Room (room_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_room_event_booking_room
        FOREIGN KEY (booking_room_id)
        REFERENCES tkc_hotel_dev.BookingRoom (booking_room_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_room_event_employee
        FOREIGN KEY (employee_id)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_room_event_related_event
        FOREIGN KEY (related_event_id)
        REFERENCES tkc_hotel_dev.RoomEvent (room_event_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_room_event_times
        CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
    CONSTRAINT chk_room_event_period
        CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_room_event_room_created
    ON tkc_hotel_dev.RoomEvent (room_id, created_at, event_type);


-- ----------------------------------------------------------------------------
-- [PLAN B-10] เพิ่ม TourRound
-- หนึ่งแถวแทนรอบที่กำหนดล่วงหน้า แม้ยังไม่มีผู้จอง
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tkc_hotel_dev.TourRound (
    tour_round_id INT NOT NULL AUTO_INCREMENT,
    service_id INT NOT NULL,
    tour_date DATE NOT NULL,
    start_time TIME NOT NULL,
    capacity INT NOT NULL DEFAULT 10,
    status ENUM('OPEN', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tour_round_id),
    UNIQUE KEY uq_tour_round (service_id, tour_date, start_time),
    CONSTRAINT fk_tour_round_service
        FOREIGN KEY (service_id)
        REFERENCES tkc_hotel_dev.Service (service_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_tour_round_created_by
        FOREIGN KEY (created_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_tour_round_capacity CHECK (capacity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_tour_round_date_status
    ON tkc_hotel_dev.TourRound (tour_date, status, start_time);

-- กฎสำหรับ API: ก่อนเพิ่ม/ยืนยัน TourReservation ต้อง SELECT TourRound ... FOR UPDATE
-- แล้วนับที่นั่งสถานะยืนยันภายใน transaction เดียวกัน ห้ามให้เกิน capacity


-- ----------------------------------------------------------------------------
-- [PLAN B-11] ปรับ TourReservation ให้หนึ่งแถวแทนผู้ร่วมหนึ่งคนต่อรอบ
-- ขั้นตอนนี้ย้ายวันและเวลาเดิมไป TourRound ก่อนลบคอลัมน์เดิม
-- ----------------------------------------------------------------------------

ALTER TABLE tkc_hotel_dev.TourReservation
    ADD COLUMN tour_round_id INT NULL AFTER booking_id,
    ADD COLUMN participant_code VARCHAR(100) NULL AFTER tour_round_id,
    ADD COLUMN participant_name VARCHAR(150) NULL AFTER participant_code,
    ADD COLUMN usage_sequence_for_day INT NOT NULL DEFAULT 1 AFTER participant_name,
    ADD COLUMN unit_price_snapshot DECIMAL(12,2)
        NOT NULL DEFAULT 50.00 AFTER usage_sequence_for_day;

-- สร้าง TourRound จากรายการทัวร์เดิมก่อนเปลี่ยน Foreign Key
INSERT INTO tkc_hotel_dev.TourRound
    (service_id, tour_date, start_time, capacity, status, created_by)
SELECT
    service.service_id,
    legacy.tour_date,
    legacy.start_time,
    10,
    'OPEN',
    legacy.created_by
FROM (
    SELECT tour_date, start_time, MIN(recorded_by) AS created_by
    FROM tkc_hotel_dev.TourReservation
    GROUP BY tour_date, start_time
) AS legacy
JOIN tkc_hotel_dev.Service AS service
    ON service.name = 'เที่ยวตลาดกลางคืน'
LEFT JOIN tkc_hotel_dev.TourRound AS existing_round
    ON existing_round.service_id = service.service_id
    AND existing_round.tour_date = legacy.tour_date
    AND existing_round.start_time = legacy.start_time
WHERE existing_round.tour_round_id IS NULL;

UPDATE tkc_hotel_dev.TourReservation AS reservation
JOIN tkc_hotel_dev.Service AS service
    ON service.name = 'เที่ยวตลาดกลางคืน'
JOIN tkc_hotel_dev.TourRound AS round_data
    ON round_data.service_id = service.service_id
    AND round_data.tour_date = reservation.tour_date
    AND round_data.start_time = reservation.start_time
SET
    reservation.tour_round_id = round_data.tour_round_id,
    reservation.participant_code = COALESCE(
        reservation.participant_code,
        CONCAT('LEGACY-', reservation.tour_reservation_id)
    );

-- ข้อจำกัดข้อมูลเดิม: แถว legacy ไม่มีตัวระบุบุคคล จึงใช้ LEGACY-{id}
-- และถือ usage_sequence_for_day = 1; ข้อมูลครั้งที่ 2 ของบุคคลเดิมกู้กลับไม่ได้

ALTER TABLE tkc_hotel_dev.TourReservation
    MODIFY COLUMN tour_round_id INT NOT NULL,
    MODIFY COLUMN participant_code VARCHAR(100) NOT NULL,
    DROP COLUMN tour_date,
    DROP COLUMN start_time,
    ADD CONSTRAINT fk_tour_reservation_round
        FOREIGN KEY (tour_round_id)
        REFERENCES tkc_hotel_dev.TourRound (tour_round_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT uq_tour_reservation_participant
        UNIQUE (booking_id, tour_round_id, participant_code),
    ADD CONSTRAINT chk_tour_usage_sequence CHECK (usage_sequence_for_day > 0),
    ADD CONSTRAINT chk_tour_unit_price CHECK (unit_price_snapshot >= 0);

CREATE INDEX idx_tour_reservation_round_status
    ON tkc_hotel_dev.TourReservation (tour_round_id, status);


-- ----------------------------------------------------------------------------
-- [PLAN B-12] เพิ่ม Review
-- หนึ่ง Booking มีหลายรีวิวได้ และการซ่อนต้องเก็บเนื้อหาเดิม
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tkc_hotel_dev.Review (
    review_id INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL,
    rating TINYINT NOT NULL,
    content TEXT NOT NULL,
    status ENUM('PUBLISHED', 'HIDDEN') NOT NULL DEFAULT 'PUBLISHED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hidden_by INT NULL,
    hidden_at TIMESTAMP NULL DEFAULT NULL,
    hidden_reason VARCHAR(500) NULL,
    PRIMARY KEY (review_id),
    CONSTRAINT fk_review_booking
        FOREIGN KEY (booking_id)
        REFERENCES tkc_hotel_dev.Booking (booking_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_review_hidden_by
        FOREIGN KEY (hidden_by)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_review_hidden_metadata
        CHECK (
            status = 'PUBLISHED'
            OR (hidden_at IS NOT NULL AND hidden_reason IS NOT NULL)
        )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_review_booking_status
    ON tkc_hotel_dev.Review (booking_id, status, created_at);


-- ----------------------------------------------------------------------------
-- [PLAN B-13] เพิ่ม ChatMessage
-- หนึ่ง Customer มีห้องสนทนาหลักหนึ่งห้องและมีข้อความได้หลายรายการ
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tkc_hotel_dev.ChatMessage (
    message_id INT NOT NULL AUTO_INCREMENT,
    customer_id INT NOT NULL,
    sender_type ENUM('CUSTOMER', 'EMPLOYEE') NOT NULL,
    sender_employee_id INT NULL,
    message_text TEXT NOT NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (message_id),
    CONSTRAINT fk_chat_message_customer
        FOREIGN KEY (customer_id)
        REFERENCES tkc_hotel_dev.Customer (customer_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_chat_message_employee
        FOREIGN KEY (sender_employee_id)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_chat_message_sender
        CHECK (
            (sender_type = 'CUSTOMER' AND sender_employee_id IS NULL)
            OR
            (sender_type = 'EMPLOYEE' AND sender_employee_id IS NOT NULL)
        )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_chat_message_customer_time
    ON tkc_hotel_dev.ChatMessage (customer_id, sent_at);


-- ----------------------------------------------------------------------------
-- [PLAN B-14] เพิ่ม AuditLog
-- ใช้แทนตารางประวัติแยก เช่น BookingStatusHistory และ PromotionHistory
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tkc_hotel_dev.AuditLog (
    audit_log_id BIGINT NOT NULL AUTO_INCREMENT,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_type ENUM('SYSTEM', 'CUSTOMER', 'EMPLOYEE') NOT NULL,
    actor_customer_id INT NULL,
    actor_employee_id INT NULL,
    before_data JSON NULL,
    after_data JSON NULL,
    reason TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (audit_log_id),
    CONSTRAINT fk_audit_log_customer
        FOREIGN KEY (actor_customer_id)
        REFERENCES tkc_hotel_dev.Customer (customer_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_audit_log_employee
        FOREIGN KEY (actor_employee_id)
        REFERENCES tkc_hotel_dev.Employee (employee_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_audit_log_actor
        CHECK (
            (actor_type = 'SYSTEM'
                AND actor_customer_id IS NULL
                AND actor_employee_id IS NULL)
            OR
            (actor_type = 'CUSTOMER'
                AND actor_customer_id IS NOT NULL
                AND actor_employee_id IS NULL)
            OR
            (actor_type = 'EMPLOYEE'
                AND actor_customer_id IS NULL
                AND actor_employee_id IS NOT NULL)
        )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_audit_log_target
    ON tkc_hotel_dev.AuditLog (entity_type, entity_id, created_at);

CREATE INDEX idx_audit_log_employee
    ON tkc_hotel_dev.AuditLog (actor_employee_id, created_at);


-- ============================================================================
-- PLAN B POSTCHECK (READ ONLY)
-- รันหลัง migration เพื่อยืนยันผล ส่วนนี้ไม่แก้ข้อมูล
-- ============================================================================

-- ต้องได้ expected_table_count = 19
SELECT COUNT(*) AS expected_table_count
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
      'Customer', 'Booking', 'Employee', 'Payment', 'RoomType', 'Room',
      'BookingRoom', 'RoomAssignment', 'Service', 'BookingService',
      'ServiceUsage', 'TourReservation', 'Promotion', 'BookingPromotion',
      'RoomEvent', 'TourRound', 'Review', 'ChatMessage', 'AuditLog'
  );

-- แสดงรายการ 19 ตารางที่ระบบคาดหวัง
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
      'Customer', 'Booking', 'Employee', 'Payment', 'RoomType', 'Room',
      'BookingRoom', 'RoomAssignment', 'Service', 'BookingService',
      'ServiceUsage', 'TourReservation', 'Promotion', 'BookingPromotion',
      'RoomEvent', 'TourRound', 'Review', 'ChatMessage', 'AuditLog'
  )
ORDER BY table_name;

-- ตรวจทุกคอลัมน์ของตารางที่เพิ่มหรือเปลี่ยนตาม PLAN B
SELECT table_name, column_name, column_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name IN (
      'Customer', 'Booking', 'Payment', 'RoomType', 'Room',
      'BookingRoom', 'Service', 'BookingService', 'ServiceUsage',
      'TourReservation', 'Promotion', 'BookingPromotion', 'RoomEvent',
      'TourRound', 'Review', 'ChatMessage', 'AuditLog'
  )
ORDER BY table_name, ordinal_position;

-- ต้องได้ห้องรวม 800 ห้อง และรหัสต้น–ปลายตรงกับข้อมูลตั้งต้น
SELECT
    room_type.type_name,
    COUNT(room.room_id) AS room_count,
    MIN(room.room_code) AS first_code,
    MAX(room.room_code) AS last_code
FROM tkc_hotel_dev.RoomType AS room_type
LEFT JOIN tkc_hotel_dev.Room AS room
    ON room.room_type_id = room_type.room_type_id
GROUP BY room_type.room_type_id, room_type.type_name
ORDER BY room_type.room_type_id;

SELECT COUNT(*) AS total_room_count
FROM tkc_hotel_dev.Room;

-- ตรวจ Foreign Key ของตารางใหม่และคอลัมน์ใหม่
SELECT
    table_name,
    constraint_name,
    column_name,
    referenced_table_name,
    referenced_column_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND referenced_table_name IS NOT NULL
  AND table_name IN (
      'Booking', 'Payment', 'Room', 'Promotion', 'BookingPromotion',
      'RoomEvent', 'TourRound', 'TourReservation', 'Review',
      'ChatMessage', 'AuditLog'
  )
ORDER BY table_name, constraint_name, ordinal_position;

-- ทุก orphan_count ต้องเป็น 0
SELECT 'Booking.status_changed_by -> Employee' AS relation_name, COUNT(*) AS orphan_count
FROM tkc_hotel_dev.Booking AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.status_changed_by
WHERE child.status_changed_by IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'Booking.checked_in_by -> Employee', COUNT(*)
FROM tkc_hotel_dev.Booking AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.checked_in_by
WHERE child.checked_in_by IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'Booking.checked_out_by -> Employee', COUNT(*)
FROM tkc_hotel_dev.Booking AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.checked_out_by
WHERE child.checked_out_by IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'Payment.related_payment_id -> Payment', COUNT(*)
FROM tkc_hotel_dev.Payment AS child
LEFT JOIN tkc_hotel_dev.Payment AS parent
    ON parent.payment_id = child.related_payment_id
WHERE child.related_payment_id IS NOT NULL AND parent.payment_id IS NULL
UNION ALL
SELECT 'Payment.requested_by -> Employee', COUNT(*)
FROM tkc_hotel_dev.Payment AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.requested_by
WHERE child.requested_by IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'Payment.approved_by -> Employee', COUNT(*)
FROM tkc_hotel_dev.Payment AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.approved_by
WHERE child.approved_by IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'Payment.processed_by -> Employee', COUNT(*)
FROM tkc_hotel_dev.Payment AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.processed_by
WHERE child.processed_by IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'Room.status_changed_by -> Employee', COUNT(*)
FROM tkc_hotel_dev.Room AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.status_changed_by
WHERE child.status_changed_by IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'BookingService.service_id -> Service', COUNT(*)
FROM tkc_hotel_dev.BookingService AS child
LEFT JOIN tkc_hotel_dev.Service AS parent
    ON parent.service_id = child.service_id
WHERE parent.service_id IS NULL
UNION ALL
SELECT 'TourReservation.tour_round_id -> TourRound', COUNT(*)
FROM tkc_hotel_dev.TourReservation AS child
LEFT JOIN tkc_hotel_dev.TourRound AS parent
    ON parent.tour_round_id = child.tour_round_id
WHERE parent.tour_round_id IS NULL
UNION ALL
SELECT 'Promotion.created_by -> Employee', COUNT(*)
FROM tkc_hotel_dev.Promotion AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.created_by
WHERE child.created_by IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'BookingPromotion.booking_id -> Booking', COUNT(*)
FROM tkc_hotel_dev.BookingPromotion AS child
LEFT JOIN tkc_hotel_dev.Booking AS parent
    ON parent.booking_id = child.booking_id
WHERE parent.booking_id IS NULL
UNION ALL
SELECT 'BookingPromotion.promotion_id -> Promotion', COUNT(*)
FROM tkc_hotel_dev.BookingPromotion AS child
LEFT JOIN tkc_hotel_dev.Promotion AS parent
    ON parent.promotion_id = child.promotion_id
WHERE parent.promotion_id IS NULL
UNION ALL
SELECT 'RoomEvent.room_id -> Room', COUNT(*)
FROM tkc_hotel_dev.RoomEvent AS child
LEFT JOIN tkc_hotel_dev.Room AS parent
    ON parent.room_id = child.room_id
WHERE parent.room_id IS NULL
UNION ALL
SELECT 'RoomEvent.booking_room_id -> BookingRoom', COUNT(*)
FROM tkc_hotel_dev.RoomEvent AS child
LEFT JOIN tkc_hotel_dev.BookingRoom AS parent
    ON parent.booking_room_id = child.booking_room_id
WHERE child.booking_room_id IS NOT NULL AND parent.booking_room_id IS NULL
UNION ALL
SELECT 'RoomEvent.employee_id -> Employee', COUNT(*)
FROM tkc_hotel_dev.RoomEvent AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.employee_id
WHERE child.employee_id IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'RoomEvent.related_event_id -> RoomEvent', COUNT(*)
FROM tkc_hotel_dev.RoomEvent AS child
LEFT JOIN tkc_hotel_dev.RoomEvent AS parent
    ON parent.room_event_id = child.related_event_id
WHERE child.related_event_id IS NOT NULL AND parent.room_event_id IS NULL
UNION ALL
SELECT 'TourRound.service_id -> Service', COUNT(*)
FROM tkc_hotel_dev.TourRound AS child
LEFT JOIN tkc_hotel_dev.Service AS parent
    ON parent.service_id = child.service_id
WHERE parent.service_id IS NULL
UNION ALL
SELECT 'TourRound.created_by -> Employee', COUNT(*)
FROM tkc_hotel_dev.TourRound AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.created_by
WHERE child.created_by IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'Review.booking_id -> Booking', COUNT(*)
FROM tkc_hotel_dev.Review AS child
LEFT JOIN tkc_hotel_dev.Booking AS parent
    ON parent.booking_id = child.booking_id
WHERE parent.booking_id IS NULL
UNION ALL
SELECT 'Review.hidden_by -> Employee', COUNT(*)
FROM tkc_hotel_dev.Review AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.hidden_by
WHERE child.hidden_by IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'ChatMessage.customer_id -> Customer', COUNT(*)
FROM tkc_hotel_dev.ChatMessage AS child
LEFT JOIN tkc_hotel_dev.Customer AS parent
    ON parent.customer_id = child.customer_id
WHERE parent.customer_id IS NULL
UNION ALL
SELECT 'ChatMessage.sender_employee_id -> Employee', COUNT(*)
FROM tkc_hotel_dev.ChatMessage AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.sender_employee_id
WHERE child.sender_employee_id IS NOT NULL AND parent.employee_id IS NULL
UNION ALL
SELECT 'AuditLog.actor_customer_id -> Customer', COUNT(*)
FROM tkc_hotel_dev.AuditLog AS child
LEFT JOIN tkc_hotel_dev.Customer AS parent
    ON parent.customer_id = child.actor_customer_id
WHERE child.actor_customer_id IS NOT NULL AND parent.customer_id IS NULL
UNION ALL
SELECT 'AuditLog.actor_employee_id -> Employee', COUNT(*)
FROM tkc_hotel_dev.AuditLog AS child
LEFT JOIN tkc_hotel_dev.Employee AS parent
    ON parent.employee_id = child.actor_employee_id
WHERE child.actor_employee_id IS NOT NULL AND parent.employee_id IS NULL;

-- PLAN B END
