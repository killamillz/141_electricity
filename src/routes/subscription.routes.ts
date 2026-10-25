import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { uploadReceipt } from "../middleware/upload.middleware.js";
import { scanLimiter } from "../middleware/rateLimit.middleware.js";
import { scan, create, myPayments, receiptImage } from "../controllers/subscription.controller.js";

const router = Router();

router.use(authenticate);

router.post("/scan", scanLimiter, uploadReceipt, scan);
router.post("/", uploadReceipt, create); // JSON, or multipart with an optional "receipt" image
router.get("/me", myPayments);
router.get("/:id/receipt", receiptImage);

export default router;
