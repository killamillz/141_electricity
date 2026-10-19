import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import {
  listUsers,
  updateMonthlyAmount,
  userBills,
  paymentReceiptImage,
} from "../controllers/admin.controller.js";

const router = Router();

router.use(authenticate, requireAdmin);

router.get("/users", listUsers);
router.patch("/users/:id/monthly-amount", updateMonthlyAmount);
router.get("/users/:id/bills", userBills);
router.get("/payments/:id/receipt", paymentReceiptImage);

export default router;
