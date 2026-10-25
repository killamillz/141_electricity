import { createHash, randomBytes } from "node:crypto";
import { createElement } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database.js";
import { FRONTEND_URL } from "../config/env.js";
import { BRAND } from "../config/email.js";
import { AppError } from "../utils/AppError.js";
import { sendEmailInBackground } from "./email.service.js";
import { ResetPasswordEmail } from "../emails/ResetPasswordEmail.js";
import { PasswordChangedEmail } from "../emails/PasswordChangedEmail.js";

const LINK_LIFETIME_MINUTES = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Emails a one-time reset link if an account exists for this email.
 * Says nothing either way, so the endpoint can't be used to find out
 * who has an account.
 */
export const requestPasswordReset = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true },
  });

  if (!user) return;

  const token = randomBytes(32).toString("base64url");

  // A new request replaces any earlier links that weren't used
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + LINK_LIFETIME_MINUTES * 60 * 1000),
      },
    }),
  ]);

  sendEmailInBackground({
    to: user.email,
    subject: `Reset your ${BRAND.appName} password`,
    template: createElement(ResetPasswordEmail, {
      firstName: user.firstName,
      resetUrl: `${FRONTEND_URL}/reset-password?token=${token}`,
      expiresInMinutes: LINK_LIFETIME_MINUTES,
    }),
  });
};

/** Sets a new password using the token from the email link */
export const resetPassword = async (token: string, newPassword: string) => {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, firstName: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(
      400,
      "This reset link is invalid or has expired. Please request a new one.",
    );
  }

  const password = await bcrypt.hash(newPassword, 12);
  const changedAt = new Date();

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { password } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: changedAt } }),
    // Any other outstanding links for this user stop working too
    prisma.passwordResetToken.deleteMany({
      where: { userId: record.userId, id: { not: record.id } },
    }),
  ]);

  sendEmailInBackground({
    to: record.user.email,
    subject: `Your ${BRAND.appName} password was changed`,
    template: createElement(PasswordChangedEmail, {
      firstName: record.user.firstName,
      email: record.user.email,
      changedAt,
      forgotPasswordUrl: `${FRONTEND_URL}/forgot-password`,
    }),
  });
};
