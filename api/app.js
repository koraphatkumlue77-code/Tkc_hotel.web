import express from "express";
import path from "node:path";
import { apiErrorHandler, requestIdMiddleware } from "./middleware/errors.js";
import { requireSameOrigin } from "./middleware/origin.js";
import { createAuthModule } from "./modules/auth/routes.js";
import { createBookingsModule } from "./modules/bookings/routes.js";
import { createPaymentsModule } from "./modules/payments/routes.js";
import { createRoomsModule } from "./modules/rooms/routes.js";
import { createStaysModule } from "./modules/stays/routes.js";
import { createServicesModule } from "./modules/services/routes.js";
import { createPromotionsModule } from "./modules/promotions/routes.js";
import { createToursModule } from "./modules/tours/routes.js";
import { createRefundsModule } from "./modules/refunds/routes.js";
import { createRoomOperationsModule } from "./modules/room-operations/routes.js";
import { createReviewsModule } from "./modules/reviews/routes.js";
import { createChatModule } from "./modules/chat/routes.js";
import { createEmployeesModule } from "./modules/employees/routes.js";
import { createAuditModule } from "./modules/audit/routes.js";

export function createApp({ checkDatabase, publicRoot, pool, authConfig, storageRoot }) {
  if (typeof checkDatabase !== "function") {
    throw new TypeError("checkDatabase must be a function");
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use("/api", requireSameOrigin);
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "tkc-hotel-api"
    });
  });

  app.get("/api/health/db", async (_request, response) => {
    try {
      await checkDatabase();
      response.status(200).json({
        status: "ok",
        database: "connected"
      });
    } catch {
      response.status(503).json({
        status: "error",
        database: "unavailable"
      });
    }
  });

  if (pool && authConfig) {
    const auth = createAuthModule({ pool, authConfig });
    app.use("/api/auth", auth.router);
    app.locals.authenticate = auth.authenticate;
    app.use("/api", createRoomsModule({ pool, authenticate: auth.authenticate }).router);
    app.use("/api", createBookingsModule({ pool, authenticate: auth.authenticate }).router);
    app.use("/api", createStaysModule({ pool, authenticate: auth.authenticate }).router);
    app.use("/api", createServicesModule({ pool, authenticate: auth.authenticate }).router);
    app.use("/api", createPromotionsModule({ pool, authenticate: auth.authenticate }).router);
    app.use("/api", createToursModule({ pool, authenticate: auth.authenticate }).router);
    app.use("/api", createRefundsModule({ pool, authenticate: auth.authenticate }).router);
    app.use("/api", createReviewsModule({ pool, authenticate: auth.authenticate }).router);
    app.use("/api", createChatModule({ pool, authenticate: auth.authenticate }).router);
    app.use("/api", createEmployeesModule({ pool, authenticate: auth.authenticate }).router);
    app.use("/api", createAuditModule({ pool, authenticate: auth.authenticate }).router);
    if (storageRoot) {
      app.use("/api", createPaymentsModule({
        pool,
        authenticate: auth.authenticate,
        storageRoot
      }).router);
      app.use("/api", createRoomOperationsModule({ pool, authenticate: auth.authenticate, storageRoot }).router);
    }
  }

  app.use("/api", (_request, response) => {
    response.status(404).json({
      status: "error",
      code: "API_NOT_FOUND"
    });
  });

  if (publicRoot) {
    const sendPublicFile = (fileName) => (_request, response, next) => {
      response.sendFile(path.join(publicRoot, fileName), {
        dotfiles: "deny"
      }, (error) => {
        if (error) next(error);
      });
    };

    app.get("/", sendPublicFile("index.html"));
    app.get("/style.css", sendPublicFile("style.css"));
    app.get("/script.js", sendPublicFile("script.js"));
  }

  app.use((_request, response) => {
    response.status(404).end();
  });

  app.use((error, request, response, next) => {
    if (request.path.startsWith("/api/")) {
      apiErrorHandler(error, request, response, next);
      return;
    }
    if (error.status === 404) {
      response.status(404).end();
      return;
    }
    response.status(500).end();
  });

  return app;
}
