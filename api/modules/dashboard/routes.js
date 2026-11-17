// HTTP endpoint สำหรับ KPI dashboard; SQL รวมข้อมูลอยู่ใน repository.js
import { Router } from "express";
import { requireRoles } from "../auth/session.js";
import { DashboardRepository } from "./repository.js";

export function createDashboardModule({ pool, authenticate }) {
  const repository = new DashboardRepository(pool);
  const router = Router();
  router.get("/staff/dashboard-summary", authenticate,
    requireRoles("superadmin", "reception", "management"),
    asyncHandler(async (_request, response) => response.json({ data: await repository.summary() })));
  return { router };
}

function asyncHandler(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}
