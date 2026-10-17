// OpenAPI 3.1 spec, served by Swagger UI at /api/docs (raw JSON at /api/docs.json).
// Keep this in sync when routes, request bodies or responses change.

const errorResponse = (description: string, example: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
      example: { message: example },
    },
  },
});

const unauthorized = errorResponse(
  "Missing, invalid or expired token",
  "Invalid or expired token",
);
const forbidden = errorResponse("Logged in but not an admin", "Admin access required");
const validationError = {
  description: "Request body failed validation",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ValidationError" },
    },
  },
};

const json = (schema: object, example?: unknown) => ({
  "application/json": example === undefined ? { schema } : { schema, example },
});

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Electricity Billing API",
    version: "1.0.0",
    description: [
      "Backend for tracking prepaid electricity purchases against a monthly amount set by an admin.",
      "",
      "**How billing works**",
      "- An admin sets a user's monthly amount. This creates the bill for the current month.",
      "- Each payment counts toward the bill for the month it was bought in (Africa/Lagos time).",
      "- Up to the amount still owed counts toward the bill (`billAmount`); the rest is extra (`extraAmount`).",
      "- A bill turns `PAID` once fully covered. Unpaid bills from past months become `LATE`.",
      "",
      "**Authentication:** call `POST /auth/login`, then click **Authorize** and paste the `token`.",
    ].join("\n"),
  },
  servers: [{ url: "/api" }],
  tags: [
    { name: "Auth", description: "Register, log in and the current user" },
    { name: "Payments", description: "Record electricity purchases and scan receipts" },
    { name: "Bills", description: "Monthly bill status" },
    { name: "Leaderboard", description: "Who paid what this month or year, including extra payments" },
    { name: "Admin", description: "Admin-only: monthly amounts and user bills" },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create an account",
        security: [],
        requestBody: {
          required: true,
          content: json(
            {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", format: "email" },
                password: { type: "string", format: "password" },
                firstName: { type: "string" },
                lastName: { type: "string" },
              },
            },
            { email: "ada@example.com", password: "s3cret-pass", firstName: "Ada", lastName: "Obi" },
          ),
        },
        responses: {
          201: {
            description: "Account created; returns a token valid for 1 hour",
            content: json({ $ref: "#/components/schemas/AuthResponse" }),
          },
          400: errorResponse("Email or password missing", "Email and password are required"),
          409: errorResponse("Email already registered", "User already exists"),
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        security: [],
        requestBody: {
          required: true,
          content: json(
            {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", format: "email" },
                password: { type: "string", format: "password" },
              },
            },
            { email: "ada@example.com", password: "s3cret-pass" },
          ),
        },
        responses: {
          200: {
            description: "Logged in; returns a token valid for 1 hour",
            content: json({ $ref: "#/components/schemas/AuthResponse" }),
          },
          400: errorResponse("Email or password missing", "Email and password are required"),
          401: errorResponse("Wrong email or password", "Invalid credentials"),
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out",
        description:
          "Tokens are stateless JWTs, so the client must delete its token. " +
          "The token itself stays valid until it expires (1 hour).",
        responses: {
          200: {
            description: "Logged out",
            content: json({ $ref: "#/components/schemas/Message" }, { message: "Logout successful" }),
          },
          401: unauthorized,
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the logged-in user",
        responses: {
          200: {
            description: "The current user",
            content: json({
              type: "object",
              required: ["user"],
              properties: { user: { $ref: "#/components/schemas/User" } },
            }),
          },
          401: unauthorized,
          404: errorResponse("User was deleted", "User not found"),
        },
      },
    },
    "/subscriptions/scan": {
      post: {
        tags: ["Payments"],
        summary: "Scan a receipt image",
        description:
          "Reads an electricity receipt with Claude and returns the extracted fields. " +
          "**Nothing is saved.** Show the values to the user to check and correct, then " +
          "save them with `POST /subscriptions` and `source: RECEIPT`. Fields that could " +
          "not be read clearly come back as `null`.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["receipt"],
                properties: {
                  receipt: {
                    type: "string",
                    format: "binary",
                    description: "JPEG, PNG, WebP or GIF image, up to 5 MB",
                  },
                },
              },
              encoding: { receipt: { contentType: "image/jpeg, image/png, image/webp, image/gif" } },
            },
          },
        },
        responses: {
          200: {
            description: "Fields extracted from the receipt",
            content: json(
              {
                type: "object",
                required: ["message", "receipt"],
                properties: {
                  message: { type: "string" },
                  receipt: { $ref: "#/components/schemas/ScannedReceipt" },
                },
              },
              {
                message: "Receipt scanned. Check the details before saving.",
                receipt: {
                  amount: 10000,
                  token: "12345678901234567890",
                  kilowattHours: 79.9,
                  purchasedAt: "2026-10-09T14:30:00+01:00",
                },
              },
            ),
          },
          400: errorResponse(
            "No file, wrong file type, or file over 5 MB",
            "Receipt must be a JPEG, PNG, WebP or GIF image",
          ),
          401: unauthorized,
          422: errorResponse(
            "Image is not a receipt or could not be read",
            "This image doesn't look like an electricity receipt",
          ),
          503: errorResponse(
            "Scanning is unavailable (no API key, outage or rate limit); enter details manually",
            "Receipt scanning is unavailable, please enter the details manually",
          ),
        },
      },
    },
    "/subscriptions": {
      post: {
        tags: ["Payments"],
        summary: "Record a payment",
        description:
          "Saves an electricity purchase for the logged-in user and applies it to the " +
          "bill for the month it was bought in (Africa/Lagos time). Up to the amount still " +
          "owed counts toward the bill; the rest is recorded as extra. A payment in a month " +
          "with no bill (no plan, or before the plan started) is entirely extra.\n\n" +
          "To keep the receipt photo with the payment, send `multipart/form-data` with the " +
          "same fields plus a `receipt` image. It is stored privately on Cloudinary; view it " +
          "with `GET /subscriptions/{id}/receipt`.",
        requestBody: {
          required: true,
          content: {
            ...json(
              { $ref: "#/components/schemas/PaymentInput" },
              {
                amount: 8000,
                kilowattHours: 100,
                token: "1234-5678-9012-3456-7890",
                purchasedAt: "2026-10-09T14:30:00+01:00",
                source: "RECEIPT",
              },
            ),
            "multipart/form-data": {
              schema: {
                allOf: [
                  { $ref: "#/components/schemas/PaymentInput" },
                  {
                    type: "object",
                    properties: {
                      receipt: {
                        type: "string",
                        format: "binary",
                        description: "Optional receipt photo: JPEG, PNG, WebP or GIF, up to 5 MB",
                      },
                    },
                  },
                ],
              },
              encoding: { receipt: { contentType: "image/jpeg, image/png, image/webp, image/gif" } },
            },
          },
        },
        responses: {
          201: {
            description: "Payment recorded",
            content: json(
              {
                type: "object",
                required: ["message", "payment", "bill"],
                properties: {
                  message: { type: "string" },
                  payment: { $ref: "#/components/schemas/Payment" },
                  bill: {
                    oneOf: [{ $ref: "#/components/schemas/BillSummary" }, { type: "null" }],
                    description: "The bill this payment was applied to, or null if it was all extra",
                  },
                },
              },
              {
                message: "Payment recorded",
                payment: {
                  id: "8f1c2a9e-0d4b-4c39-9a51-6f2e1b7d3c10",
                  amount: 8000,
                  billAmount: 4000,
                  extraAmount: 4000,
                  type: "SPLIT",
                  token: "12345678901234567890",
                  kilowattHours: 100,
                  source: "RECEIPT",
                  hasReceiptImage: true,
                  month: "2026-10",
                  purchasedAt: "2026-10-09T13:30:00.000Z",
                },
                bill: {
                  id: "3b7e9d21-5a6c-4f80-b2d4-9c1e0a8f7e65",
                  month: "2026-10",
                  amountDue: 10000,
                  status: "PAID",
                  paidAt: "2026-10-09T13:30:00.000Z",
                },
              },
            ),
          },
          400: validationError,
          401: unauthorized,
          409: errorResponse("Token already recorded", "This token has already been recorded"),
          503: errorResponse(
            "The receipt image couldn't be uploaded; nothing was saved",
            "Couldn't save the receipt image, please try again",
          ),
        },
      },
    },
    "/subscriptions/{id}/receipt": {
      get: {
        tags: ["Payments"],
        summary: "Get a link to my payment's receipt image",
        description:
          "Returns a signed Cloudinary link to the receipt image. The link expires after " +
          "5 minutes, so request a new one each time the image is shown.",
        parameters: [{ $ref: "#/components/parameters/PaymentId" }],
        responses: {
          200: {
            description: "Signed link to the image",
            content: json({ $ref: "#/components/schemas/ReceiptImageLink" }),
          },
          401: unauthorized,
          404: errorResponse(
            "No payment with that id for this user, or it has no image",
            "This payment has no receipt image",
          ),
        },
      },
    },
    "/subscriptions/me": {
      get: {
        tags: ["Payments"],
        summary: "List my payments",
        description: "Newest first. Each payment shows how much went to the bill and how much was extra.",
        responses: {
          200: {
            description: "The user's payments",
            content: json({
              type: "object",
              required: ["payments"],
              properties: {
                payments: { type: "array", items: { $ref: "#/components/schemas/Payment" } },
              },
            }),
          },
          401: unauthorized,
        },
      },
    },
    "/bills/me": {
      get: {
        tags: ["Bills"],
        summary: "List my monthly bills",
        description:
          "Newest first. Missing months up to the current one are created first, and unpaid " +
          "bills from past months are marked `LATE`. Empty if the user has no monthly plan.",
        responses: {
          200: {
            description: "The user's bills",
            content: json({
              type: "object",
              required: ["bills"],
              properties: { bills: { type: "array", items: { $ref: "#/components/schemas/Bill" } } },
            }),
          },
          401: unauthorized,
        },
      },
    },
    "/leaderboard/month": {
      get: {
        tags: ["Leaderboard"],
        summary: "Monthly leaderboard",
        description:
          "Everyone who paid in the month (Africa/Lagos time), ranked by total paid, or by " +
          "extra paid with `sortBy=extra`. Shows names and amounts only, never emails. " +
          "Users with the same amount share a rank.",
        parameters: [
          {
            name: "month",
            in: "query",
            description: "Defaults to the current month",
            schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$", example: "2026-10" },
          },
          { $ref: "#/components/parameters/LeaderboardSort" },
        ],
        responses: {
          200: {
            description: "The leaderboard",
            content: json({ $ref: "#/components/schemas/Leaderboard" }, {
              period: {
                type: "month",
                key: "2026-10",
                from: "2026-09-30T23:00:00.000Z",
                to: "2026-10-31T23:00:00.000Z",
              },
              sortBy: "total",
              totals: { totalPaid: 23000, billPaid: 20000, extraPaid: 3000, payers: 2 },
              entries: [
                { rank: 1, name: "Ada Obi", isMe: true, totalPaid: 13000, billPaid: 10000, extraPaid: 3000, payments: 2 },
                { rank: 2, name: "Tunde Bello", isMe: false, totalPaid: 10000, billPaid: 10000, extraPaid: 0, payments: 1 },
              ],
              me: { rank: 1, name: "Ada Obi", isMe: true, totalPaid: 13000, billPaid: 10000, extraPaid: 3000, payments: 2 },
            }),
          },
          400: validationError,
          401: unauthorized,
        },
      },
    },
    "/leaderboard/year": {
      get: {
        tags: ["Leaderboard"],
        summary: "Yearly leaderboard",
        description: "Same as the monthly leaderboard, for a whole calendar year.",
        parameters: [
          {
            name: "year",
            in: "query",
            description: "Defaults to the current year",
            schema: { type: "string", pattern: "^\\d{4}$", example: "2026" },
          },
          { $ref: "#/components/parameters/LeaderboardSort" },
        ],
        responses: {
          200: {
            description: "The leaderboard",
            content: json({ $ref: "#/components/schemas/Leaderboard" }),
          },
          400: validationError,
          401: unauthorized,
        },
      },
    },
    "/admin/users/{id}/monthly-amount": {
      patch: {
        tags: ["Admin"],
        summary: "Set a user's monthly amount",
        description:
          "Sets the amount the user must pay each month, and creates this month's bill if it " +
          "doesn't exist. If this month's bill exists and isn't paid yet, the new amount applies " +
          "to it too. Past months keep their original amount. Send `null` to remove the plan; " +
          "this month's bill is then deleted if nothing has been paid toward it.",
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        requestBody: {
          required: true,
          content: json(
            {
              type: "object",
              required: ["monthlyAmount"],
              properties: {
                monthlyAmount: {
                  type: ["number", "null"],
                  exclusiveMinimum: 0,
                  description: "Amount in naira, or null to remove the plan",
                },
              },
            },
            { monthlyAmount: 10000 },
          ),
        },
        responses: {
          200: {
            description: "Monthly amount updated",
            content: json({
              type: "object",
              required: ["message", "monthlyAmount", "currentBill"],
              properties: {
                message: { type: "string" },
                monthlyAmount: { type: ["number", "null"] },
                currentBill: {
                  oneOf: [{ $ref: "#/components/schemas/BillSummary" }, { type: "null" }],
                },
              },
            }),
          },
          400: validationError,
          401: unauthorized,
          403: forbidden,
          404: errorResponse("No user with that id", "User not found"),
        },
      },
    },
    "/admin/users/{id}/bills": {
      get: {
        tags: ["Admin"],
        summary: "List a user's bills",
        description: "Same as `GET /bills/me`, for any user.",
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        responses: {
          200: {
            description: "The user's bills",
            content: json({
              type: "object",
              required: ["bills"],
              properties: { bills: { type: "array", items: { $ref: "#/components/schemas/Bill" } } },
            }),
          },
          401: unauthorized,
          403: forbidden,
          404: errorResponse("No user with that id", "User not found"),
        },
      },
    },
    "/admin/payments/{id}/receipt": {
      get: {
        tags: ["Admin"],
        summary: "Get a link to any payment's receipt image",
        description: "Same as `GET /subscriptions/{id}/receipt`, for any user's payment.",
        parameters: [{ $ref: "#/components/parameters/PaymentId" }],
        responses: {
          200: {
            description: "Signed link to the image",
            content: json({ $ref: "#/components/schemas/ReceiptImageLink" }),
          },
          401: unauthorized,
          403: forbidden,
          404: errorResponse(
            "No payment with that id, or it has no image",
            "This payment has no receipt image",
          ),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "The `token` from register or login. Expires after 1 hour.",
      },
    },
    parameters: {
      UserId: {
        name: "id",
        in: "path",
        required: true,
        description: "The user's id",
        schema: { type: "string", format: "uuid" },
      },
      PaymentId: {
        name: "id",
        in: "path",
        required: true,
        description: "The payment's id",
        schema: { type: "string", format: "uuid" },
      },
      LeaderboardSort: {
        name: "sortBy",
        in: "query",
        description: "Rank by total paid, or by extra paid beyond the monthly bills",
        schema: { type: "string", enum: ["total", "extra"], default: "total" },
      },
    },
    schemas: {
      Message: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
      Error: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
      ValidationError: {
        type: "object",
        required: ["message", "errors"],
        properties: {
          message: { type: "string", example: "Invalid request" },
          errors: {
            type: "array",
            items: {
              type: "object",
              required: ["field", "message"],
              properties: {
                field: { type: "string", example: "token" },
                message: { type: "string", example: "Token must be 20 digits" },
              },
            },
          },
        },
      },
      User: {
        type: "object",
        required: ["id", "email", "firstName", "lastName"],
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          firstName: { type: ["string", "null"] },
          lastName: { type: ["string", "null"] },
        },
      },
      AuthResponse: {
        type: "object",
        required: ["message", "token", "user"],
        properties: {
          message: { type: "string" },
          token: { type: "string", description: "JWT, valid for 1 hour" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      PaymentInput: {
        type: "object",
        required: ["amount", "kilowattHours"],
        properties: {
          amount: { type: "number", exclusiveMinimum: 0, description: "Amount paid, in naira" },
          kilowattHours: { type: "number", exclusiveMinimum: 0, description: "Units bought, in kWh" },
          token: {
            type: "string",
            description:
              "Meter token. Must be 20 digits; spaces and dashes are allowed and removed. " +
              "Each token can only be recorded once.",
            example: "1234 5678 9012 3456 7890",
          },
          purchasedAt: {
            type: "string",
            format: "date-time",
            description: "When it was bought. Defaults to now; cannot be in the future.",
          },
          source: {
            type: "string",
            enum: ["RECEIPT", "MANUAL"],
            default: "MANUAL",
            description: "RECEIPT if the values came from a scan, MANUAL if typed in",
          },
        },
      },
      Payment: {
        type: "object",
        required: [
          "id", "amount", "billAmount", "extraAmount", "type",
          "token", "kilowattHours", "source", "hasReceiptImage", "month", "purchasedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          amount: { type: "number", description: "Total paid" },
          billAmount: { type: "number", description: "Part counted toward the monthly bill" },
          extraAmount: { type: "number", description: "Part paid beyond the monthly bill" },
          type: {
            type: "string",
            enum: ["MONTHLY", "ADDITIONAL", "SPLIT"],
            description:
              "MONTHLY: all toward the bill. ADDITIONAL: all extra. SPLIT: partly bill, partly extra.",
          },
          token: { type: ["string", "null"] },
          kilowattHours: { type: "number" },
          source: { type: "string", enum: ["RECEIPT", "MANUAL"] },
          hasReceiptImage: {
            type: "boolean",
            description: "true if a receipt photo was saved; fetch it from GET /subscriptions/{id}/receipt",
          },
          month: { type: "string", pattern: "^\\d{4}-\\d{2}$", example: "2026-10" },
          purchasedAt: { type: "string", format: "date-time" },
        },
      },
      BillStatus: {
        type: "string",
        enum: ["PENDING", "PAID", "LATE"],
        description:
          "PENDING: current month, not fully paid. PAID: fully paid. LATE: a past month that was never fully paid.",
      },
      BillSummary: {
        type: "object",
        required: ["id", "month", "amountDue", "status", "paidAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          month: { type: "string", pattern: "^\\d{4}-\\d{2}$", example: "2026-10" },
          amountDue: { type: "number" },
          status: { $ref: "#/components/schemas/BillStatus" },
          paidAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      Bill: {
        type: "object",
        required: ["id", "month", "amountDue", "amountPaid", "remaining", "status", "paidAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          month: { type: "string", pattern: "^\\d{4}-\\d{2}$", example: "2026-10" },
          amountDue: { type: "number" },
          amountPaid: { type: "number", description: "Total of billAmount across this month's payments" },
          remaining: { type: "number", description: "Still owed; 0 when paid" },
          status: { $ref: "#/components/schemas/BillStatus" },
          paidAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      LeaderboardEntry: {
        type: "object",
        required: ["rank", "name", "isMe", "totalPaid", "billPaid", "extraPaid", "payments"],
        properties: {
          rank: { type: "integer", minimum: 1, description: "Equal amounts share a rank" },
          name: { type: "string", description: "First and last name, or \"Anonymous\" if not set" },
          isMe: { type: "boolean", description: "true for the logged-in user's row" },
          totalPaid: { type: "number" },
          billPaid: { type: "number", description: "Counted toward monthly bills" },
          extraPaid: { type: "number", description: "Paid beyond the monthly bills" },
          payments: { type: "integer", description: "Number of payments in the period" },
        },
      },
      Leaderboard: {
        type: "object",
        required: ["period", "sortBy", "totals", "entries", "me"],
        properties: {
          period: {
            type: "object",
            required: ["type", "key", "from", "to"],
            properties: {
              type: { type: "string", enum: ["month", "year"] },
              key: { type: "string", examples: ["2026-10", "2026"] },
              from: { type: "string", format: "date-time", description: "Start, inclusive" },
              to: { type: "string", format: "date-time", description: "End, exclusive" },
            },
          },
          sortBy: { type: "string", enum: ["total", "extra"] },
          totals: {
            type: "object",
            required: ["totalPaid", "billPaid", "extraPaid", "payers"],
            properties: {
              totalPaid: { type: "number" },
              billPaid: { type: "number" },
              extraPaid: { type: "number" },
              payers: { type: "integer", description: "Number of people who paid" },
            },
          },
          entries: { type: "array", items: { $ref: "#/components/schemas/LeaderboardEntry" } },
          me: {
            oneOf: [{ $ref: "#/components/schemas/LeaderboardEntry" }, { type: "null" }],
            description: "The logged-in user's row, or null if they paid nothing in the period",
          },
        },
      },
      ReceiptImageLink: {
        type: "object",
        required: ["url", "expiresAt"],
        properties: {
          url: { type: "string", format: "uri", description: "Signed Cloudinary link to the JPEG" },
          expiresAt: { type: "string", format: "date-time", description: "When the link stops working" },
        },
      },
      ScannedReceipt: {
        type: "object",
        required: ["amount", "token", "kilowattHours", "purchasedAt"],
        properties: {
          amount: { type: ["number", "null"] },
          token: { type: ["string", "null"], description: "Digits only" },
          kilowattHours: { type: ["number", "null"] },
          purchasedAt: {
            type: ["string", "null"],
            description: "ISO 8601, e.g. 2026-10-09T14:30:00+01:00, or YYYY-MM-DD if no time was shown",
          },
        },
      },
    },
  },
};
