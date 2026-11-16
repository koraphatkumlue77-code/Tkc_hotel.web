import crypto from "node:crypto";

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function requestIdMiddleware(request, response, next) {
  const incoming = request.get("x-request-id");
  request.requestId = isSafeRequestId(incoming) ? incoming : crypto.randomUUID();
  response.set("x-request-id", request.requestId);
  next();
}

export function apiErrorHandler(error, request, response, _next) {
  if (error instanceof ApiError) {
    const body = {
      status: "error",
      code: error.code,
      message: error.message,
      requestId: request.requestId
    };
    if (error.details !== undefined) body.details = error.details;
    response.status(error.status).json(body);
    return;
  }

  if (error?.type === "entity.parse.failed") {
    response.status(400).json({
      status: "error",
      code: "INVALID_JSON",
      message: "Request body contains invalid JSON",
      requestId: request.requestId
    });
    return;
  }

  if (error?.type === "entity.too.large") {
    response.status(413).json({
      status: "error",
      code: "REQUEST_TOO_LARGE",
      message: "Request body is too large",
      requestId: request.requestId
    });
    return;
  }

  response.status(500).json({
    status: "error",
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    requestId: request.requestId
  });
}

function isSafeRequestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(value);
}
