export async function recordAudit(
  connection,
  {
    actorId = null,
    action,
    entity,
    entityId,
    before = null,
    after = null,
    reason = null,
  },
) {
  await connection.execute(
    "INSERT INTO audit_logs (actor_id, action, entity, entity_id, before_json, after_json, reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      actorId,
      action,
      entity,
      String(entityId),
      JSON.stringify(before),
      JSON.stringify(after),
      reason,
    ],
  );
}
