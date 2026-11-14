import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || "tkc",
  password: process.env.DB_PASSWORD || "local_only_tkc",
  database: process.env.DB_NAME || "tkc_hotel",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: ["DATE"],
  timezone: "Z",
  decimalNumbers: true,
});

export async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
