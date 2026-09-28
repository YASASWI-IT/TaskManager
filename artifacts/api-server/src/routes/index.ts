import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tasksRouter from "./tasks";
import dashboardRouter from "./dashboard";
import { systemStatus } from "./system-status";

const router: IRouter = Router();

router.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    systemStatus.lastEndpoint = `${req.method} ${req.originalUrl}`;
    systemStatus.lastStatusCode = res.statusCode;
    systemStatus.lastResponseAt = new Date();
    systemStatus.responseDurationMs = Date.now() - startedAt;
  });
  next();
});
router.use(healthRouter);
router.use(tasksRouter);
router.use(dashboardRouter);

export default router;
