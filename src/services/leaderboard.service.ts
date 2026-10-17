import { prisma } from "../config/database.js";
import { Prisma } from "../generated/prisma/client.js";
import { monthStart, nextMonthKey } from "../utils/month.js";

const ZERO = new Prisma.Decimal(0);

export type LeaderboardSort = "total" | "extra";

export type LeaderboardPeriod =
  | { type: "month"; key: string } // "2026-10"
  | { type: "year"; key: string }; // "2026"

// [from, to) in Lagos time
const periodRange = (period: LeaderboardPeriod) =>
  period.type === "month"
    ? { from: monthStart(period.key), to: monthStart(nextMonthKey(period.key)) }
    : {
        from: monthStart(`${period.key}-01`),
        to: monthStart(`${Number(period.key) + 1}-01`),
      };

const displayName = (firstName: string | null, lastName: string | null) =>
  [firstName, lastName].filter(Boolean).join(" ") || "Anonymous";

/**
 * Everyone who paid in the period, ranked by total paid (or by extra paid).
 * Only names and amounts are shown, never emails. Users with the same
 * amount share a rank.
 */
export const getLeaderboard = async (
  period: LeaderboardPeriod,
  sortBy: LeaderboardSort,
  viewerId: string,
) => {
  const { from, to } = periodRange(period);

  const sums = await prisma.subscription.groupBy({
    by: ["userId"],
    where: { purchasedAt: { gte: from, lt: to } },
    _sum: { amount: true, billAmount: true },
    _count: { _all: true },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: sums.map((s) => s.userId) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const usersById = new Map(users.map((u) => [u.id, u]));

  const rows = sums.map((s) => {
    const total = s._sum.amount ?? ZERO;
    const bill = s._sum.billAmount ?? ZERO;
    const user = usersById.get(s.userId);

    return {
      name: displayName(user?.firstName ?? null, user?.lastName ?? null),
      isMe: s.userId === viewerId,
      total,
      bill,
      extra: total.minus(bill),
      payments: s._count._all,
    };
  });

  const score = (r: (typeof rows)[number]) =>
    sortBy === "extra" ? r.extra : r.total;

  rows.sort((a, b) => score(b).comparedTo(score(a)) || a.name.localeCompare(b.name));

  let rank = 0;

  const ranked = rows.map((r, i) => {
    const prev = rows[i - 1];
    if (!prev || !score(prev).equals(score(r))) rank = i + 1;

    return {
      rank,
      name: r.name,
      isMe: r.isMe,
      totalPaid: r.total.toNumber(),
      billPaid: r.bill.toNumber(), // counted toward monthly bills
      extraPaid: r.extra.toNumber(), // paid beyond the bills
      payments: r.payments,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      totalPaid: acc.totalPaid.plus(r.total),
      billPaid: acc.billPaid.plus(r.bill),
      extraPaid: acc.extraPaid.plus(r.extra),
    }),
    { totalPaid: ZERO, billPaid: ZERO, extraPaid: ZERO },
  );

  return {
    period: { type: period.type, key: period.key, from, to },
    sortBy,
    totals: {
      totalPaid: totals.totalPaid.toNumber(),
      billPaid: totals.billPaid.toNumber(),
      extraPaid: totals.extraPaid.toNumber(),
      payers: rows.length,
    },
    entries: ranked,
    me: ranked.find((e) => e.isMe) ?? null,
  };
};
