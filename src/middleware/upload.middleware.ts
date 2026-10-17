import multer from "multer";
import { AppError } from "../utils/AppError.js";
import { RECEIPT_MIME_TYPES } from "../services/receipt.service.js";

// Receipt images are kept in memory only long enough to scan them,
// or to upload them to Cloudinary when a payment is saved.
// 5 MB matches the Claude API's per-image limit.
export const uploadReceipt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((RECEIPT_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, "Receipt must be a JPEG, PNG, WebP or GIF image"));
    }
  },
}).single("receipt");
