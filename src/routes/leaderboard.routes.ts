import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { monthLeaderboard, yearLeaderboard } from "../controllers/leaderboard.controller.js";

const router = Router();

router.use(authenticate);

router.get("/month", monthLeaderboard);
router.get("/year", yearLeaderboard);

export default router;
