import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "../server/db.js";

const directory = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate() {
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [[lock]] = await connection.query(
      "SELECT GET_LOCK(CONCAT('tkc-migrate:', LEFT(SHA2(DATABASE(), 256), 40)), 30) AS acquired",
    );
    if (lock.acquired !== 1)
      throw new Error("Database migration lock unavailable");
    locked = true;
    await connection.query(
      "CREATE TABLE IF NOT EXISTS migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    );
    for (const name of (await readdir(directory))
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      const [seen] = await connection.execute(
        "SELECT name FROM migrations WHERE name = ?",
        [name],
      );
      if (seen.length) continue;
      const sql = await readFile(join(directory, name), "utf8");
      for (const statement of sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((x) => x.trim())
        .filter(Boolean))
        await connection.query(statement);
      await connection.execute("INSERT INTO migrations (name) VALUES (?)", [
        name,
      ]);
    }
  } finally {
    try {
      if (locked)
        await connection.query(
          "SELECT RELEASE_LOCK(CONCAT('tkc-migrate:', LEFT(SHA2(DATABASE(), 256), 40)))",
        );
    } finally {
      connection.release();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate().then(
    () => pool.end(),
    (error) => {
      console.error(error);
      process.exitCode = 1;
      pool.end();
    },
  );
}
