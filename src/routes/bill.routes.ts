import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { myBills } from "../controllers/bill.controller.js";

const router = Router();

router.get("/me", authenticate, myBills);

export default router;
