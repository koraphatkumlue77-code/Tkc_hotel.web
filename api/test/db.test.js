import assert from "node:assert/strict";
import test from "node:test";

import { checkDatabase, createDatabasePool } from "../db.js";

test("createDatabasePool rejects missing database configuration", () => {
  assert.throws(
    () => createDatabasePool({}),
    /Missing required database configuration: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME/
  );
});

test("createDatabasePool rejects invalid numeric connection settings", () => {
  const env = {
    DB_HOST: "127.0.0.1",
    DB_USER: "test",
    DB_PASSWORD: "test",
    DB_NAME: "tkc_hotel_test"
  };

  assert.throws(() => createDatabasePool({ ...env, DB_PORT: "nope" }), /DB_PORT/);
  assert.throws(() => createDatabasePool({ ...env, DB_PORT: "70000" }), /DB_PORT/);
  assert.throws(
    () => createDatabasePool({ ...env, DB_CONNECTION_LIMIT: "0" }),
    /DB_CONNECTION_LIMIT/
  );
});

test("checkDatabase performs a read-only connectivity query", async () => {
  let receivedSql;
  const pool = {
    async query(sql) {
      receivedSql = sql;
      return [[{ ok: 1 }], []];
    }
  };

  await checkDatabase(pool);

  assert.equal(receivedSql, "SELECT 1 AS ok");
});
