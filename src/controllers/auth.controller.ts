import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database.js";
import { generateToken } from "../utils/jwt.js";
import { AppError } from "../utils/AppError.js";
import type { User } from "../generated/prisma/client.js";
import { z } from "zod";
import {
  requestPasswordReset,
  resetPassword as applyPasswordReset,
} from "../services/passwordReset.service.js";

const ForgotPasswordBody = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

const ResetPasswordBody = z.object({
  token: z.string().min(1, "Reset token is required"),
  // bcrypt only uses the first 72 bytes of a password
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

// What the client sees about a user; never the password hash
const publicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role, // "ADMIN" users can open the admin pages
});

// No try/catch needed: Express 5 forwards errors thrown in async handlers
// to the error middleware (src/middleware/error.middleware.ts).

export const register = async (req: Request, res: Response) => {
  const { email, password, firstName, lastName } = req.body ?? {};

  if (!email || !password) {
    throw new AppError(400, "Email and password are required");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(409, "User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
    },
  });

  const token = generateToken(user.id);

  return res.status(201).json({
    message: "Registration successful",
    token,
    user: publicUser(user),
  });
};

/** Login */

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    throw new AppError(400, "Email and password are required");
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError(401, "Invalid credentials");
  }

  const passwordMatch = await bcrypt.compare(password, user.password);

  if (!passwordMatch) {
    throw new AppError(401, "Invalid credentials");
  }

  const token = generateToken(user.id);

  return res.json({
    message: "Login successful",
    token,
    user: publicUser(user),
  });
};

/** Logged in user details */

export const me = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(401, "Authentication required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  return res.json({
    user: publicUser(user),
  });
};

/** Logout */

export const logout = async (_req: Request, res: Response) => {
  // JWTs are stateless: the client must discard its token.
  // The token itself remains valid until it expires.
  return res.json({
    message: "Logout successful",
  });
};

/** Forgot password: emails a reset link if the account exists */

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = ForgotPasswordBody.parse(req.body ?? {});

  await requestPasswordReset(email);

  // Same answer whether or not the account exists
  return res.json({
    message: "If an account exists for that email, we've sent a link to reset the password.",
  });
};

/** Reset password using the token from the email link */

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = ResetPasswordBody.parse(req.body ?? {});

  await applyPasswordReset(token, password);

  return res.json({
    message: "Password updated. You can now log in with your new password.",
  });
};
