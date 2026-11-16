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
     included_in_room, active, description)
VALUES
    (1, 'อาหารเช้า', 'BREAKFAST', 'PER_ROOM_PER_DAY', 0.00, FALSE, TRUE,
     'Breakfast add-on; rate is snapshotted from the selected room type'),
    (2, 'สระว่ายน้ำ', 'POOL', 'INCLUDED', 0.00, TRUE, TRUE,
     'Hotel swimming pool'),
    (3, 'ฟิตเนส', 'FITNESS', 'PER_ROOM_PER_STAY', 500.00, FALSE, TRUE,
     'Fitness access per room per stay'),
    (4, 'ซาวน่า', 'SAUNA', 'PER_ROOM_PER_STAY', 300.00, FALSE, TRUE,
     'Sauna access per room per stay'),
    (5, 'เที่ยวตลาดกลางคืน', 'TOUR', 'PER_PERSON_PER_ROUND', 50.00, FALSE, TRUE,
     'Night Market tour; participant usage sequence controls pricing');

