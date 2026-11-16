import { ApiError } from "./errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireSameOrigin(request, _response, next) {
  if (SAFE_METHODS.has(request.method)) {
    next();
    return;
  }

  const origin = request.get("origin");
  if (!origin) {
    next();
    return;
  }

  try {
    const parsed = new URL(origin);
    const expectedOrigin = `${request.protocol}://${request.get("host")}`;
    if (parsed.origin === expectedOrigin) {
      next();
      return;
    }
  } catch {
    // Invalid origins are rejected below.
  }

  next(new ApiError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed"));
}
