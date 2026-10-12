import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../utils/AppError.js";
import { listBills, setMonthlyAmount } from "../services/billing.service.js";

const MonthlyAmountBody = z.object({
  // null removes the user's monthly plan
  monthlyAmount: z.number().positive("Monthly amount must be greater than 0").nullable(),
});

const userIdParam = (req: Request) => {
  const id = req.params.id;
  if (typeof id !== "string" || !id) {
    throw new AppError(400, "User id is required");
  }
  return id;
};

/** Set a user's monthly amount */

export const updateMonthlyAmount = async (req: Request, res: Response) => {
  const { monthlyAmount } = MonthlyAmountBody.parse(req.body ?? {});

  const result = await setMonthlyAmount(userIdParam(req), monthlyAmount);

  return res.json({
    message:
      monthlyAmount === null ? "Monthly plan removed" : "Monthly amount updated",
    ...result,
  });
};

/** View a user's bills */

export const userBills = async (req: Request, res: Response) => {
  const bills = await listBills(userIdParam(req));

  return res.json({ bills });
};
