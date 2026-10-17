import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../utils/AppError.js";
import {
  findReceiptImageId,
  listPayments,
  recordPayment,
} from "../services/billing.service.js";
import { scanReceipt, RECEIPT_MIME_TYPES } from "../services/receipt.service.js";
import {
  deleteReceiptImage,
  receiptImageUrl,
  uploadReceiptImage,
} from "../services/image.service.js";

const requireUserId = (req: Request) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "Authentication required");
  }
  return userId;
};

const PaymentBody = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  kilowattHours: z.coerce.number().positive("kWh must be greater than 0"),
  // Spaces and dashes are allowed for readability and stripped before saving
  token: z
    .string()
    .transform((t) => t.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{20}$/, "Token must be 20 digits"))
    .optional(),
  purchasedAt: z.coerce.date().optional(),
  source: z.enum(["RECEIPT", "MANUAL"]).optional(),
});

/** Scan a receipt image. Returns the extracted fields for the user to check; nothing is saved. */

export const scan = async (req: Request, res: Response) => {
  requireUserId(req);

  if (!req.file) {
    throw new AppError(400, 'Upload the receipt image in a "receipt" form field');
  }

  const receipt = await scanReceipt(
    req.file.buffer,
    req.file.mimetype as (typeof RECEIPT_MIME_TYPES)[number],
  );

  return res.json({
    message: "Receipt scanned. Check the details before saving.",
    receipt,
  });
};

/** Save a payment, whether typed in or confirmed from a scan, optionally with the receipt image */

export const create = async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const body = PaymentBody.parse(req.body ?? {});

  // Upload only after the body is valid, so bad requests don't leave images behind
  const receiptImageId = req.file
    ? await uploadReceiptImage(req.file.buffer)
    : undefined;

  try {
    const result = await recordPayment(userId, { ...body, receiptImageId });

    return res.status(201).json({
      message: "Payment recorded",
      ...result,
    });
  } catch (error) {
    if (receiptImageId) {
      await deleteReceiptImage(receiptImageId);
    }
    throw error;
  }
};

/** A short-lived link to the receipt image of one of the user's payments */

export const receiptImage = async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const paymentId = req.params.id;

  if (typeof paymentId !== "string" || !paymentId) {
    throw new AppError(400, "Payment id is required");
  }

  const publicId = await findReceiptImageId(paymentId, userId);

  return res.json(receiptImageUrl(publicId));
};

/** The logged-in user's payments */

export const myPayments = async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const payments = await listPayments(userId);

  return res.json({ payments });
};
