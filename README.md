# Electricity Billing Backend

An Express + TypeScript API for tracking prepaid electricity purchases against a monthly amount.

An admin sets how much each user should pay per month. Users record their electricity purchases, either by typing them in or by uploading a photo of the receipt, which Claude reads. Each purchase counts toward that month's bill, and anything beyond the monthly amount is recorded as an extra payment. Bills show as `PAID`, `PENDING` or `LATE`.

**Interactive API docs:** run the server and open [`http://localhost:5000/api/docs`](http://localhost:5000/api/docs). The raw OpenAPI spec is at `/api/docs.json`.

---

## Contents

- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [Process flows](#process-flows)
- [API overview](#api-overview)
- [Errors](#errors)
- [Known limitations](#known-limitations)

---

## Tech stack

| Area | Choice |
|---|---|
| Runtime | Node.js, TypeScript (ES modules) |
| Web framework | Express 5. Errors thrown in async handlers go straight to the error middleware, so controllers have no try/catch. |
| Database | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`) |
| Auth | JWT bearer tokens (`jsonwebtoken`), bcrypt password hashing |
| Validation | Zod |
| Receipt scanning | Claude API (`@anthropic-ai/sdk`), image upload via Multer |
| Docs | OpenAPI 3.1 + Swagger UI |
| Security headers | Helmet, CORS |

---

## Getting started

### 1. Prerequisites

- Node.js 20+
- A PostgreSQL database
- A Claude API key from [console.anthropic.com](https://console.anthropic.com). This is optional: without it, receipt scanning returns a 503 and users enter details by hand.

### 2. Environment variables

Create a `.env` file in this folder:

```env
PORT=5000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/new_electricity
JWT_SECRET=a-long-random-string
ANTHROPIC_API_KEY=sk-ant-...
```

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | No | Port to listen on. Defaults to `5000`. |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Signs login tokens. The server refuses to start without it. |
| `ANTHROPIC_API_KEY` | No | Turns on receipt scanning |

### 3. Install, migrate, run

```bash
npm install
npx prisma generate        # builds the typed DB client into src/generated/prisma
npx prisma migrate deploy  # applies migrations to your database
npm run dev                # starts with auto-reload on http://localhost:5000
```

### 4. Create the first admin

There's no endpoint to make someone an admin. That's deliberate, so nobody can promote themselves. Register normally, then promote the account in the database:

```bash
npm run db:studio   # open the User table and set role to ADMIN
```

or with SQL:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run with auto-reload (nodemon + tsx) |
| `npm run build` | Generate the Prisma client and compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run db:migrate` | Create and apply a new migration after editing `schema.prisma` (needs an interactive terminal) |
| `npm run db:studio` | Browse and edit the database in the browser |

---

## Project structure

```
src/
├── server.ts                  # Loads .env and starts the HTTP server
├── app.ts                     # Express app: middleware, docs, routes, error handling
├── config/
│   ├── database.ts            # Prisma client
│   └── env.ts                 # Required env vars (JWT_SECRET)
├── routes/                    # URL → middleware → controller
│   ├── auth.routes.ts         # /api/auth
│   ├── subscription.routes.ts # /api/subscriptions (payments)
│   ├── bill.routes.ts         # /api/bills
│   └── admin.routes.ts        # /api/admin
├── controllers/               # Read the request, validate it, call a service, send the response
├── services/
│   ├── billing.service.ts     # Payment split, bill creation, late status, monthly amounts
│   └── receipt.service.ts     # Sends receipt images to Claude and parses the result
├── middleware/
│   ├── auth.middleware.ts     # authenticate: checks the JWT, sets req.user
│   ├── admin.middleware.ts    # requireAdmin: checks role in the database
│   ├── upload.middleware.ts   # Multer: one receipt image in memory, 5 MB max
│   └── error.middleware.ts    # notFound + errorHandler: turns every error into JSON
├── docs/openapi.ts            # OpenAPI spec served at /api/docs
├── utils/
│   ├── AppError.ts            # throw new AppError(404, "…") for expected errors
│   ├── month.ts               # "YYYY-MM" month keys in Africa/Lagos time
│   └── jwt.ts                 # Token creation
└── generated/prisma/          # Generated Prisma client (not committed)
prisma/
├── schema.prisma              # Database models
└── migrations/                # SQL migration history
```

A request moves through the app like this:

```mermaid
flowchart LR
    R[Request] --> M[Middleware<br/>helmet, cors, json]
    M --> RT[Router]
    RT --> A[authenticate<br/>requireAdmin<br/>uploadReceipt]
    A --> C[Controller<br/>Zod validation]
    C --> S[Service<br/>business logic]
    S --> DB[(PostgreSQL)]
    S -.-> CL[Claude API]
    C -- throws --> E[errorHandler]
    S -- throws --> E
    E --> J[JSON error response]
```

---

## Data model

```mermaid
erDiagram
    User ||--o{ MonthlyBill : has
    User ||--o{ Subscription : makes
    MonthlyBill |o--o{ Subscription : "paid by"

    User {
        string id
        string email
        UserRole role "USER or ADMIN"
        decimal monthlyAmount "null = no plan"
    }
    MonthlyBill {
        string month "2026-10"
        decimal amountDue "copied from monthlyAmount"
        BillStatus status "PENDING, PAID, LATE"
        datetime paidAt
    }
    Subscription {
        decimal amount "total paid"
        decimal billAmount "part counted toward the bill"
        string token "unique, 20 digits"
        decimal kilowattHours
        PaymentSource source "RECEIPT or MANUAL"
        datetime purchasedAt
    }
```

| Model | What it is |
|---|---|
| **User** | An account. `monthlyAmount` is set by an admin; `null` means no monthly plan. |
| **MonthlyBill** | What a user owes for one month. There's one per user per month. `amountDue` is copied from `monthlyAmount` when the bill is created, so changing the amount later doesn't rewrite past months. |
| **Subscription** | One electricity purchase. `billAmount` is how much of it counted toward the bill; `amount - billAmount` is extra. One purchase is always one row, even when it's split between bill and extra. |

Status lives on the **bill**, not on payments: a month is paid or late, a purchase is just a purchase.

---

## Process flows

### Authentication

```mermaid
sequenceDiagram
    participant C as Client
    participant API
    participant DB
    C->>API: POST /auth/register or /auth/login
    API->>DB: create user / check bcrypt hash
    API-->>C: { token, user }  (JWT, valid 1 hour)
    C->>API: Any request with  Authorization: Bearer <token>
    API->>API: authenticate: verify signature + expiry → req.user.id
    Note over API: Admin routes also run requireAdmin,<br/>which reads the role from the DB
```

Tokens are **stateless**: the server doesn't store them. Logging out means the client deletes its token. The token itself still works until it expires.

### 1. Admin sets a monthly amount

`PATCH /api/admin/users/:id/monthly-amount` with `{ "monthlyAmount": 10000 }`

1. The user's `monthlyAmount` is saved.
2. This month's bill is created if it doesn't exist. This first bill marks the start of the plan.
3. If this month's bill already exists and isn't paid, the new amount applies to it now. If payments already cover the new amount, it becomes `PAID`.
4. Past months keep the amount they were created with.

Sending `null` removes the plan. This month's bill is deleted if nothing has been paid toward it.

### 2. User records a payment

Users can enter a payment in two ways. Both end at the same endpoint, so the billing rules live in one place.

```mermaid
flowchart TD
    subgraph Receipt["Receipt flow"]
        U1[User uploads photo] --> SC[POST /subscriptions/scan]
        SC --> CL[Claude reads receipt]
        CL --> PF[Form pre-filled<br/>unreadable fields = null]
        PF --> CHK[User checks and corrects]
    end
    subgraph Manual["Manual flow"]
        U2[User types details]
    end
    CHK --> SAVE["POST /subscriptions<br/>source: RECEIPT"]
    U2 --> SAVE2["POST /subscriptions<br/>source: MANUAL"]
    SAVE --> REC[recordPayment]
    SAVE2 --> REC
```

**Why the scan doesn't save directly:** Claude can occasionally misread a digit. On a 20-digit token or a money amount, the user must see and confirm the values before anything is stored.

### 3. How a payment is applied to a bill

This is `recordPayment` in `src/services/billing.service.ts`:

```mermaid
flowchart TD
    P[Payment received] --> V{Valid?<br/>amount > 0, token 20 digits,<br/>date not in future,<br/>token not used before}
    V -- no --> X[400 / 409 error]
    V -- yes --> M[Work out its month<br/>from purchasedAt in Africa/Lagos time]
    M --> B{Bill for that month?}
    B -- "no plan, or month is<br/>before the plan started" --> ADD[Whole payment is extra<br/>type: ADDITIONAL]
    B -- yes, find or create it --> L[Lock the bill row]
    L --> R[remaining = amountDue − already paid]
    R --> S[billAmount = min of payment and remaining<br/>extra = payment − billAmount]
    S --> F{Bill now fully paid?}
    F -- yes --> PAID[Mark bill PAID, set paidAt]
    F -- no --> KEEP[Bill stays PENDING or LATE]
    PAID --> SAVE[Save payment]
    KEEP --> SAVE
    ADD --> SAVE
```

**Worked example:** the monthly amount is ₦10,000.

| Payment | Already paid | Counts to bill | Extra | Type | Bill status |
|---|---|---|---|---|---|
| ₦6,000 | ₦0 | ₦6,000 | ₦0 | `MONTHLY` | `PENDING` (₦4,000 left) |
| ₦8,000 | ₦6,000 | ₦4,000 | ₦4,000 | `SPLIT` | **`PAID`** |
| ₦2,000 | ₦10,000 | ₦0 | ₦2,000 | `ADDITIONAL` | `PAID` |

Extra money never carries over to next month. It is recorded as an additional payment for the month it was made.

**Details:**
- **Months follow Lagos time.** A purchase at 00:30 on 1 November in Lagos counts toward November, even though it's still 31 October in UTC.
- **The purchase date decides the month.** A receipt from last month entered today pays last month's bill, and can turn a `LATE` bill into `PAID`.
- **Simultaneous payments:** the bill row is locked during the calculation, so two payments arriving at the same moment can't both claim the same remaining balance.

### 4. Bills, late status and missing months

`GET /api/bills/me` (or the admin equivalent) first brings the user's bills up to date:

1. **Fill gaps.** If the user has a plan, a bill is created for every month between their latest bill and the current month, using their current `monthlyAmount`. A month with no payments still gets a bill, so it can show as late.
2. **Mark late.** Any `PENDING` bill from a past month becomes `LATE`.
3. **Return** each bill with `amountDue`, `amountPaid`, `remaining` and `status`.

| Status | Meaning | Suggested UI |
|---|---|---|
| `PAID` | Fully paid | Green |
| `PENDING` | Current month, not fully paid yet | Neutral or amber |
| `LATE` | A past month that was never fully paid | Red |

### 5. Receipt scanning

`POST /api/subscriptions/scan` (multipart form, image in a field named `receipt`):

1. **Upload:** Multer holds the image in memory, never on disk. JPEG, PNG, WebP or GIF, up to 5 MB.
2. **Claude call:** the image is sent to Claude (`claude-opus-5-5`) with instructions to extract the amount, token, kWh and date.
3. **Structured output:** the response is forced into a fixed schema and validated with Zod, so the result always has the same shape.
4. **No guessing:** Claude is told to return `null` for anything it can't read clearly. A wrong digit is worse than an empty field the user fills in.
5. **Cleanup:** token spaces and dashes are removed. The image is then discarded and not stored.

| Outcome | Response |
|---|---|
| Read successfully | `200` with the extracted fields |
| Not a receipt or unreadable | `422`. The user can enter details manually. |
| No API key, Claude outage or rate limit | `503`. The user can enter details manually. |

---

## API overview

All routes are under `/api`. Full request and response schemas, with examples, are in Swagger at `/api/docs`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | none | Create an account |
| POST | `/auth/login` | none | Log in and get a token |
| POST | `/auth/logout` | user | Log out (the client deletes its token) |
| GET | `/auth/me` | user | Current user |
| POST | `/subscriptions/scan` | user | Read a receipt image (nothing saved) |
| POST | `/subscriptions` | user | Record a payment |
| GET | `/subscriptions/me` | user | My payments, split into bill and extra |
| GET | `/bills/me` | user | My monthly bills |
| PATCH | `/admin/users/:id/monthly-amount` | admin | Set or remove a user's monthly amount |
| GET | `/admin/users/:id/bills` | admin | A user's monthly bills |

### Using Swagger

1. Open `/api/docs`.
2. Run **POST /auth/login** with "Try it out" and copy the `token` from the response.
3. Click **Authorize**, paste the token, and confirm. It's remembered across page reloads.
4. Every protected endpoint can now be called from the page.

### Keeping the docs accurate

The spec is written by hand in `src/docs/openapi.ts`. When you add or change a route, request body or response, update the spec in the same change. To check it against the OpenAPI standard:

```bash
curl -s http://localhost:5000/api/docs.json -o openapi.json
npx @redocly/cli lint openapi.json
```

The spec can also generate a typed client for the frontend, for example with `openapi-typescript`.

---

## Errors

Every error is JSON with a `message`:

```json
{ "message": "This token has already been recorded" }
```

Validation errors also list which fields failed:

```json
{
  "message": "Invalid request",
  "errors": [{ "field": "token", "message": "Token must be 20 digits" }]
}
```

| Status | When |
|---|---|
| 400 | Validation failed, malformed JSON, bad upload |
| 401 | Missing, invalid or expired token; wrong login |
| 403 | Not an admin |
| 404 | Route or record not found |
| 409 | Duplicate email or token |
| 422 | Receipt couldn't be read |
| 500 | Unexpected error. It's logged on the server; details aren't sent to the client. |
| 503 | Receipt scanning unavailable |

To return an error from new code, throw it. `errorHandler` turns it into the response:

```ts
throw new AppError(404, "User not found");
```

---

## Known limitations

- **Payments are self-reported.** Nothing checks a token against the electricity distributor. `token` is unique, so the same receipt can't be used twice, but a made-up receipt would be accepted.
- **Logout doesn't revoke tokens.** They expire after 1 hour.
- **Receipt images aren't stored.** If you need proof of payment later, add file storage such as S3 or Cloudinary.
- **Tokens must be 20 digits**, the standard length for prepaid meter tokens.
- **The docs are public** at `/api/docs`. They describe the API but expose no data. Hide them in production if you prefer.
