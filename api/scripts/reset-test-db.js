import { config as loadEnvironment } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(API_ROOT, "..");

export function validateTestDatabase(database) {
  if (!database?.endsWith("_test")) {
    throw new Error("Test database name must end with _test");
  }
}

export function configFromEnvironment(env = process.env) {
  const names = [
    "TEST_DB_HOST",
    "TEST_DB_USER",
    "TEST_DB_PASSWORD",
    "TEST_DB_NAME"
  ];
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing test database configuration: ${missing.join(", ")}`);
  }

  validateTestDatabase(env.TEST_DB_NAME);
  return {
    host: env.TEST_DB_HOST,
    port: Number(env.TEST_DB_PORT || 3306),
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    database: env.TEST_DB_NAME
  };
}

export async function resetTestDatabase(config = configFromEnvironment()) {
  validateTestDatabase(config.database);
  const connection = await mysql.createConnection({
    ...config,
    multipleStatements: true
  });

  try {
    const [tables] = await connection.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `);
    const dropTables = tables.length === 0
      ? ""
      : `DROP TABLE IF EXISTS ${tables.map(({ TABLE_NAME }) => escapeIdentifier(TABLE_NAME)).join(", ")};`;
    const [schemaSql, seedSql] = await Promise.all([
      readFile(path.join(REPOSITORY_ROOT, "database", "schema.sql"), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, "database", "seed.sql"), "utf8")
    ]);

    await connection.query(`
      SET FOREIGN_KEY_CHECKS = 0;
      ${dropTables}
      SET FOREIGN_KEY_CHECKS = 1;
      ${schemaSql}
      ${seedSql}
    `);

    const [[tableCount]] = await connection.query(`
      SELECT COUNT(*) AS count
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `);
    const [[roomTypeCount]] = await connection.query("SELECT COUNT(*) AS count FROM RoomType");
    const [[roomCount]] = await connection.query("SELECT COUNT(*) AS count FROM Room");
    const [[serviceCount]] = await connection.query("SELECT COUNT(*) AS count FROM Service");

    const result = {
      database: config.database,
      tables: Number(tableCount.count),
      roomTypes: Number(roomTypeCount.count),
      rooms: Number(roomCount.count),
      services: Number(serviceCount.count)
    };
    validateResetResult(result);
    return result;
  } finally {
    await connection.end();
  }
}

export function validateResetResult(result) {
  const expected = { tables: 19, roomTypes: 4, rooms: 800, services: 7 };
  const matches = Object.entries(expected)
    .every(([key, value]) => result[key] === value);
  if (!matches) {
    throw new Error(
      `Unexpected test database inventory: ${JSON.stringify(result)}`
    );
  }
}

function escapeIdentifier(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

async function main() {
  loadEnvironment({ path: path.join(API_ROOT, ".env.test") });
  const result = await resetTestDatabase();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

