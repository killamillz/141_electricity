import type { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { listBills } from "../services/billing.service.js";

/** The logged-in user's monthly bills, newest first */

export const myBills = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(401, "Authentication required");
  }

  const bills = await listBills(userId);

  return res.json({ bills });
};
