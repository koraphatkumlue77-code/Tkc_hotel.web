-- Expand-only migration for per-person facility rounds and fixed free tours.
-- Safe to rerun: the column add is guarded and catalog writes are upserts.

SET @add_start_time = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE ServiceUsage ADD COLUMN start_time TIME NULL AFTER usage_date',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ServiceUsage'
    AND column_name = 'start_time'
);
PREPARE facility_migration_statement FROM @add_start_time;
EXECUTE facility_migration_statement;
DEALLOCATE PREPARE facility_migration_statement;

UPDATE Service
SET charge_unit = 'PER_PERSON_PER_ROUND',
    default_rate = 500.00,
    description = 'Fitness access charged per person per round',
    schedule_json = JSON_OBJECT(
      'times', JSON_ARRAY('07:00', '09:00', '12:00', '15:00', '18:00', '20:30'),
      'capacity', 40
    ),
    visible = TRUE,
    active = TRUE
WHERE name = 'ฟิตเนส';

UPDATE Service
SET charge_unit = 'PER_PERSON_PER_ROUND',
    default_rate = 300.00,
    description = 'Sauna access charged per person per round',
    schedule_json = JSON_OBJECT(
      'times', JSON_ARRAY('07:00', '12:00', '17:30', '18:30', '19:30', '20:30')
    ),
    visible = TRUE,
    active = TRUE
WHERE name = 'ซาวน่า';

UPDATE Service
SET service_kind = 'TOUR',
    charge_unit = 'PER_PERSON_PER_ROUND',
    default_rate = 0.00,
    description = 'Free night-market shuttle',
    schedule_json = JSON_OBJECT(
      'location', 'ตลาดกลางคืน',
      'times', JSON_ARRAY('19:30', '20:00', '20:30'),
      'capacity', 10
    ),
    visible = TRUE,
    active = TRUE
WHERE name = 'เที่ยวตลาดกลางคืน';

INSERT INTO Service
  (name, service_kind, description, visible, schedule_json,
   charge_unit, default_rate, included_in_room, active)
SELECT
  'ชมพระอาทิตย์ตก - เกาะสวรรค์', 'TOUR', 'Free sunset shuttle to Paradise Island', TRUE,
  JSON_OBJECT(
    'location', 'เกาะสวรรค์',
    'times', JSON_ARRAY('15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'),
    'capacity', 10
  ),
  'PER_PERSON_PER_ROUND', 0.00, FALSE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM Service WHERE name = 'ชมพระอาทิตย์ตก - เกาะสวรรค์'
);

UPDATE Service
SET service_kind = 'TOUR', description = 'Free sunset shuttle to Paradise Island',
    visible = TRUE,
    schedule_json = JSON_OBJECT(
      'location', 'เกาะสวรรค์',
      'times', JSON_ARRAY('15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'),
      'capacity', 10
    ),
    charge_unit = 'PER_PERSON_PER_ROUND', default_rate = 0.00,
    included_in_room = FALSE, active = TRUE
WHERE name = 'ชมพระอาทิตย์ตก - เกาะสวรรค์';

INSERT INTO Service
  (name, service_kind, description, visible, schedule_json,
   charge_unit, default_rate, included_in_room, active)
SELECT
  'ชมพระอาทิตย์ตก - ริมชายหาด', 'TOUR', 'Free sunset shuttle to the beach', TRUE,
  JSON_OBJECT(
    'location', 'ริมชายหาด',
    'times', JSON_ARRAY('15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'),
    'capacity', 10
  ),
  'PER_PERSON_PER_ROUND', 0.00, FALSE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM Service WHERE name = 'ชมพระอาทิตย์ตก - ริมชายหาด'
);

UPDATE Service
SET service_kind = 'TOUR', description = 'Free sunset shuttle to the beach',
    visible = TRUE,
    schedule_json = JSON_OBJECT(
      'location', 'ริมชายหาด',
      'times', JSON_ARRAY('15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'),
      'capacity', 10
    ),
    charge_unit = 'PER_PERSON_PER_ROUND', default_rate = 0.00,
    included_in_room = FALSE, active = TRUE
WHERE name = 'ชมพระอาทิตย์ตก - ริมชายหาด';

