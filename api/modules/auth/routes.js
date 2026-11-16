import { Router } from "express";

import { AuthRepository } from "./repository.js";
import { AuthService } from "./service.js";
import { createSessionTools } from "./session.js";

export function createAuthModule({ pool, authConfig, bcryptCost }) {
  const repository = new AuthRepository(pool);
  const service = new AuthService(repository, { bcryptCost });
  const session = createSessionTools(authConfig, service);
  const router = Router();

  router.post("/register", asyncHandler(async (request, response) => {
    const principal = await service.register(request.body);
    session.issue(response, principal);
    response.status(201).json({ data: { principal } });
  }));

  router.post("/login", asyncHandler(async (request, response) => {
    const principal = await service.login(request.body);
    session.issue(response, principal);
    response.status(200).json({ data: { principal } });
  }));

  router.post("/logout", (_request, response) => {
    session.clear(response);
    response.status(204).end();
  });

  router.get("/me", session.authenticate, (request, response) => {
    response.status(200).json({ data: { principal: request.principal } });
  });

  router.patch("/profile", session.authenticate, asyncHandler(async (request, response) => {
    const principal = await service.updateProfile(request.body, request.principal);
    response.status(200).json({ data: { principal } });
  }));

  router.post("/change-password", session.authenticate, asyncHandler(async (request, response) => {
    await service.changePassword(request.body, request.principal);
    response.status(204).end();
  }));

  return { router, authenticate: session.authenticate };
}

function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}
