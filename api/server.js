// จุดเริ่ม server: โหลด .env, สร้าง MySQL pool, ลงทะเบียน app และเสิร์ฟหน้าเว็บ/API
import "dotenv/config";

import { createApp } from "./app.js";
import { runtimeConfig } from "./config.js";
import { checkDatabase, createDatabasePool } from "./db.js";

const config = runtimeConfig();
const pool = createDatabasePool();
const app = createApp({
  checkDatabase: () => checkDatabase(pool),
  publicRoot: config.publicRoot,
  storageRoot: config.storageRoot,
  pool,
  authConfig: config.auth
});

app.listen(config.port, "127.0.0.1", () => {
  console.log(`TKC Hotel web and API running at http://localhost:${config.port}`);
});
