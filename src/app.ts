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

const app = express();

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
app.use(cors());
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
