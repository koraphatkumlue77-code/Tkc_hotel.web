-- แสดงข้อมูลทั้งหมดในทุกตารางของฐานข้อมูล TKC Hotel
-- ใช้กับฐาน tkc_hotel_dev ตาม api/scripts/preflight-plan-b.js
-- ไฟล์นี้เป็นคำสั่งอ่านข้อมูลเท่านั้น ไม่แก้ไขข้อมูล
USE `tkc_hotel_dev`;

SELECT * FROM `Customer`;
SELECT * FROM `Employee`;
SELECT * FROM `RoomType`;
SELECT * FROM `Room`;
SELECT * FROM `Service`;
SELECT * FROM `Promotion`;
SELECT * FROM `TourRound`;
SELECT * FROM `Booking`;
SELECT * FROM `BookingRoom`;
SELECT * FROM `BookingPromotion`;
SELECT * FROM `BookingService`;
SELECT * FROM `ServiceUsage`;
SELECT * FROM `TourReservation`;
SELECT * FROM `RoomAssignment`;
SELECT * FROM `RoomEvent`;
SELECT * FROM `Payment`;
SELECT * FROM `Review`;
SELECT * FROM `ChatMessage`;
SELECT * FROM `AuditLog`;
