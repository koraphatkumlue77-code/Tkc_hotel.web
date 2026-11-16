import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBackupSpec,
  validateBackupSql,
  validateDevelopmentDatabase
} from "../scripts/backup-database.js";

const config = Object.freeze({
  host: "127.0.0.1",
  port: 3306,
  user: "tkc_api",
  password: "not-for-argv",
  database: "tkc_hotel_dev"
});

test("backup spec uses transaction-safe mysqldump flags", () => {
  const spec = buildBackupSpec(config, "20261115T120000Z", "fixed-id");

  assert.ok(spec.args.includes("--single-transaction"));
  assert.ok(spec.args.includes("--skip-lock-tables"));
  assert.ok(spec.args.includes("--no-tablespaces"));
  assert.ok(spec.args.includes("--skip-triggers"));
  assert.ok(spec.args.includes("--set-gtid-purged=OFF"));
  assert.equal(spec.args.at(-1), "tkc_hotel_dev");
  assert.match(spec.outputPath, /database\/backups\/tkc_hotel_dev-20261115T120000Z-fixed-id\.sql$/);
});

test("backup spec keeps the password out of process arguments", () => {
  const spec = buildBackupSpec(config, "20261115T120000Z", "fixed-id");

  assert.equal(spec.args.some((value) => value.includes(config.password)), false);
  assert.equal(spec.env.MYSQL_PWD, config.password);
});

test("backup rejects any target other than the development database", () => {
  assert.throws(
    () => validateDevelopmentDatabase("tkc_hotel_test"),
    /Backup target must be tkc_hotel_dev/
  );
  assert.throws(
    () => validateDevelopmentDatabase("production"),
    /Backup target must be tkc_hotel_dev/
  );
});

test("backup validation rejects header-only or structurally incomplete dumps", () => {
  assert.throws(() => validateBackupSql("-- MySQL dump\n"), /incomplete/);

  const required = ["Customer", "Booking", "Room"]
    .map((name) => `CREATE TABLE \`${name}\` (id INT);`)
    .join("\n");
  assert.throws(() => validateBackupSql(required), /incomplete/);
});

test("backup validation requires the seeded room inventory data", () => {
  const tables = ["Customer", "Booking", "Room", "RoomType", "Employee", "Payment",
    "BookingRoom", "RoomAssignment", "Service", "BookingService", "ServiceUsage",
    "TourReservation"]
    .map((name) => `CREATE TABLE \`${name}\` (id INT);`)
    .join("\n");

  assert.throws(() => validateBackupSql(tables), /room inventory data/);
  assert.doesNotThrow(() => validateBackupSql(`${tables}\nINSERT INTO \`RoomType\` VALUES (1);\nINSERT INTO \`Room\` VALUES (1);`));
});
