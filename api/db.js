// การเชื่อมต่อ MySQL ตั้งค่า DB_HOST/DB_USER/DB_PASSWORD/DB_NAME จาก api/.env ที่ createDatabasePool อ่าน
import mysql from "mysql2/promise";

const REQUIRED_DATABASE_VARIABLES = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME"
];

export function createDatabasePool(env = process.env) {
  const missingVariables = REQUIRED_DATABASE_VARIABLES.filter(
    (name) => !env[name]?.trim()
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required database configuration: ${missingVariables.join(", ")}`
    );
  }

  const port = parseIntegerSetting(env.DB_PORT || "3306", "DB_PORT", 1, 65535);
  const connectionLimit = parseIntegerSetting(
    env.DB_CONNECTION_LIMIT || "10",
    "DB_CONNECTION_LIMIT",
    1,
    1000
  );

  return mysql.createPool({
    host: env.DB_HOST,
    port,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
    enableKeepAlive: true
  });
}

function parseIntegerSetting(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

export async function checkDatabase(pool) {
  await pool.query("SELECT 1 AS ok");
}
