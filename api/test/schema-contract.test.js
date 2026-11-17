import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { checkSchemaSql, EXPECTED_TABLES } from "../scripts/check-schema.js";

const schemaPath = new URL("../../database/Tkcdata.sql", import.meta.url);
const finalSchemaPath = new URL("../../database/schema.sql", import.meta.url);

test("canonical migration satisfies the complete schema contract", async () => {
  const sql = await readFile(schemaPath, "utf8");

  const result = checkSchemaSql(sql);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.tables, [...EXPECTED_TABLES].sort());
  assert.equal(result.planBMarkers.length, 14);
});

test("exported reset schema has the same 19-table contract", async () => {
  const sql = await readFile(finalSchemaPath, "utf8");
  const result = checkSchemaSql(sql);

  assert.deepEqual(result.tables, [...EXPECTED_TABLES].sort());
  assert.doesNotMatch(sql, /ENGINE=InnoDB AUTO_INCREMENT=\d+/);
});

test("schema contract reports missing tables and migration checks", () => {
  const sql = "CREATE TABLE Customer (customer_id INT PRIMARY KEY);";

  const result = checkSchemaSql(sql);

  assert.ok(result.errors.some((error) => error.includes("missing tables")));
  assert.ok(result.errors.some((error) => error.includes("PLAN B-01")));
  assert.ok(result.errors.some((error) => error.includes("PLAN B POSTCHECK")));
});

test("schema contract rejects credentials embedded in SQL", () => {
  const sql = "CREATE USER 'tkc_api'@'127.0.0.1' IDENTIFIED BY 'secret';";

  const result = checkSchemaSql(sql);

  assert.ok(result.errors.some((error) => error.includes("credential")));
});

test("schema contract rejects duplicate consecutive ORDER BY clauses", () => {
  const sql = `
    CREATE TABLE Customer (customer_id INT PRIMARY KEY);
    SELECT customer_id FROM Customer ORDER BY customer_id;
    ORDER BY customer_id;
  `;

  const result = checkSchemaSql(sql);

  assert.ok(result.errors.some((error) => error.includes("duplicate ORDER BY")));
});
