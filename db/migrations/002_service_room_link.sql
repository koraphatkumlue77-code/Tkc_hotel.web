SET @service_room_ddl = (SELECT IF(COUNT(*) > 0, 'SELECT 1', 'ALTER TABLE booking_services ADD COLUMN booking_room_id BIGINT NULL, ADD CONSTRAINT booking_services_room_fk FOREIGN KEY (booking_room_id) REFERENCES booking_rooms(id)') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'booking_services' AND column_name = 'booking_room_id');
PREPARE service_room_stmt FROM @service_room_ddl;
EXECUTE service_room_stmt;
DEALLOCATE PREPARE service_room_stmt;
UPDATE booking_services s JOIN (SELECT booking_id, MIN(id) AS room_id FROM booking_rooms GROUP BY booking_id HAVING COUNT(*) = 1) r ON r.booking_id = s.booking_id SET s.booking_room_id = r.room_id WHERE s.booking_room_id IS NULL AND s.kind IN ('breakfast', 'fitness', 'sauna');
