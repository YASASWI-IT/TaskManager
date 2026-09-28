import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function normalizeTask(task: typeof tasksTable.$inferSelect) {
  return {
    ...task,
    scheduledAt: task.scheduledAt.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}

router.get("/dashboard/summary", async (_req, res) => {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 2 * 60 * 60_000);
    const [scheduledCount, completedCount, overdueCount, dueSoonCount, upcoming, recentlyCompleted] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(tasksTable).where(eq(tasksTable.status, "scheduled")),
      db.select({ count: sql<number>`count(*)` }).from(tasksTable).where(eq(tasksTable.status, "completed")),
      db.select({ count: sql<number>`count(*)` }).from(tasksTable).where(eq(tasksTable.status, "overdue")),
      db.select({ count: sql<number>`count(*)` }).from(tasksTable).where(and(eq(tasksTable.status, "scheduled"), gt(tasksTable.scheduledAt, now), lte(tasksTable.scheduledAt, soon))),
      db.select().from(tasksTable).where(and(eq(tasksTable.status, "scheduled"), gt(tasksTable.scheduledAt, now))).orderBy(asc(tasksTable.scheduledAt)).limit(4),
      db.select().from(tasksTable).where(eq(tasksTable.status, "completed")).orderBy(desc(tasksTable.completedAt)).limit(4),
    ]);
    return res.json({
      scheduled: Number(scheduledCount[0]?.count ?? 0),
      completed: Number(completedCount[0]?.count ?? 0),
      overdue: Number(overdueCount[0]?.count ?? 0),
      dueSoon: Number(dueSoonCount[0]?.count ?? 0),
      upcoming: upcoming.map(normalizeTask),
      recentlyCompleted: recentlyCompleted.map(normalizeTask),
    });
  } catch (error) {
    logger.error({ error }, "Failed to load dashboard summary");
    return res.status(500).json({ error: "Unable to load dashboard summary" });
  }
});

export default router;