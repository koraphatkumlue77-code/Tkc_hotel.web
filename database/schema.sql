-- MySQL dump 10.13  Distrib 26.7.0, for macos15 (arm64)
--
-- Host: 127.0.0.1    Database: tkc_hotel_dev
-- ------------------------------------------------------
-- Server version	26.7.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `AuditLog`
--

DROP TABLE IF EXISTS `AuditLog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AuditLog` (
  `audit_log_id` bigint NOT NULL AUTO_INCREMENT,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` bigint NOT NULL,
  `action` varchar(50) NOT NULL,
  `actor_type` enum('SYSTEM','CUSTOMER','EMPLOYEE') NOT NULL,
  `actor_customer_id` int DEFAULT NULL,
  `actor_employee_id` int DEFAULT NULL,
  `before_data` json DEFAULT NULL,
  `after_data` json DEFAULT NULL,
  `reason` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_log_id`),
  KEY `fk_audit_log_customer` (`actor_customer_id`),
  KEY `idx_audit_log_target` (`entity_type`,`entity_id`,`created_at`),
  KEY `idx_audit_log_employee` (`actor_employee_id`,`created_at`),
  CONSTRAINT `fk_audit_log_customer` FOREIGN KEY (`actor_customer_id`) REFERENCES `Customer` (`customer_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_audit_log_employee` FOREIGN KEY (`actor_employee_id`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_audit_log_actor` CHECK ((((`actor_type` = _utf8mb4'SYSTEM') and (`actor_customer_id` is null) and (`actor_employee_id` is null)) or ((`actor_type` = _utf8mb4'CUSTOMER') and (`actor_customer_id` is not null) and (`actor_employee_id` is null)) or ((`actor_type` = _utf8mb4'EMPLOYEE') and (`actor_customer_id` is null) and (`actor_employee_id` is not null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Booking`
--

DROP TABLE IF EXISTS `Booking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Booking` (
  `booking_id` int NOT NULL AUTO_INCREMENT,
  `booking_code` varchar(20) NOT NULL,
  `customer_id` int NOT NULL,
  `status` varchar(50) NOT NULL,
  `status_changed_at` timestamp NULL DEFAULT NULL,
  `status_changed_by` int DEFAULT NULL,
  `channel` varchar(20) DEFAULT NULL,
  `check_in_date` date NOT NULL,
  `check_out_date` date NOT NULL,
  `expected_arrival_at` timestamp NULL DEFAULT NULL,
  `hold_expires_at` timestamp NULL DEFAULT NULL,
  `proof_sent_at` timestamp NULL DEFAULT NULL,
  `deposit_rate` decimal(5,2) NOT NULL,
  `room_subtotal_snapshot` decimal(12,2) DEFAULT NULL,
  `service_subtotal_snapshot` decimal(12,2) DEFAULT NULL,
  `discount_total_snapshot` decimal(12,2) DEFAULT NULL,
  `total_snapshot` decimal(12,2) NOT NULL,
  `actual_check_in_at` timestamp NULL DEFAULT NULL,
  `actual_check_out_at` timestamp NULL DEFAULT NULL,
  `checked_in_by` int DEFAULT NULL,
  `checked_out_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`booking_id`),
  UNIQUE KEY `uq_booking_code` (`booking_code`),
  KEY `customer_id` (`customer_id`),
  KEY `fk_booking_status_changed_by` (`status_changed_by`),
  KEY `fk_booking_checked_in_by` (`checked_in_by`),
  KEY `fk_booking_checked_out_by` (`checked_out_by`),
  KEY `idx_booking_availability` (`status`,`check_in_date`,`check_out_date`,`hold_expires_at`),
  CONSTRAINT `booking_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `Customer` (`customer_id`),
  CONSTRAINT `fk_booking_checked_in_by` FOREIGN KEY (`checked_in_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_booking_checked_out_by` FOREIGN KEY (`checked_out_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_booking_status_changed_by` FOREIGN KEY (`status_changed_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_booking_date_range` CHECK ((`check_out_date` > `check_in_date`)),
  CONSTRAINT `chk_booking_snapshot_amounts` CHECK (((`total_snapshot` >= 0) and (((`room_subtotal_snapshot` is null) and (`service_subtotal_snapshot` is null) and (`discount_total_snapshot` is null)) or ((`room_subtotal_snapshot` is not null) and (`service_subtotal_snapshot` is not null) and (`discount_total_snapshot` is not null) and (`room_subtotal_snapshot` >= 0) and (`service_subtotal_snapshot` >= 0) and (`discount_total_snapshot` >= 0)))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BookingPromotion`
--

DROP TABLE IF EXISTS `BookingPromotion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BookingPromotion` (
  `booking_promotion_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `promotion_id` int NOT NULL,
  `sequence_no` int NOT NULL,
  `percent_snapshot` decimal(5,2) NOT NULL,
  `base_amount_before` decimal(12,2) NOT NULL,
  `discount_amount` decimal(12,2) NOT NULL,
  `base_amount_after` decimal(12,2) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`booking_promotion_id`),
  UNIQUE KEY `uq_booking_promotion` (`booking_id`,`promotion_id`),
  UNIQUE KEY `uq_booking_promotion_sequence` (`booking_id`,`sequence_no`),
  KEY `fk_booking_promotion_promotion` (`promotion_id`),
  CONSTRAINT `fk_booking_promotion_booking` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_booking_promotion_promotion` FOREIGN KEY (`promotion_id`) REFERENCES `Promotion` (`promotion_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_booking_promotion_amounts` CHECK (((`base_amount_before` >= 0) and (`discount_amount` >= 0) and (`base_amount_after` >= 0) and (`base_amount_after` = (`base_amount_before` - `discount_amount`)))),
  CONSTRAINT `chk_booking_promotion_percent` CHECK (((`percent_snapshot` > 0) and (`percent_snapshot` <= 100))),
  CONSTRAINT `chk_booking_promotion_sequence` CHECK ((`sequence_no` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BookingRoom`
--

DROP TABLE IF EXISTS `BookingRoom`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BookingRoom` (
  `booking_room_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `room_type_id` int NOT NULL,
  `guest_count` int NOT NULL,
  `nightly_rate_snapshot` decimal(12,2) NOT NULL,
  `net_amount` decimal(12,2) NOT NULL,
  PRIMARY KEY (`booking_room_id`),
  KEY `booking_id` (`booking_id`),
  KEY `room_type_id` (`room_type_id`),
  CONSTRAINT `bookingroom_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`),
  CONSTRAINT `bookingroom_ibfk_2` FOREIGN KEY (`room_type_id`) REFERENCES `RoomType` (`room_type_id`),
  CONSTRAINT `chk_booking_room_values` CHECK (((`guest_count` > 0) and (`nightly_rate_snapshot` >= 0) and (`net_amount` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `BookingService`
--

DROP TABLE IF EXISTS `BookingService`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `BookingService` (
  `booking_service_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `service_id` int NOT NULL,
  `added_by` int DEFAULT NULL,
  `selected_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` varchar(30) NOT NULL DEFAULT 'SELECTED',
  PRIMARY KEY (`booking_service_id`),
  KEY `service_type` (`service_id`),
  KEY `added_by` (`added_by`),
  KEY `idx_booking_service_booking_status` (`booking_id`,`status`,`service_id`),
  CONSTRAINT `bookingservice_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`),
  CONSTRAINT `bookingservice_ibfk_2` FOREIGN KEY (`service_id`) REFERENCES `Service` (`service_id`),
  CONSTRAINT `bookingservice_ibfk_3` FOREIGN KEY (`added_by`) REFERENCES `Employee` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ChatMessage`
--

DROP TABLE IF EXISTS `ChatMessage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ChatMessage` (
  `message_id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `sender_type` enum('CUSTOMER','EMPLOYEE') NOT NULL,
  `sender_employee_id` int DEFAULT NULL,
  `message_text` text NOT NULL,
  `sent_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`message_id`),
  KEY `fk_chat_message_employee` (`sender_employee_id`),
  KEY `idx_chat_message_customer_time` (`customer_id`,`sent_at`),
  CONSTRAINT `fk_chat_message_customer` FOREIGN KEY (`customer_id`) REFERENCES `Customer` (`customer_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_chat_message_employee` FOREIGN KEY (`sender_employee_id`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_chat_message_sender` CHECK ((((`sender_type` = _utf8mb4'CUSTOMER') and (`sender_employee_id` is null)) or ((`sender_type` = _utf8mb4'EMPLOYEE') and (`sender_employee_id` is not null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Customer`
--

DROP TABLE IF EXISTS `Customer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Customer` (
  `customer_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL COMMENT 'Legacy account reference; API Plan B does not use this column',
  `full_name` varchar(150) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(20) NOT NULL,
  `identity_type` varchar(20) NOT NULL,
  `identity_number` varchar(30) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `member_status` enum('WALK_IN','ACTIVE','SUSPENDED') NOT NULL DEFAULT 'WALK_IN',
  `registered_at` timestamp NULL DEFAULT NULL,
  `last_login_at` timestamp NULL DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`customer_id`),
  UNIQUE KEY `uq_customer_email` (`email`),
  CONSTRAINT `chk_customer_member_credentials` CHECK (((`member_status` = _utf8mb4'WALK_IN') or ((`email` is not null) and (`password_hash` is not null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Employee`
--

DROP TABLE IF EXISTS `Employee`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Employee` (
  `employee_id` int NOT NULL AUTO_INCREMENT,
  `department_name` varchar(100) NOT NULL,
  `role_name` varchar(100) NOT NULL,
  `name` varchar(150) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`employee_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Payment`
--

DROP TABLE IF EXISTS `Payment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Payment` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `related_payment_id` int DEFAULT NULL,
  `booking_id` int NOT NULL,
  `transaction_type` enum('PAYMENT','DEPOSIT','BALANCE','FULL_PAYMENT','SERVICE_PAYMENT','REFUND_REQUEST','REFUND_PAYOUT') NOT NULL DEFAULT 'PAYMENT',
  `direction` enum('IN','OUT','NONE') NOT NULL DEFAULT 'IN',
  `verified_by` int DEFAULT NULL,
  `method` varchar(30) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `status` varchar(30) NOT NULL,
  `proof_reference` varchar(500) DEFAULT NULL,
  `submitted_at` timestamp NOT NULL,
  `auto_check_result` text,
  `verified_at` timestamp NULL DEFAULT NULL,
  `requested_by` int DEFAULT NULL,
  `requested_at` timestamp NULL DEFAULT NULL,
  `request_reason` text,
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `processed_by` int DEFAULT NULL,
  `processed_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` varchar(250) DEFAULT NULL,
  `idempotency_key` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uq_payment_idempotency_key` (`idempotency_key`),
  KEY `verified_by` (`verified_by`),
  KEY `fk_payment_related_payment` (`related_payment_id`),
  KEY `fk_payment_requested_by` (`requested_by`),
  KEY `fk_payment_approved_by` (`approved_by`),
  KEY `fk_payment_processed_by` (`processed_by`),
  KEY `idx_payment_booking_status` (`booking_id`,`status`,`transaction_type`),
  CONSTRAINT `fk_payment_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payment_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payment_related_payment` FOREIGN KEY (`related_payment_id`) REFERENCES `Payment` (`payment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payment_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `payment_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`),
  CONSTRAINT `payment_ibfk_2` FOREIGN KEY (`verified_by`) REFERENCES `Employee` (`employee_id`),
  CONSTRAINT `chk_payment_amount_positive` CHECK ((`amount` > 0)),
  CONSTRAINT `chk_payment_direction` CHECK ((((`transaction_type` = _utf8mb4'REFUND_REQUEST') and (`direction` = _utf8mb4'NONE')) or ((`transaction_type` = _utf8mb4'REFUND_PAYOUT') and (`direction` = _utf8mb4'OUT')) or ((`transaction_type` not in (_utf8mb4'REFUND_REQUEST',_utf8mb4'REFUND_PAYOUT')) and (`direction` = _utf8mb4'IN')))),
  CONSTRAINT `chk_payment_method` CHECK (((`transaction_type` = _utf8mb4'REFUND_REQUEST') or (`method` is not null))),
  CONSTRAINT `chk_payment_refund_reference` CHECK (((`transaction_type` not in (_utf8mb4'REFUND_REQUEST',_utf8mb4'REFUND_PAYOUT')) or (`related_payment_id` is not null))),
  CONSTRAINT `chk_payment_refund_request` CHECK (((`transaction_type` <> _utf8mb4'REFUND_REQUEST') or ((`requested_by` is not null) and (`requested_at` is not null) and (`request_reason` is not null) and (`method` is null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Promotion`
--

DROP TABLE IF EXISTS `Promotion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Promotion` (
  `promotion_id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `discount_percent` decimal(5,2) NOT NULL,
  `priority` int NOT NULL DEFAULT '0',
  `valid_from` timestamp NULL DEFAULT NULL,
  `valid_until` timestamp NULL DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`promotion_id`),
  UNIQUE KEY `uq_promotion_code` (`code`),
  KEY `fk_promotion_created_by` (`created_by`),
  CONSTRAINT `fk_promotion_created_by` FOREIGN KEY (`created_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_promotion_percent` CHECK (((`discount_percent` > 0) and (`discount_percent` <= 100))),
  CONSTRAINT `chk_promotion_period` CHECK (((`valid_until` is null) or (`valid_from` is null) or (`valid_until` > `valid_from`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Review`
--

DROP TABLE IF EXISTS `Review`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Review` (
  `review_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `rating` tinyint NOT NULL,
  `content` text NOT NULL,
  `status` enum('PUBLISHED','HIDDEN') NOT NULL DEFAULT 'PUBLISHED',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `hidden_by` int DEFAULT NULL,
  `hidden_at` timestamp NULL DEFAULT NULL,
  `hidden_reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`review_id`),
  KEY `fk_review_hidden_by` (`hidden_by`),
  KEY `idx_review_booking_status` (`booking_id`,`status`,`created_at`),
  CONSTRAINT `fk_review_booking` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_review_hidden_by` FOREIGN KEY (`hidden_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_review_hidden_metadata` CHECK (((`status` = _utf8mb4'PUBLISHED') or ((`hidden_at` is not null) and (`hidden_reason` is not null)))),
  CONSTRAINT `chk_review_rating` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Room`
--

DROP TABLE IF EXISTS `Room`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Room` (
  `room_id` int NOT NULL AUTO_INCREMENT,
  `room_type_id` int NOT NULL,
  `room_code` varchar(20) NOT NULL,
  `current_status` varchar(100) NOT NULL DEFAULT 'AVAILABLE',
  `status_changed_at` timestamp NULL DEFAULT NULL,
  `status_changed_by` int DEFAULT NULL,
  `status_reason` varchar(250) DEFAULT NULL,
  `status_version` int NOT NULL DEFAULT '0',
  `area` varchar(100) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`room_id`),
  UNIQUE KEY `room_code` (`room_code`),
  KEY `fk_room_status_changed_by` (`status_changed_by`),
  KEY `idx_room_type_status` (`room_type_id`,`current_status`),
  CONSTRAINT `fk_room_status_changed_by` FOREIGN KEY (`status_changed_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `room_ibfk_1` FOREIGN KEY (`room_type_id`) REFERENCES `RoomType` (`room_type_id`),
  CONSTRAINT `chk_room_current_status` CHECK ((`current_status` in (_utf8mb4'AVAILABLE',_utf8mb4'OCCUPIED',_utf8mb4'NEEDS_CLEANING',_utf8mb4'OUT_OF_SERVICE'))),
  CONSTRAINT `chk_room_status_version` CHECK ((`status_version` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `RoomAssignment`
--

DROP TABLE IF EXISTS `RoomAssignment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `RoomAssignment` (
  `assignment_id` int NOT NULL AUTO_INCREMENT,
  `booking_room_id` int NOT NULL,
  `room_id` int NOT NULL,
  `assigned_by` int NOT NULL,
  `approved_by` int DEFAULT NULL,
  `effective_from` timestamp NOT NULL,
  `effective_to` timestamp NULL DEFAULT NULL,
  `reason` text,
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`assignment_id`),
  KEY `booking_room_id` (`booking_room_id`),
  KEY `room_id` (`room_id`),
  KEY `assigned_by` (`assigned_by`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `roomassignment_ibfk_1` FOREIGN KEY (`booking_room_id`) REFERENCES `BookingRoom` (`booking_room_id`),
  CONSTRAINT `roomassignment_ibfk_2` FOREIGN KEY (`room_id`) REFERENCES `Room` (`room_id`),
  CONSTRAINT `roomassignment_ibfk_3` FOREIGN KEY (`assigned_by`) REFERENCES `Employee` (`employee_id`),
  CONSTRAINT `roomassignment_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `Employee` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `RoomEvent`
--

DROP TABLE IF EXISTS `RoomEvent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `RoomEvent` (
  `room_event_id` int NOT NULL AUTO_INCREMENT,
  `room_id` int NOT NULL,
  `booking_room_id` int DEFAULT NULL,
  `event_type` enum('CLEANING_QUEUED','CLEANING_STARTED','CLEANING_COMPLETED','DAMAGE_REPORTED','DAMAGE_REVIEWED','DAMAGE_RESOLVED','ROOM_CLOSED','ROOM_REOPENED') NOT NULL,
  `status` varchar(30) DEFAULT NULL,
  `employee_id` int DEFAULT NULL,
  `related_event_id` int DEFAULT NULL,
  `item` varchar(150) DEFAULT NULL,
  `description` text,
  `photo_reference` varchar(500) DEFAULT NULL,
  `reason` text,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `effective_from` timestamp NULL DEFAULT NULL,
  `effective_to` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`room_event_id`),
  KEY `fk_room_event_booking_room` (`booking_room_id`),
  KEY `fk_room_event_employee` (`employee_id`),
  KEY `fk_room_event_related_event` (`related_event_id`),
  KEY `idx_room_event_room_created` (`room_id`,`created_at`,`event_type`),
  CONSTRAINT `fk_room_event_booking_room` FOREIGN KEY (`booking_room_id`) REFERENCES `BookingRoom` (`booking_room_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_room_event_employee` FOREIGN KEY (`employee_id`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_room_event_related_event` FOREIGN KEY (`related_event_id`) REFERENCES `RoomEvent` (`room_event_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_room_event_room` FOREIGN KEY (`room_id`) REFERENCES `Room` (`room_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_room_event_period` CHECK (((`effective_to` is null) or (`effective_from` is null) or (`effective_to` > `effective_from`))),
  CONSTRAINT `chk_room_event_times` CHECK (((`completed_at` is null) or (`started_at` is null) or (`completed_at` >= `started_at`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `RoomType`
--

DROP TABLE IF EXISTS `RoomType`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `RoomType` (
  `room_type_id` int NOT NULL AUTO_INCREMENT,
  `type_name` varchar(50) NOT NULL,
  `capacity` int NOT NULL,
  `price_per_night` decimal(12,2) NOT NULL,
  `breakfast_daily_rate` decimal(12,2) NOT NULL,
  PRIMARY KEY (`room_type_id`),
  CONSTRAINT `chk_room_type_values` CHECK (((`capacity` > 0) and (`price_per_night` >= 0) and (`breakfast_daily_rate` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Service`
--

DROP TABLE IF EXISTS `Service`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Service` (
  `service_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `service_kind` enum('OTHER','BREAKFAST','FITNESS','SAUNA','POOL','TOUR','ATTRACTION') NOT NULL DEFAULT 'OTHER',
  `description` text,
  `image_reference` varchar(500) DEFAULT NULL,
  `season` varchar(30) DEFAULT NULL,
  `visible` tinyint(1) NOT NULL DEFAULT '1',
  `schedule_json` json DEFAULT NULL,
  `charge_unit` varchar(30) NOT NULL,
  `default_rate` decimal(12,2) NOT NULL,
  `included_in_room` tinyint(1) NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`service_id`),
  UNIQUE KEY `uq_service_name` (`name`),
  CONSTRAINT `chk_service_rate_non_negative` CHECK ((`default_rate` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ServiceUsage`
--

DROP TABLE IF EXISTS `ServiceUsage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ServiceUsage` (
  `service_usage_id` int NOT NULL AUTO_INCREMENT,
  `booking_service_id` int NOT NULL,
  `booking_room_id` int NOT NULL,
  `usage_date` date DEFAULT NULL,
  `unit_price_snapshot` decimal(12,2) NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `status` varchar(30) NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`service_usage_id`),
  KEY `booking_service_id` (`booking_service_id`),
  KEY `booking_room_id` (`booking_room_id`),
  CONSTRAINT `serviceusage_ibfk_1` FOREIGN KEY (`booking_service_id`) REFERENCES `BookingService` (`booking_service_id`),
  CONSTRAINT `serviceusage_ibfk_2` FOREIGN KEY (`booking_room_id`) REFERENCES `BookingRoom` (`booking_room_id`),
  CONSTRAINT `chk_service_usage_values` CHECK (((`unit_price_snapshot` >= 0) and (`quantity` > 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `TourReservation`
--

DROP TABLE IF EXISTS `TourReservation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `TourReservation` (
  `tour_reservation_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `tour_round_id` int NOT NULL,
  `participant_code` varchar(100) NOT NULL,
  `participant_name` varchar(150) DEFAULT NULL,
  `usage_sequence_for_day` int NOT NULL DEFAULT '1',
  `unit_price_snapshot` decimal(12,2) NOT NULL DEFAULT '50.00',
  `recorded_by` int DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tour_reservation_id`),
  UNIQUE KEY `uq_tour_reservation_participant` (`booking_id`,`tour_round_id`,`participant_code`),
  KEY `recorded_by` (`recorded_by`),
  KEY `idx_tour_reservation_round_status` (`tour_round_id`,`status`),
  CONSTRAINT `fk_tour_reservation_round` FOREIGN KEY (`tour_round_id`) REFERENCES `TourRound` (`tour_round_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `tourreservation_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `Booking` (`booking_id`),
  CONSTRAINT `tourreservation_ibfk_2` FOREIGN KEY (`recorded_by`) REFERENCES `Employee` (`employee_id`),
  CONSTRAINT `chk_tour_unit_price` CHECK ((`unit_price_snapshot` >= 0)),
  CONSTRAINT `chk_tour_usage_sequence` CHECK ((`usage_sequence_for_day` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `TourRound`
--

DROP TABLE IF EXISTS `TourRound`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `TourRound` (
  `tour_round_id` int NOT NULL AUTO_INCREMENT,
  `service_id` int NOT NULL,
  `tour_date` date NOT NULL,
  `start_time` time NOT NULL,
  `capacity` int NOT NULL DEFAULT '10',
  `status` enum('OPEN','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tour_round_id`),
  UNIQUE KEY `uq_tour_round` (`service_id`,`tour_date`,`start_time`),
  KEY `fk_tour_round_created_by` (`created_by`),
  KEY `idx_tour_round_date_status` (`tour_date`,`status`,`start_time`),
  CONSTRAINT `fk_tour_round_created_by` FOREIGN KEY (`created_by`) REFERENCES `Employee` (`employee_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_tour_round_service` FOREIGN KEY (`service_id`) REFERENCES `Service` (`service_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_tour_round_capacity` CHECK ((`capacity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-15 23:44:40
