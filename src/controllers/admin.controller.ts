import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../utils/AppError.js";
import { prisma } from "../config/database.js";
import {
  findReceiptImageId,
  listBills,
  setMonthlyAmount,
} from "../services/billing.service.js";
import { receiptImageUrl } from "../services/image.service.js";

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

/** All users, so the admin can pick whose plan or bills to manage */

export const listUsers = async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      monthlyAmount: true,
      createdAt: true,
    },
  });

  return res.json({
    users: users.map((u) => ({
      ...u,
      monthlyAmount: u.monthlyAmount?.toNumber() ?? null,
    })),
  });
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

/** A short-lived link to any payment's receipt image */

export const paymentReceiptImage = async (req: Request, res: Response) => {
  const paymentId = req.params.id;
  if (typeof paymentId !== "string" || !paymentId) {
    throw new AppError(400, "Payment id is required");
  }

  const publicId = await findReceiptImageId(paymentId);

  return res.json(receiptImageUrl(publicId));
};
