const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in the environment variables");
}

// NODE_ENV=production on the live server; anything else (or unset) is development
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Frontend addresses allowed to call the API in production, comma-separated,
// e.g. "https://app.example.com,https://www.example.com". Ignored in development,
// where any origin is allowed.
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

if (IS_PRODUCTION && CORS_ORIGINS.length === 0) {
  throw new Error(
    "CORS_ORIGINS must be set in production (the frontend's URL, e.g. https://app.example.com)",
  );
}

// Where the frontend lives; links in emails (e.g. password reset) point here
const FRONTEND_URL = (
  process.env.FRONTEND_URL ?? (IS_PRODUCTION ? "" : "http://localhost:5173")
).replace(/\/$/, "");

if (!FRONTEND_URL) {
  throw new Error(
    "FRONTEND_URL must be set in production (e.g. https://app.example.com)",
  );
}

export { JWT_SECRET, IS_PRODUCTION, CORS_ORIGINS, FRONTEND_URL };
