import { IS_PRODUCTION } from "./env.js";

// Any SMTP provider works. Gmail by default; to switch to Resend, Brevo etc.
// change these values only.
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";

// Without SMTP details in development, emails are printed to the console
// instead of sent, so password reset can still be tested locally.
export const EMAIL_ENABLED = Boolean(SMTP_USER && SMTP_PASS);

if (IS_PRODUCTION && !EMAIL_ENABLED) {
  throw new Error("SMTP_USER and SMTP_PASS must be set in production to send emails");
}

export const SMTP = {
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT ?? 465),
  user: SMTP_USER,
  pass: SMTP_PASS,
};

// Branding used in every email
export const BRAND = {
  appName: process.env.APP_NAME ?? "141 Electricity",
  color: process.env.BRAND_COLOR ?? "#1D4ED8",
  // A public https link to a PNG logo (e.g. uploaded to Cloudinary as public).
  // Without it, the app name is shown as text.
  logoUrl: process.env.LOGO_URL ?? "",
  supportEmail: process.env.SUPPORT_EMAIL ?? SMTP_USER,
};

// Gmail only sends "from" the account itself (or its verified aliases)
export const EMAIL_FROM = process.env.EMAIL_FROM ?? `"${BRAND.appName}" <${SMTP_USER}>`;
