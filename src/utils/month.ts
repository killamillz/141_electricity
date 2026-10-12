// Billing months are calendar months in Lagos time, written as "YYYY-MM".
export const BILLING_TIMEZONE = "Africa/Lagos";

const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BILLING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
});

export const monthKey = (date: Date): string => {
  const parts = monthFormatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
};

export const currentMonthKey = () => monthKey(new Date());

export const nextMonthKey = (key: string): string => {
  const [year, month] = key.split("-").map(Number) as [number, number];
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, "0")}`;
};

// Months after `from` up to and including `to`, e.g. ("2026-10", "2027-01") → 11, 12, 01
export const monthsAfter = (from: string, to: string): string[] => {
  const months: string[] = [];
  for (let m = nextMonthKey(from); m <= to; m = nextMonthKey(m)) {
    months.push(m);
  }
  return months;
};
