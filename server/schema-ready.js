const requiredMigration = "006_service_room_normalization.sql";
const guidance =
  "ฐานข้อมูลยังไม่พร้อมใช้งาน schema 006: หยุดแอปทั้งหมด สำรองข้อมูล แล้วรัน npm run db:migrate ก่อนเริ่มแอป";

export async function assertSchemaReady(database) {
  let row;
  try {
    [[row]] = await database.execute(
      "SELECT (SELECT COUNT(*) FROM migrations WHERE name=?) AS migrationApplied, (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='booking_service_rooms') AS linkTable, (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='booking_services' AND column_name='booking_room_id') AS legacyColumn, (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name IN ('service_room_validate_insert','service_room_validate_update','service_booking_immutable','room_booking_immutable')) AS triggerCount",
      [requiredMigration],
    );
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE")
      throw new Error(guidance, { cause: error });
    throw new Error(`ตรวจสอบฐานข้อมูลไม่สำเร็จ: ${error.message}`, {
      cause: error,
    });
  }
  if (
    Number(row.migrationApplied) !== 1 ||
    Number(row.linkTable) !== 1 ||
    Number(row.legacyColumn) !== 0 ||
    Number(row.triggerCount) !== 4
  )
    throw new Error(guidance);
}
