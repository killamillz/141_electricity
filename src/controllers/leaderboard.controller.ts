import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../utils/AppError.js";
import { currentMonthKey } from "../utils/month.js";
import { getLeaderboard } from "../services/leaderboard.service.js";

const sortBy = z.enum(["total", "extra"]).default("total");

const MonthQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must look like 2026-10")
    .optional(),
  sortBy,
});

const YearQuery = z.object({
  year: z.string().regex(/^\d{4}$/, "Year must look like 2026").optional(),
  sortBy,
});

const requireUserId = (req: Request) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, "Authentication required");
  }
  return userId;
};

/** Who paid what in a month (defaults to the current month) */

export const monthLeaderboard = async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const query = MonthQuery.parse(req.query);

  const leaderboard = await getLeaderboard(
    { type: "month", key: query.month ?? currentMonthKey() },
    query.sortBy,
    userId,
  );

  return res.json(leaderboard);
};

/** Who paid what in a year (defaults to the current year) */

export const yearLeaderboard = async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const query = YearQuery.parse(req.query);

  const leaderboard = await getLeaderboard(
    { type: "year", key: query.year ?? currentMonthKey().slice(0, 4) },
    query.sortBy,
    userId,
  );

  return res.json(leaderboard);
};
