INSERT INTO RoomType
    (room_type_id, type_name, capacity, price_per_night, breakfast_daily_rate)
VALUES
    (1, 'Standard Room', 2, 1000.00, 350.00),
    (2, 'Deluxe Room', 2, 2000.00, 350.00),
    (3, 'Superior Room', 3, 1500.00, 350.00),
    (4, 'Family Room', 6, 4500.00, 500.00);

INSERT INTO Room (room_type_id, room_code, current_status)
WITH RECURSIVE room_numbers AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1 FROM room_numbers WHERE n < 300
),
room_ranges AS (
    SELECT 1 AS room_type_id, 'Std' AS prefix, 300 AS room_count
    UNION ALL SELECT 2, 'Dlx', 250
    UNION ALL SELECT 3, 'Sup', 150
    UNION ALL SELECT 4, 'Fam', 100
)
SELECT room_type_id, CONCAT(prefix, LPAD(n, 3, '0')), 'AVAILABLE'
FROM room_ranges
JOIN room_numbers ON n <= room_count;

INSERT INTO Service
    (service_id, name, service_kind, charge_unit, default_rate,
     included_in_room, active, description, schedule_json)
VALUES
    (1, 'อาหารเช้า', 'BREAKFAST', 'PER_ROOM_PER_DAY', 0.00, FALSE, TRUE,
     'Breakfast add-on; rate is snapshotted from the selected room type', NULL),
    (2, 'สระว่ายน้ำ', 'POOL', 'INCLUDED', 0.00, TRUE, TRUE,
     'Hotel swimming pool', NULL),
    (3, 'ฟิตเนส', 'FITNESS', 'PER_PERSON_PER_ROUND', 500.00, FALSE, TRUE,
     'Fitness access charged per person per round',
     JSON_OBJECT('times', JSON_ARRAY('07:00', '09:00', '12:00', '15:00', '18:00', '20:30'), 'capacity', 40)),
    (4, 'ซาวน่า', 'SAUNA', 'PER_PERSON_PER_ROUND', 300.00, FALSE, TRUE,
     'Sauna access charged per person per round',
     JSON_OBJECT('times', JSON_ARRAY('07:00', '12:00', '17:30', '18:30', '19:30', '20:30'))),
    (5, 'เที่ยวตลาดกลางคืน', 'TOUR', 'PER_PERSON_PER_ROUND', 0.00, FALSE, TRUE,
     'Free night-market shuttle',
     JSON_OBJECT('location', 'ตลาดกลางคืน', 'times', JSON_ARRAY('19:30', '20:00', '20:30'), 'capacity', 10)),
    (6, 'ชมพระอาทิตย์ตก - เกาะสวรรค์', 'TOUR', 'PER_PERSON_PER_ROUND', 0.00, FALSE, TRUE,
     'Free sunset shuttle to Paradise Island',
     JSON_OBJECT('location', 'เกาะสวรรค์', 'times', JSON_ARRAY('15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'), 'capacity', 10)),
    (7, 'ชมพระอาทิตย์ตก - ริมชายหาด', 'TOUR', 'PER_PERSON_PER_ROUND', 0.00, FALSE, TRUE,
     'Free sunset shuttle to the beach',
     JSON_OBJECT('location', 'ริมชายหาด', 'times', JSON_ARRAY('15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'), 'capacity', 10));

