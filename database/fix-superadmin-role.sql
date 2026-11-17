-- แก้ role ของบัญชี Super Admin ที่ปัจจุบันถูกบันทึกเป็น ACCOUNTING
-- ตรวจค่าเดิมก่อนแก้
SELECT employee_id, email, role_name, active
FROM Employee
WHERE email = 'superadmin@tkc-hotel.local';

START TRANSACTION;

UPDATE Employee
SET role_name = 'SUPERADMIN'
WHERE email = 'superadmin@tkc-hotel.local'
  AND role_name = 'ACCOUNTING';

-- ตรวจค่าหลังแก้ ก่อนกด COMMIT
SELECT employee_id, email, role_name, active
FROM Employee
WHERE email = 'superadmin@tkc-hotel.local';

-- ถ้าผลหลังแก้เป็น SUPERADMIN ให้ COMMIT;
-- ถ้าผลไม่ถูกต้อง ให้ ROLLBACK;
-- COMMIT;
-- ROLLBACK;
