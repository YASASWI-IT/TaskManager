import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { HealthCheckResponse, GetSystemHealthResponse } from "@workspace/api-zod";
import { systemStatus } from "./system-status";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (_req, res) => {
  let database: "connected" | "disconnected" = "connected";
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = "disconnected";
  }
  return res.json(GetSystemHealthResponse.parse({
    status: database === "connected" ? "online" : "offline",
    scheduler: "running",
    database,
    lastEndpoint: systemStatus.lastEndpoint,
    lastStatusCode: systemStatus.lastStatusCode,
    lastResponseAt: systemStatus.lastResponseAt,
    responseDurationMs: systemStatus.responseDurationMs,
  }));
});

export default router;
