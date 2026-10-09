import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { uploadReceipt } from "../middleware/upload.middleware.js";
import { scan, create, myPayments } from "../controllers/subscription.controller.js";

const router = Router();

router.use(authenticate);

router.post("/scan", uploadReceipt, scan);
router.post("/", create);
router.get("/me", myPayments);

export default router;
