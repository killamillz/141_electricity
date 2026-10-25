import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./docs/openapi.js";
import authRoutes from "./routes/auth.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import billRoutes from "./routes/bill.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import leaderboardRoutes from "./routes/leaderboard.routes.js";
import { notFound, errorHandler } from "./middleware/error.middleware.js";
import { IS_PRODUCTION, CORS_ORIGINS } from "./config/env.js";

const app = express();

// Hosts like Render and Railway sit behind one proxy. Trusting it lets
// req.ip be the real client address, which the rate limits rely on.
if (IS_PRODUCTION) {
  app.set("trust proxy", 1);
}

// API docs. Registered before the global helmet() because Swagger UI's
// scripts and styles are blocked by helmet's default Content-Security-Policy.
app.get("/api/docs.json", (_req, res) => res.json(openApiSpec));
app.use(
  "/api/docs",
  helmet({ contentSecurityPolicy: false }),
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: "Electricity Billing API",
    swaggerOptions: { persistAuthorization: true },
  }),
);

app.use(helmet());
// Development: any origin, so the local frontend works on any port.
// Production: only the frontend addresses listed in CORS_ORIGINS.
app.use(cors(IS_PRODUCTION ? { origin: CORS_ORIGINS } : undefined));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/leaderboard", leaderboardRoutes);

// Must come after all routes
app.use(notFound);
app.use(errorHandler);

export default app;
