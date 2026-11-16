import jwt from "jsonwebtoken";

import { ApiError } from "../../middleware/errors.js";

export function createSessionTools(authConfig, authService) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure: authConfig.secureCookie,
    path: "/",
    maxAge: authConfig.tokenTtlSeconds * 1000
  };

  function issue(response, principal) {
    const token = jwt.sign(
      { type: principal.type },
      authConfig.secret,
      {
        algorithm: "HS256",
        subject: String(principal.id),
        issuer: "tkc-hotel-api",
        audience: "tkc-hotel-web",
        expiresIn: authConfig.tokenTtlSeconds
      }
    );
    response.cookie(authConfig.cookieName, token, cookieOptions);
  }

  function clear(response) {
    response.clearCookie(authConfig.cookieName, {
      httpOnly: true,
      sameSite: "strict",
      secure: authConfig.secureCookie,
      path: "/"
    });
  }

  async function authenticate(request, _response, next) {
    let payload;
    try {
      const token = parseCookies(request.get("cookie"))[authConfig.cookieName];
      if (!token) throw sessionError();
      payload = jwt.verify(token, authConfig.secret, {
        algorithms: ["HS256"],
        issuer: "tkc-hotel-api",
        audience: "tkc-hotel-web"
      });
      const id = Number(payload.sub);
      if (!Number.isSafeInteger(id) || id < 1) throw sessionError();
    } catch (error) {
      next(error instanceof ApiError ? error : sessionError());
      return;
    }

    try {
      const principal = await authService.loadPrincipal(payload.type, Number(payload.sub));
      if (!principal) {
        next(sessionError());
        return;
      }
      request.principal = principal;
      next();
    } catch (error) {
      next(error);
    }
  }

  return { issue, clear, authenticate };
}

export function requireRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles);
  return (request, _response, next) => {
    if (!request.principal) {
      next(sessionError());
      return;
    }
    if (!allowed.has(request.principal.role)) {
      next(new ApiError(403, "ROLE_FORBIDDEN", "Your role cannot perform this action"));
      return;
    }
    next();
  };
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const index = part.indexOf("=");
      if (index < 1) return [];
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      try {
        return [[key, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    })
  );
}

function sessionError() {
  return new ApiError(401, "SESSION_INVALID", "Authentication is required");
}
