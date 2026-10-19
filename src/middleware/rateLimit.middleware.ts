import type { Request } from "express";
import { rateLimit } from "express-rate-limit";

// Same { message } shape as every other error response
const limitResponse = (message: string) => ({ message });

const common = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
} as const;

// Slows down password guessing. Successful logins don't count.
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: limitResponse("Too many failed login attempts, please try again in 15 minutes"),
});

// Stops one address from creating accounts in bulk
export const registerLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: limitResponse("Too many accounts created, please try again later"),
});

// Stops one address from flooding people's inboxes with reset emails
export const forgotPasswordLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: limitResponse("Too many reset requests, please try again later"),
});

export const resetPasswordLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: limitResponse("Too many attempts, please try again in 15 minutes"),
});

// Every scan is a paid Claude API call, so cap it per user.
// Must run after `authenticate`.
export const scanLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req: Request) => req.user?.id ?? "anonymous",
  message: limitResponse(
    "You've scanned a lot of receipts this hour, please enter the details manually or try again later",
  ),
});
