import type { ReactElement } from "react";
import nodemailer from "nodemailer";
import { render, toPlainText } from "@react-email/components";
import { EMAIL_ENABLED, EMAIL_FROM, SMTP } from "../config/email.js";

const transporter = EMAIL_ENABLED
  ? nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.port === 465, // 465 = TLS from the start; 587 upgrades with STARTTLS
      auth: { user: SMTP.user, pass: SMTP.pass },
    })
  : null;

interface EmailMessage {
  to: string;
  subject: string;
  template: ReactElement;
}

/** Sends an HTML email with a plain-text version for apps that don't show HTML */
export const sendEmail = async ({ to, subject, template }: EmailMessage) => {
  const html = await render(template);
  const text = toPlainText(html);

  if (!transporter) {
    // Development without SMTP settings: print instead of sending
    console.log(`\n[email not sent: SMTP not configured]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }

  await transporter.sendMail({ from: EMAIL_FROM, to, subject, html, text });
};

/**
 * Sends in the background so the request doesn't wait for (or fail on) the
 * email provider. Failures are logged.
 */
export const sendEmailInBackground = (message: EmailMessage) => {
  sendEmail(message).catch((error) => {
    console.error(`Email "${message.subject}" to ${message.to} failed:`, error);
  });
};
