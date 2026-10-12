import { prisma } from "../config/database.js";
import { Prisma, type MonthlyBill } from "../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";
import { currentMonthKey, monthKey, monthsAfter } from "../utils/month.js";

type Tx = Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);

// Allow a little clock drift between the user's device and the server
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export interface PaymentInput {
  amount: number;
  kilowattHours: number;
  token?: string | undefined;
  purchasedAt?: Date | undefined;
  source?: "RECEIPT" | "MANUAL" | undefined;
}

/**
 * Creates any missing bills from the user's last bill up to the current month,
 * then marks unpaid bills from past months as LATE.
 * Bills only start once an admin has set a monthly amount (which creates the first bill).
 */
export const ensureBillsUpToDate = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { monthlyAmount: true },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  const current = currentMonthKey();

  if (user.monthlyAmount) {
    const latest = await prisma.monthlyBill.findFirst({
      where: { userId },
      orderBy: { month: "desc" },
      select: { month: true },
    });

    if (latest) {
      const missing = monthsAfter(latest.month, current);

      if (missing.length > 0) {
        await prisma.monthlyBill.createMany({
          data: missing.map((month) => ({
            userId,
            month,
            amountDue: user.monthlyAmount!,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  await prisma.monthlyBill.updateMany({
    where: { userId, status: "PENDING", month: { lt: current } },
    data: { status: "LATE" },
  });
};

/**
 * Finds the bill for a month, creating it if the user is on a monthly plan.
 * Returns null when the payment can't count toward any bill: no plan,
 * or a month before the user's plan started.
 */
const findOrCreateBill = async (
  tx: Tx,
  userId: string,
  month: string,
  monthlyAmount: Prisma.Decimal | null,
): Promise<MonthlyBill | null> => {
  const existing = await tx.monthlyBill.findUnique({
    where: { userId_month: { userId, month } },
  });

  if (existing) return existing;
  if (!monthlyAmount) return null;

  const first = await tx.monthlyBill.findFirst({
    where: { userId },
    orderBy: { month: "asc" },
    select: { month: true },
  });

  if (first && month < first.month) return null;

  return tx.monthlyBill.upsert({
    where: { userId_month: { userId, month } },
    create: { userId, month, amountDue: monthlyAmount },
    update: {},
  });
};

const billSummary = (bill: MonthlyBill | null) =>
  bill && {
    id: bill.id,
    month: bill.month,
    amountDue: bill.amountDue.toNumber(),
    status: bill.status,
    paidAt: bill.paidAt,
  };

const sumBillPayments = async (tx: Tx, billId: string) => {
  const { _sum } = await tx.subscription.aggregate({
    where: { billId },
    _sum: { billAmount: true },
  });
  return _sum.billAmount ?? ZERO;
};

/**
 * Records a payment. Up to the amount still owed on that month's bill counts
 * toward the bill; anything beyond it is recorded as an extra payment.
 */
export const recordPayment = async (userId: string, input: PaymentInput) => {
  const purchasedAt = input.purchasedAt ?? new Date();

  if (purchasedAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
    throw new AppError(400, "Purchase date cannot be in the future");
  }

  if (input.token) {
    const duplicate = await prisma.subscription.findUnique({
      where: { token: input.token },
      select: { id: true },
    });

    if (duplicate) {
      throw new AppError(409, "This token has already been recorded");
    }
  }

  const month = monthKey(purchasedAt);
  const amount = new Prisma.Decimal(input.amount);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { monthlyAmount: true },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    let bill = await findOrCreateBill(tx, userId, month, user.monthlyAmount);
    let billAmount = ZERO;

    if (bill) {
      // Lock the bill row so two payments at the same moment can't both
      // claim the same remaining balance.
      await tx.$queryRaw`SELECT id FROM "MonthlyBill" WHERE id = ${bill.id} FOR UPDATE`;

      const alreadyPaid = await sumBillPayments(tx, bill.id);
      const remaining = Prisma.Decimal.max(
        bill.amountDue.minus(alreadyPaid),
        ZERO,
      );
      billAmount = Prisma.Decimal.min(amount, remaining);

      if (
        bill.status !== "PAID" &&
        alreadyPaid.plus(billAmount).gte(bill.amountDue)
      ) {
        bill = await tx.monthlyBill.update({
          where: { id: bill.id },
          data: { status: "PAID", paidAt: purchasedAt },
        });
      }
    }

    const payment = await tx.subscription.create({
      data: {
        userId,
        amount,
        billAmount,
        kilowattHours: new Prisma.Decimal(input.kilowattHours),
        token: input.token ?? null,
        purchasedAt,
        source: input.source ?? "MANUAL",
        billId: billAmount.gt(0) && bill ? bill.id : null,
      },
    });

    return { payment: formatPayment(payment), bill: billSummary(bill) };
  });
};

type PaymentRow = Prisma.SubscriptionGetPayload<object>;

export const formatPayment = (p: PaymentRow) => {
  const extraAmount = p.amount.minus(p.billAmount);

  return {
    id: p.id,
    amount: p.amount.toNumber(),
    billAmount: p.billAmount.toNumber(), // counted toward the monthly bill
    extraAmount: extraAmount.toNumber(), // additional payment beyond the bill
    type: p.billAmount.isZero()
      ? "ADDITIONAL"
      : extraAmount.isZero()
        ? "MONTHLY"
        : "SPLIT",
    token: p.token,
    kilowattHours: p.kilowattHours.toNumber(),
    source: p.source,
    month: monthKey(p.purchasedAt),
    purchasedAt: p.purchasedAt,
  };
};

export const listPayments = async (userId: string) => {
  const payments = await prisma.subscription.findMany({
    where: { userId },
    orderBy: { purchasedAt: "desc" },
  });

  return payments.map(formatPayment);
};

export const listBills = async (userId: string) => {
  await ensureBillsUpToDate(userId);

  const bills = await prisma.monthlyBill.findMany({
    where: { userId },
    orderBy: { month: "desc" },
    include: { payments: { select: { billAmount: true } } },
  });

  return bills.map((bill) => {
    const amountPaid = bill.payments.reduce(
      (sum, p) => sum.plus(p.billAmount),
      ZERO,
    );

    return {
      id: bill.id,
      month: bill.month,
      amountDue: bill.amountDue.toNumber(),
      amountPaid: amountPaid.toNumber(),
      remaining: Prisma.Decimal.max(
        bill.amountDue.minus(amountPaid),
        ZERO,
      ).toNumber(),
      status: bill.status,
      paidAt: bill.paidAt,
    };
  });
};

/**
 * Sets (or removes, with null) a user's monthly amount. Also creates this
 * month's bill, or updates it if it isn't paid yet, so the change applies now.
 */
export const setMonthlyAmount = async (
  userId: string,
  monthlyAmount: number | null,
) => {
  const month = currentMonthKey();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    const amount =
      monthlyAmount === null ? null : new Prisma.Decimal(monthlyAmount);

    await tx.user.update({
      where: { id: userId },
      data: { monthlyAmount: amount },
    });

    const bill = await tx.monthlyBill.findUnique({
      where: { userId_month: { userId, month } },
    });

    // Plan removed: drop this month's bill if nothing has been paid toward it
    if (!amount) {
      if (bill && bill.status !== "PAID") {
        const paid = await sumBillPayments(tx, bill.id);
        if (paid.isZero()) {
          await tx.monthlyBill.delete({ where: { id: bill.id } });
        }
      }
      return { monthlyAmount: null, currentBill: null };
    }

    if (!bill) {
      const created = await tx.monthlyBill.create({
        data: { userId, month, amountDue: amount },
      });
      return {
        monthlyAmount: amount.toNumber(),
        currentBill: billSummary(created),
      };
    }

    if (bill.status === "PAID") {
      return {
        monthlyAmount: amount.toNumber(),
        currentBill: billSummary(bill),
      };
    }

    // Unpaid bill: apply the new amount, and mark it paid if it's now covered
    const paid = await sumBillPayments(tx, bill.id);
    const updated = await tx.monthlyBill.update({
      where: { id: bill.id },
      data: paid.gte(amount)
        ? { amountDue: amount, status: "PAID", paidAt: new Date() }
        : { amountDue: amount },
    });

    return {
      monthlyAmount: amount.toNumber(),
      currentBill: billSummary(updated),
    };
  });
};
