import test from "node:test";
import assert from "node:assert/strict";
import { assertSchemaReady } from "../server/schema-ready.js";

const database = (row) => ({ execute: async () => [[row]] });
test("startup requires a completed 006 schema and all triggers", async () => {
  const ready = {
    migrationApplied: 1,
    linkTable: 1,
    legacyColumn: 0,
    triggerCount: 4,
  };
  await assertSchemaReady(database(ready));
  for (const partial of [
    { migrationApplied: 0 },
    { linkTable: 0 },
    { legacyColumn: 1 },
    { triggerCount: 3 },
  ])
    await assert.rejects(
      assertSchemaReady(database({ ...ready, ...partial })),
      /npm run db:migrate/,
    );
  await assert.rejects(
    assertSchemaReady({
      execute: async () => {
        const error = new Error("missing");
        error.code = "ER_NO_SUCH_TABLE";
        throw error;
      },
    }),
    /npm run db:migrate/,
  );
});
