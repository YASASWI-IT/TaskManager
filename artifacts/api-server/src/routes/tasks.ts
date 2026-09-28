import { Router, type IRouter, type Response } from "express";
import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";
import {
  CompleteTaskParams,
  CreateTaskBody,
  DeleteTaskParams,
  GetTaskParams,
  ListTasksQueryParams,
  RescheduleTaskBody,
  RescheduleTaskParams,
  UpdateTaskBody,
  UpdateTaskParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const SCHEDULED = "scheduled";
const COMPLETED = "completed";
const OVERDUE = "overdue";
let initialized = false;

function normalizeTask(task: typeof tasksTable.$inferSelect) {
  return {
    ...task,
    scheduledAt: task.scheduledAt.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}

function parseSchedule(scheduledDate: string, scheduledTime: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !/^\d{2}:\d{2}$/.test(scheduledTime)) {
    return null;
  }
  const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getMinutes() !== Number(scheduledTime.slice(3))) {
    return null;
  }
  return scheduledAt;
}

async function updateOverdueTasks() {
  const now = new Date();
  await db
    .update(tasksTable)
    .set({ status: OVERDUE, updatedAt: now })
    .where(and(eq(tasksTable.status, SCHEDULED), lte(tasksTable.scheduledAt, now)));
}

async function ensureSeedData() {
  if (initialized) return;
  const existing = await db.select({ count: sql<number>`count(*)` }).from(tasksTable);
  if (Number(existing[0]?.count ?? 0) === 0) {
    const now = new Date();
    const seeds = [45, 150, 1440].map((minutes, index) => {
      const scheduledAt = new Date(now.getTime() + minutes * 60_000);
      return {
        description: [
          "Verify incoming inspection records for batch QC-24",
          "Review calibration certificates for line 3 instruments",
          "Complete end-of-shift quality walk-through",
        ][index],
        scheduledDate: scheduledAt.toISOString().slice(0, 10),
        scheduledTime: scheduledAt.toISOString().slice(11, 16),
        scheduledAt,
        status: SCHEDULED,
      };
    });
    await db.insert(tasksTable).values(seeds);
  }
  initialized = true;
}

async function getTaskById(id: number) {
  const rows = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
  return rows[0];
}

function validationError(res: Response, message: string) {
  return res.status(400).json({ error: message });
}

router.get("/tasks", async (req, res) => {
  try {
    await ensureSeedData();
    await updateOverdueTasks();
    const parsed = ListTasksQueryParams.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid task filters" });
    const { status = "all", search, limit = 100 } = parsed.data;
    const conditions = [];
    if (status === "scheduled") conditions.push(eq(tasksTable.status, SCHEDULED));
    if (status === "completed") conditions.push(eq(tasksTable.status, COMPLETED));
    if (status === "overdue") conditions.push(eq(tasksTable.status, OVERDUE));
    if (status === "upcoming") {
      conditions.push(and(eq(tasksTable.status, SCHEDULED), gte(tasksTable.scheduledAt, new Date())));
    }
    if (search) conditions.push(ilike(tasksTable.description, `%${search}%`));
    const rows = await db
      .select()
      .from(tasksTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(tasksTable.scheduledAt))
      .limit(limit);
    return res.json(rows.map(normalizeTask));
  } catch (error) {
    logger.error({ error }, "Failed to list tasks");
    return res.status(500).json({ error: "Unable to load tasks" });
  }
});

router.post("/tasks", async (req, res) => {
  try {
    await ensureSeedData();
    const parsed = CreateTaskBody.safeParse(req.body);
    if (!parsed.success) return validationError(res, "Description, date, and time are required");
    const scheduledAt = parseSchedule(parsed.data.scheduledDate, parsed.data.scheduledTime);
    if (!scheduledAt || scheduledAt <= new Date()) return validationError(res, "Choose a valid future date and time");
    const [task] = await db.insert(tasksTable).values({
      description: parsed.data.description.trim(),
      scheduledDate: parsed.data.scheduledDate,
      scheduledTime: parsed.data.scheduledTime,
      scheduledAt,
      status: SCHEDULED,
    }).returning();
    return res.status(201).json(normalizeTask(task));
  } catch (error) {
    logger.error({ error }, "Failed to create task");
    return res.status(500).json({ error: "Unable to create task" });
  }
});

