import { pool } from "../server/db.js";

export async function resetTestDatabase() {
  if (process.env.DB_NAME !== "tkc_hotel_test")
    throw new Error("Refusing to reset a non-test database");
  const connection = await pool.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    const [rows] = await connection.query("SHOW TABLES");
    for (const row of rows) {
      const name = Object.values(row)[0];
      if (!["sessions", "migrations"].includes(name))
        await connection.query(`DROP TABLE \`${name}\``);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
    await connection.query(
      "CREATE TABLE IF NOT EXISTS migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    );
    await connection.query("DELETE FROM migrations");
  } finally {
    connection.release();
  }
}
