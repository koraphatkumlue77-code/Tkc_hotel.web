import { createApp } from "./app.js";
import { pool } from "./db.js";
import { assertSchemaReady } from "./schema-ready.js";

const port = Number(process.env.PORT || 3000);
try {
  await assertSchemaReady(pool);
  createApp().listen(port, () =>
    console.log(`TKC Hotel: http://localhost:${port}`),
  );
} catch (error) {
  console.error(error.message);
  await pool.end();
  process.exitCode = 1;
}
