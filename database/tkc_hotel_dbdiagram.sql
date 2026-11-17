-- SQL dump generated using DBML (dbml.dbdiagram.io)
-- Database: MySQL
-- Generated at: 2026-11-16T13:50:32.290Z

CREATE TABLE `AuditLog` (
  `audit_log_id` bigint PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` bigint NOT NULL,
  `action` varchar(50) NOT NULL,
  `actor_type` ENUM ('SYSTEM', 'CUSTOMER', 'EMPLOYEE') NOT NULL,
  `actor_customer_id` int,
  `actor_employee_id` int,
  `before_data` json,
  `after_data` json,
  `reason` text,
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `Booking` (
  `booking_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `booking_code` varchar(20) NOT NULL,
  `customer_id` int NOT NULL,
  `status` varchar(50) NOT NULL,
  `status_changed_at` timestamp,
  `status_changed_by` int,
  `channel` varchar(20),
  `check_in_date` date NOT NULL,
  `check_out_date` date NOT NULL,
  `expected_arrival_at` timestamp,
  `hold_expires_at` timestamp,
  `proof_sent_at` timestamp,
  `deposit_rate` decimal(5,2) NOT NULL,
  `room_subtotal_snapshot` decimal(12,2),
  `service_subtotal_snapshot` decimal(12,2),
  `discount_total_snapshot` decimal(12,2),
  `total_snapshot` decimal(12,2) NOT NULL,
  `actual_check_in_at` timestamp,
  `actual_check_out_at` timestamp,
  `checked_in_by` int,
  `checked_out_by` int,
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `BookingPromotion` (
  `booking_promotion_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `promotion_id` int NOT NULL,
  `sequence_no` int NOT NULL,
  `percent_snapshot` decimal(5,2) NOT NULL,
  `base_amount_before` decimal(12,2) NOT NULL,
  `discount_amount` decimal(12,2) NOT NULL,
  `base_amount_after` decimal(12,2) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `BookingRoom` (
  `booking_room_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `room_type_id` int NOT NULL,
  `guest_count` int NOT NULL,
  `nightly_rate_snapshot` decimal(12,2) NOT NULL,
  `net_amount` decimal(12,2) NOT NULL
);

CREATE TABLE `BookingService` (
  `booking_service_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `service_id` int NOT NULL,
  `added_by` int,
  `selected_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `status` varchar(30) NOT NULL DEFAULT 'SELECTED'
);

CREATE TABLE `ChatMessage` (
  `message_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `sender_type` ENUM ('CUSTOMER', 'EMPLOYEE') NOT NULL,
  `sender_employee_id` int,
  `message_text` text NOT NULL,
  `sent_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `read_at` timestamp
);

CREATE TABLE `Customer` (
  `customer_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `user_id` int COMMENT 'Legacy account reference; API Plan B does not use this column',
  `full_name` varchar(150) NOT NULL,
  `email` varchar(255),
  `phone` varchar(20) NOT NULL,
  `identity_type` varchar(20) NOT NULL,
  `identity_number` varchar(30) NOT NULL,
  `password_hash` varchar(255),
  `member_status` ENUM ('WALK_IN', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'WALK_IN',
  `registered_at` timestamp,
  `last_login_at` timestamp,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `Employee` (
  `employee_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `department_name` varchar(100) NOT NULL,
  `role_name` varchar(100) NOT NULL,
  `name` varchar(150) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1'
);

CREATE TABLE `Payment` (
  `payment_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `related_payment_id` int,
  `booking_id` int NOT NULL,
  `transaction_type` ENUM ('PAYMENT', 'DEPOSIT', 'BALANCE', 'FULL_PAYMENT', 'SERVICE_PAYMENT', 'REFUND_REQUEST', 'REFUND_PAYOUT') NOT NULL DEFAULT 'PAYMENT',
  `direction` ENUM ('IN', 'OUT', 'NONE') NOT NULL DEFAULT 'IN',
  `verified_by` int,
  `method` varchar(30),
  `amount` decimal(12,2) NOT NULL,
  `status` varchar(30) NOT NULL,
  `proof_reference` varchar(500),
  `submitted_at` timestamp NOT NULL,
  `auto_check_result` text,
  `verified_at` timestamp,
  `requested_by` int,
  `requested_at` timestamp,
  `request_reason` text,
  `approved_by` int,
  `approved_at` timestamp,
  `processed_by` int,
  `processed_at` timestamp,
  `rejection_reason` varchar(250),
  `idempotency_key` varchar(100),
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `Promotion` (
  `promotion_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `discount_percent` decimal(5,2) NOT NULL,
  `priority` int NOT NULL DEFAULT '0',
  `valid_from` timestamp,
  `valid_until` timestamp,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int,
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `Review` (
  `review_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `rating` tinyint NOT NULL,
  `content` text NOT NULL,
  `status` ENUM ('PUBLISHED', 'HIDDEN') NOT NULL DEFAULT 'PUBLISHED',
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `hidden_by` int,
  `hidden_at` timestamp,
  `hidden_reason` varchar(500)
);

CREATE TABLE `Room` (
  `room_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `room_type_id` int NOT NULL,
  `room_code` varchar(20) NOT NULL,
  `current_status` varchar(100) NOT NULL DEFAULT 'AVAILABLE',
  `status_changed_at` timestamp,
  `status_changed_by` int,
  `status_reason` varchar(250),
  `status_version` int NOT NULL DEFAULT '0',
  `area` varchar(100),
  `updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `damage_item` varchar(150),
  `damage_description` text,
  `damage_photo_reference` varchar(500),
  `damage_reported_at` timestamp,
  `damage_reported_by` int
);

CREATE TABLE `RoomAssignment` (
  `assignment_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `booking_room_id` int NOT NULL,
  `room_id` int NOT NULL,
  `assigned_by` int NOT NULL,
  `approved_by` int,
  `effective_from` timestamp NOT NULL,
  `effective_to` timestamp,
  `reason` text,
  `assigned_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `RoomEvent` (
  `room_event_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `room_id` int NOT NULL,
  `booking_room_id` int,
  `event_type` ENUM ('CLEANING_QUEUED', 'CLEANING_STARTED', 'CLEANING_COMPLETED', 'DAMAGE_REPORTED', 'DAMAGE_REVIEWED', 'DAMAGE_RESOLVED', 'ROOM_CLOSED', 'ROOM_REOPENED') NOT NULL,
  `status` varchar(30),
  `employee_id` int,
  `related_event_id` int,
  `item` varchar(150),
  `description` text,
  `photo_reference` varchar(500),
  `reason` text,
  `started_at` timestamp,
  `completed_at` timestamp,
  `effective_from` timestamp,
  `effective_to` timestamp,
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `RoomType` (
  `room_type_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `type_name` varchar(50) NOT NULL,
  `capacity` int NOT NULL,
  `price_per_night` decimal(12,2) NOT NULL,
  `breakfast_daily_rate` decimal(12,2) NOT NULL
);

CREATE TABLE `Service` (
  `service_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `service_kind` ENUM ('OTHER', 'BREAKFAST', 'FITNESS', 'SAUNA', 'POOL', 'TOUR', 'ATTRACTION') NOT NULL DEFAULT 'OTHER',
  `description` text,
  `image_reference` varchar(500),
  `season` varchar(30),
  `visible` tinyint(1) NOT NULL DEFAULT '1',
  `schedule_json` json,
  `charge_unit` varchar(30) NOT NULL,
  `default_rate` decimal(12,2) NOT NULL,
  `included_in_room` tinyint(1) NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `ServiceUsage` (
  `service_usage_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `booking_service_id` int NOT NULL,
  `booking_room_id` int NOT NULL,
  `usage_date` date,
  `unit_price_snapshot` decimal(12,2) NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `status` varchar(30) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE `TourReservation` (
  `tour_reservation_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `tour_round_id` int NOT NULL,
  `participant_code` varchar(100) NOT NULL,
  `participant_name` varchar(150),
  `usage_sequence_for_day` int NOT NULL DEFAULT '1',
  `unit_price_snapshot` decimal(12,2) NOT NULL DEFAULT '50.00',
  `recorded_by` int,
  `status` varchar(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `TourRound` (
  `tour_round_id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `service_id` int NOT NULL,
  `tour_date` date NOT NULL,
  `start_time` time NOT NULL,
  `capacity` int NOT NULL DEFAULT '10',
  `status` ENUM ('OPEN', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
  `created_by` int,
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX `fk_audit_log_customer` ON `AuditLog` (`actor_customer_id`);

CREATE INDEX `idx_audit_log_target` ON `AuditLog` (`entity_type`, `entity_id`, `created_at`);

CREATE INDEX `idx_audit_log_employee` ON `AuditLog` (`actor_employee_id`, `created_at`);

CREATE UNIQUE INDEX `uq_booking_code` ON `Booking` (`booking_code`);

CREATE INDEX `customer_id` ON `Booking` (`customer_id`);

CREATE INDEX `fk_booking_status_changed_by` ON `Booking` (`status_changed_by`);

CREATE INDEX `fk_booking_checked_in_by` ON `Booking` (`checked_in_by`);

CREATE INDEX `fk_booking_checked_out_by` ON `Booking` (`checked_out_by`);

CREATE INDEX `idx_booking_availability` ON `Booking` (`status`, `check_in_date`, `check_out_date`, `hold_expires_at`);

CREATE UNIQUE INDEX `uq_booking_promotion` ON `BookingPromotion` (`booking_id`, `promotion_id`);

CREATE UNIQUE INDEX `uq_booking_promotion_sequence` ON `BookingPromotion` (`booking_id`, `sequence_no`);

CREATE INDEX `fk_booking_promotion_promotion` ON `BookingPromotion` (`promotion_id`);

CREATE INDEX `booking_id` ON `BookingRoom` (`booking_id`);

CREATE INDEX `room_type_id` ON `BookingRoom` (`room_type_id`);

CREATE INDEX `service_type` ON `BookingService` (`service_id`);

CREATE INDEX `added_by` ON `BookingService` (`added_by`);

CREATE INDEX `idx_booking_service_booking_status` ON `BookingService` (`booking_id`, `status`, `service_id`);

CREATE INDEX `fk_chat_message_employee` ON `ChatMessage` (`sender_employee_id`);

CREATE INDEX `idx_chat_message_customer_time` ON `ChatMessage` (`customer_id`, `sent_at`);

CREATE UNIQUE INDEX `uq_customer_email` ON `Customer` (`email`);

CREATE UNIQUE INDEX `email` ON `Employee` (`email`);

CREATE UNIQUE INDEX `uq_payment_idempotency_key` ON `Payment` (`idempotency_key`);

CREATE INDEX `verified_by` ON `Payment` (`verified_by`);

CREATE INDEX `fk_payment_related_payment` ON `Payment` (`related_payment_id`);

CREATE INDEX `fk_payment_requested_by` ON `Payment` (`requested_by`);

CREATE INDEX `fk_payment_approved_by` ON `Payment` (`approved_by`);

CREATE INDEX `fk_payment_processed_by` ON `Payment` (`processed_by`);

CREATE INDEX `idx_payment_booking_status` ON `Payment` (`booking_id`, `status`, `transaction_type`);

CREATE UNIQUE INDEX `uq_promotion_code` ON `Promotion` (`code`);

CREATE INDEX `fk_promotion_created_by` ON `Promotion` (`created_by`);

CREATE INDEX `fk_review_hidden_by` ON `Review` (`hidden_by`);

CREATE INDEX `idx_review_booking_status` ON `Review` (`booking_id`, `status`, `created_at`);

CREATE UNIQUE INDEX `room_code` ON `Room` (`room_code`);

CREATE INDEX `fk_room_status_changed_by` ON `Room` (`status_changed_by`);

CREATE INDEX `fk_room_damage_reported_by` ON `Room` (`damage_reported_by`);

CREATE INDEX `idx_room_type_status` ON `Room` (`room_type_id`, `current_status`);

CREATE INDEX `booking_room_id` ON `RoomAssignment` (`booking_room_id`);

CREATE INDEX `room_id` ON `RoomAssignment` (`room_id`);

CREATE INDEX `assigned_by` ON `RoomAssignment` (`assigned_by`);

CREATE INDEX `approved_by` ON `RoomAssignment` (`approved_by`);

CREATE INDEX `fk_room_event_booking_room` ON `RoomEvent` (`booking_room_id`);

CREATE INDEX `fk_room_event_employee` ON `RoomEvent` (`employee_id`);

CREATE INDEX `fk_room_event_related_event` ON `RoomEvent` (`related_event_id`);

CREATE INDEX `idx_room_event_room_created` ON `RoomEvent` (`room_id`, `created_at`, `event_type`);

CREATE UNIQUE INDEX `uq_service_name` ON `Service` (`name`);

CREATE INDEX `booking_service_id` ON `ServiceUsage` (`booking_service_id`);

CREATE INDEX `booking_room_id` ON `ServiceUsage` (`booking_room_id`);

CREATE UNIQUE INDEX `uq_tour_reservation_participant` ON `TourReservation` (`booking_id`, `tour_round_id`, `participant_code`);

CREATE INDEX `recorded_by` ON `TourReservation` (`recorded_by`);

CREATE INDEX `idx_tour_reservation_round_status` ON `TourReservation` (`tour_round_id`, `status`);

CREATE UNIQUE INDEX `uq_tour_round` ON `TourRound` (`service_id`, `tour_date`, `start_time`);

CREATE INDEX `fk_tour_round_created_by` ON `TourRound` (`created_by`);

CREATE INDEX `idx_tour_round_date_status` ON `TourRound` (`tour_date`, `status`, `start_time`);

ALTER TABLE `AuditLog` ADD CONSTRAINT `fk_audit_log_customer` FOREIGN KEY (`actor_customer_id`) REFERENCES `Customer` (`customer_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `AuditLog` ADD CONSTRAINT `fk_audit_log_employee` FOREIGN KEY (`actor_employee_id`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Booking` ADD CONSTRAINT `booking_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `Customer` (`customer_id`);

ALTER TABLE `Booking` ADD CONSTRAINT `fk_booking_checked_in_by` FOREIGN KEY (`checked_in_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Booking` ADD CONSTRAINT `fk_booking_checked_out_by` FOREIGN KEY (`checked_out_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Booking` ADD CONSTRAINT `fk_booking_status_changed_by` FOREIGN KEY (`status_changed_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `BookingPromotion` ADD CONSTRAINT `fk_booking_promotion_booking` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `BookingPromotion` ADD CONSTRAINT `fk_booking_promotion_promotion` FOREIGN KEY (`promotion_id`) REFERENCES `Promotion` (`promotion_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `BookingRoom` ADD CONSTRAINT `bookingroom_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`);

ALTER TABLE `BookingRoom` ADD CONSTRAINT `bookingroom_ibfk_2` FOREIGN KEY (`room_type_id`) REFERENCES `RoomType` (`room_type_id`);

ALTER TABLE `BookingService` ADD CONSTRAINT `bookingservice_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`);

ALTER TABLE `BookingService` ADD CONSTRAINT `bookingservice_ibfk_2` FOREIGN KEY (`service_id`) REFERENCES `Service` (`service_id`);

ALTER TABLE `BookingService` ADD CONSTRAINT `bookingservice_ibfk_3` FOREIGN KEY (`added_by`) REFERENCES `Employee` (`employee_id`);

ALTER TABLE `ChatMessage` ADD CONSTRAINT `fk_chat_message_customer` FOREIGN KEY (`customer_id`) REFERENCES `Customer` (`customer_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `ChatMessage` ADD CONSTRAINT `fk_chat_message_employee` FOREIGN KEY (`sender_employee_id`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Payment` ADD CONSTRAINT `fk_payment_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Payment` ADD CONSTRAINT `fk_payment_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Payment` ADD CONSTRAINT `fk_payment_related_payment` FOREIGN KEY (`related_payment_id`) REFERENCES `Payment` (`payment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Payment` ADD CONSTRAINT `fk_payment_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Payment` ADD CONSTRAINT `payment_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`);

ALTER TABLE `Payment` ADD CONSTRAINT `payment_ibfk_2` FOREIGN KEY (`verified_by`) REFERENCES `Employee` (`employee_id`);

ALTER TABLE `Promotion` ADD CONSTRAINT `fk_promotion_created_by` FOREIGN KEY (`created_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Review` ADD CONSTRAINT `fk_review_booking` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Review` ADD CONSTRAINT `fk_review_hidden_by` FOREIGN KEY (`hidden_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Room` ADD CONSTRAINT `fk_room_status_changed_by` FOREIGN KEY (`status_changed_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Room` ADD CONSTRAINT `fk_room_damage_reported_by` FOREIGN KEY (`damage_reported_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Room` ADD CONSTRAINT `room_ibfk_1` FOREIGN KEY (`room_type_id`) REFERENCES `RoomType` (`room_type_id`);

ALTER TABLE `RoomAssignment` ADD CONSTRAINT `roomassignment_ibfk_1` FOREIGN KEY (`booking_room_id`) REFERENCES `BookingRoom` (`booking_room_id`);

ALTER TABLE `RoomAssignment` ADD CONSTRAINT `roomassignment_ibfk_2` FOREIGN KEY (`room_id`) REFERENCES `Room` (`room_id`);

ALTER TABLE `RoomAssignment` ADD CONSTRAINT `roomassignment_ibfk_3` FOREIGN KEY (`assigned_by`) REFERENCES `Employee` (`employee_id`);

ALTER TABLE `RoomAssignment` ADD CONSTRAINT `roomassignment_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `Employee` (`employee_id`);

ALTER TABLE `RoomEvent` ADD CONSTRAINT `fk_room_event_booking_room` FOREIGN KEY (`booking_room_id`) REFERENCES `BookingRoom` (`booking_room_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RoomEvent` ADD CONSTRAINT `fk_room_event_employee` FOREIGN KEY (`employee_id`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RoomEvent` ADD CONSTRAINT `fk_room_event_related_event` FOREIGN KEY (`related_event_id`) REFERENCES `RoomEvent` (`room_event_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `RoomEvent` ADD CONSTRAINT `fk_room_event_room` FOREIGN KEY (`room_id`) REFERENCES `Room` (`room_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `ServiceUsage` ADD CONSTRAINT `serviceusage_ibfk_1` FOREIGN KEY (`booking_service_id`) REFERENCES `BookingService` (`booking_service_id`);

ALTER TABLE `ServiceUsage` ADD CONSTRAINT `serviceusage_ibfk_2` FOREIGN KEY (`booking_room_id`) REFERENCES `BookingRoom` (`booking_room_id`);

ALTER TABLE `TourReservation` ADD CONSTRAINT `fk_tour_reservation_round` FOREIGN KEY (`tour_round_id`) REFERENCES `TourRound` (`tour_round_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `TourReservation` ADD CONSTRAINT `tourreservation_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`);

ALTER TABLE `TourReservation` ADD CONSTRAINT `tourreservation_ibfk_2` FOREIGN KEY (`recorded_by`) REFERENCES `Employee` (`employee_id`);

ALTER TABLE `TourRound` ADD CONSTRAINT `fk_tour_round_created_by` FOREIGN KEY (`created_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `TourRound` ADD CONSTRAINT `fk_tour_round_service` FOREIGN KEY (`service_id`) REFERENCES `Service` (`service_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
