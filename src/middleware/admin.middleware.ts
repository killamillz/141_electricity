import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database.js";

// Use after `authenticate`. The role is read from the database rather than
// the token, so a role change takes effect immediately.
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user?.id;

  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      })
    : null;

  if (user?.role !== "ADMIN") {
    return res.status(403).json({
      message: "Admin access required",
    });
  }

  next();
};
