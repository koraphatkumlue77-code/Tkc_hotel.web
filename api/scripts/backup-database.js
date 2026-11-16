import "dotenv/config";

import { createWriteStream } from "node:fs";
import { mkdir, readFile, link, rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const MYSQLDUMP_PATH = "/usr/local/mysql/bin/mysqldump";
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export function validateDevelopmentDatabase(database) {
  if (database !== "tkc_hotel_dev") {
    throw new Error("Backup target must be tkc_hotel_dev");
  }
}

export function buildBackupSpec(
  config,
  timestamp = createTimestamp(),
  uniqueId = randomUUID()
) {
  validateDevelopmentDatabase(config.database);

  return {
    command: MYSQLDUMP_PATH,
    args: [
      `--host=${config.host}`,
      `--port=${config.port}`,
      `--user=${config.user}`,
      "--single-transaction",
      "--skip-lock-tables",
      "--no-tablespaces",
      "--skip-triggers",
      "--set-gtid-purged=OFF",
      "--default-character-set=utf8mb4",
      config.database
    ],
    env: { ...process.env, MYSQL_PWD: config.password },
    outputPath: path.join(
      REPOSITORY_ROOT,
      "database",
      "backups",
      `tkc_hotel_dev-${timestamp}-${uniqueId}.sql`
    )
  };
}

export async function runBackup(config = configFromEnvironment()) {
  const spec = buildBackupSpec(config);
  await mkdir(path.dirname(spec.outputPath), { recursive: true });
  const temporaryPath = `${spec.outputPath}.partial-${process.pid}`;

  try {
    const output = createWriteStream(temporaryPath, { flags: "wx" });
    const child = spawn(spec.command, spec.args, {
      env: spec.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const exitPromise = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    const [exitCode] = await Promise.all([
      exitPromise,
      pipeline(child.stdout, output)
    ]);
    if (exitCode !== 0) {
      throw new Error(`Database backup failed: ${stderr.trim() || `exit ${exitCode}`}`);
    }

    const sqlText = await readFile(temporaryPath, "utf8");
    validateBackupSql(sqlText);
    await link(temporaryPath, spec.outputPath);
    await rm(temporaryPath);
    const backupStat = await stat(spec.outputPath);
    return { path: spec.outputPath, bytes: backupStat.size };
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function validateBackupSql(sqlText) {
  const createTables = [...sqlText.matchAll(/^CREATE TABLE `([^`]+)`/gm)]
    .map((match) => match[1]);
  const requiredTables = ["Customer", "Booking", "Room"];
  const hasRequiredTables = requiredTables.every((name) => createTables.includes(name));
  if (createTables.length < 12 || !hasRequiredTables) {
    throw new Error("Database backup failed: structurally incomplete dump");
  }
  const hasRoomTypeRows = /^INSERT INTO `RoomType`/m.test(sqlText);
  const hasRoomRows = /^INSERT INTO `Room`/m.test(sqlText);
  if (!hasRoomTypeRows || !hasRoomRows) {
    throw new Error("Database backup failed: missing seeded room inventory data");
  }
  if (/CREATE\s+USER|IDENTIFIED\s+BY|DB_PASSWORD\s*=/i.test(sqlText)) {
    throw new Error("Database backup failed: embedded credentials detected");
  }
}

function configFromEnvironment() {
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing database configuration: ${missing.join(", ")}`);
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  };
}

function createTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackup()
    .then((result) => {
      console.log(`Database backup created: ${result.path} (${result.bytes} bytes)`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