router.get("/tasks/due", async (_req, res) => {
  try {
    await ensureSeedData();
    await updateOverdueTasks();
    const rows = await db.select().from(tasksTable)
      .where(and(lte(tasksTable.scheduledAt, new Date()), eq(tasksTable.status, OVERDUE)))
      .orderBy(asc(tasksTable.scheduledAt));
    return res.json(rows.map(normalizeTask));
  } catch (error) {
    logger.error({ error }, "Failed to load due tasks");
    return res.status(500).json({ error: "Unable to load due tasks" });
  }
});

router.get("/tasks/:id", async (req, res) => {
  try {
    const parsed = GetTaskParams.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: "Invalid task id" });
    const task = await getTaskById(parsed.data.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    return res.json(normalizeTask(task));
  } catch (error) {
    logger.error({ error }, "Failed to load task");
    return res.status(500).json({ error: "Unable to load task" });
  }
});

router.put("/tasks/:id", async (req, res) => {
  try {
    const params = UpdateTaskParams.safeParse(req.params);
    const body = UpdateTaskBody.safeParse(req.body);
    if (!params.success || !body.success) return res.status(400).json({ error: "Invalid task update" });
    const current = await getTaskById(params.data.id);
    if (!current) return res.status(404).json({ error: "Task not found" });
    const scheduledDate = body.data.scheduledDate ?? current.scheduledDate;
    const scheduledTime = body.data.scheduledTime ?? current.scheduledTime;
    const scheduledAt = parseSchedule(scheduledDate, scheduledTime);
    if (!scheduledAt || scheduledAt <= new Date()) return validationError(res, "Choose a valid future date and time");
    const [task] = await db.update(tasksTable).set({
      description: body.data.description?.trim() ?? current.description,
      scheduledDate,
      scheduledTime,
      scheduledAt,
      status: SCHEDULED,
      completedAt: null,
      reminderAcknowledged: false,
      updatedAt: new Date(),
    }).where(eq(tasksTable.id, params.data.id)).returning();
    return res.json(normalizeTask(task));
  } catch (error) {
    logger.error({ error }, "Failed to update task");
    return res.status(500).json({ error: "Unable to update task" });
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    const parsed = DeleteTaskParams.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: "Invalid task id" });
    const deleted = await db.delete(tasksTable).where(eq(tasksTable.id, parsed.data.id)).returning({ id: tasksTable.id });
    if (!deleted.length) return res.status(404).json({ error: "Task not found" });
    return res.status(204).send();
  } catch (error) {
    logger.error({ error }, "Failed to delete task");
    return res.status(500).json({ error: "Unable to delete task" });
  }
});

router.post("/tasks/:id/complete", async (req, res) => {
  try {
    const parsed = CompleteTaskParams.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ error: "Invalid task id" });
    const current = await getTaskById(parsed.data.id);
    if (!current) return res.status(404).json({ error: "Task not found" });
    if (current.status === COMPLETED) return res.status(409).json({ error: "Task is already completed" });
    const now = new Date();
    const [task] = await db.update(tasksTable).set({
      status: COMPLETED,
      completedAt: now,
      reminderAcknowledged: true,
      updatedAt: now,
    }).where(eq(tasksTable.id, parsed.data.id)).returning();
    return res.json(normalizeTask(task));
  } catch (error) {
    logger.error({ error }, "Failed to complete task");
    return res.status(500).json({ error: "Unable to complete task" });
  }
});

router.post("/tasks/:id/reschedule", async (req, res) => {
  try {
    const params = RescheduleTaskParams.safeParse(req.params);
    const body = RescheduleTaskBody.safeParse(req.body);
    if (!params.success || !body.success) return res.status(400).json({ error: "Date and time are required" });
    const scheduledAt = parseSchedule(body.data.scheduledDate, body.data.scheduledTime);
    if (!scheduledAt || scheduledAt <= new Date()) return validationError(res, "Choose a valid future date and time");
    const current = await getTaskById(params.data.id);
    if (!current) return res.status(404).json({ error: "Task not found" });
    const [task] = await db.update(tasksTable).set({
      scheduledDate: body.data.scheduledDate,
      scheduledTime: body.data.scheduledTime,
      scheduledAt,
      status: SCHEDULED,
      completedAt: null,
      reminderAcknowledged: false,
      updatedAt: new Date(),
    }).where(eq(tasksTable.id, params.data.id)).returning();
    return res.json(normalizeTask(task));
  } catch (error) {
    logger.error({ error }, "Failed to reschedule task");
    return res.status(500).json({ error: "Unable to reschedule task" });
  }
});

setInterval(() => {
  updateOverdueTasks().catch((error) => logger.error({ error }, "Scheduler tick failed"));
}, 5000).unref();

export default router;