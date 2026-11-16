import path from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = path.dirname(fileURLToPath(import.meta.url));

export const REPOSITORY_ROOT = path.resolve(API_ROOT, "..");

export function runtimeConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const secret = env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("Missing required configuration: AUTH_SECRET");
  if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");

  const tokenTtlSeconds = parseIntegerSetting(
    env.AUTH_TOKEN_TTL_SECONDS || "3600",
    "AUTH_TOKEN_TTL_SECONDS",
    60,
    86400
  );
  const secureCookie = parseBooleanSetting(
    env.AUTH_COOKIE_SECURE || "false",
    "AUTH_COOKIE_SECURE"
  );

  return {
    port,
    publicRoot: REPOSITORY_ROOT,
    storageRoot: env.PAYMENT_STORAGE_ROOT?.trim()
      ? path.resolve(env.PAYMENT_STORAGE_ROOT.trim())
      : path.join(API_ROOT, "storage"),
    auth: {
      secret,
      tokenTtlSeconds,
      cookieName: "tkc_session",
      secureCookie
    }
  };
}

function parseBooleanSetting(value, name) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function parseIntegerSetting(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

