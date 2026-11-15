SET @room_pair_ddl = (SELECT IF(COUNT(*) > 0, 'SELECT 1', 'ALTER TABLE booking_rooms ADD UNIQUE KEY booking_room_booking_pair (id, booking_id)') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'booking_rooms' AND index_name = 'booking_room_booking_pair');
PREPARE room_pair_stmt FROM @room_pair_ddl;
EXECUTE room_pair_stmt;
DEALLOCATE PREPARE room_pair_stmt;
SET @service_pair_ddl = (SELECT IF(COUNT(*) > 0, 'SELECT 1', 'ALTER TABLE booking_services ADD CONSTRAINT service_room_booking_fk FOREIGN KEY (booking_room_id, booking_id) REFERENCES booking_rooms (id, booking_id)') FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'booking_services' AND constraint_name = 'service_room_booking_fk');
PREPARE service_pair_stmt FROM @service_pair_ddl;
EXECUTE service_pair_stmt;
DEALLOCATE PREPARE service_pair_stmt;
UPDATE booking_services s JOIN (SELECT s1.id AS service_id, MIN(br.id) AS room_id FROM booking_services s1 JOIN bookings b ON b.id=s1.booking_id JOIN JSON_TABLE(b.price_snapshot, '$.rooms[*]' COLUMNS (type_id BIGINT PATH '$.typeId', breakfast_price INT PATH '$.breakfastPrice')) snap ON snap.breakfast_price=s1.unit_price JOIN booking_rooms br ON br.booking_id=b.id AND br.type_id=snap.type_id WHERE s1.booking_room_id IS NULL AND s1.created_by IS NULL AND s1.kind='breakfast' AND s1.quantity=1 AND (SELECT COUNT(*) FROM booking_services s2 WHERE s2.booking_id=s1.booking_id AND s2.kind='breakfast' AND s2.service_date=s1.service_date AND s2.unit_price=s1.unit_price AND s2.quantity=1)=1 GROUP BY s1.id HAVING COUNT(*)=1) matched ON matched.service_id=s.id SET s.booking_room_id=matched.room_id WHERE s.booking_room_id IS NULL;
