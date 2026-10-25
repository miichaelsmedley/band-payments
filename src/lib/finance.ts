import { z } from "zod";

export const RULE_VERSION = "au-contractor-2026.1";
export const MAX_CENTS = 1_000_000_000;
const cents = z.number().int().min(0).max(MAX_CENTS);
const id = z.string().uuid();
export const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Use a valid calendar date");
export const feeSchema = z
  .object({
    amount: cents,
    hire: cents,
    mode: z.enum(["package", "cashcap", "exclusive"]),
    gst: z.enum(["none", "uniform", "mixed"]),
    classification: z.enum([
      "adult_eligible_contractor",
      "unresolved",
      "employee",
      "under_18",
      "other",
    ]),
    agreementEvidence: z.string().max(2000),
    hireEvidence: z.string().max(2000),
  })
  .strict();
export const engagementSchema = feeSchema
  .extend({
    id,
    personId: id,
    name: z.string().min(1).max(120),
    role: z.string().min(1).max(100),
    category: z.enum(["musician", "crew"]),
    allocation: z.enum(["fixed", "share"]),
    weight: z.number().int().min(1).max(10000),
  })
  .strict();
export const draftSchema = z
  .object({
    title: z.string().min(1).max(120),
    performanceDate: localDate,
    payday: localDate,
    basis: z.enum(["gross", "net"]),
    receipts: z
      .array(
        z
          .object({ id, label: z.string().min(1).max(120), amount: cents })
          .strict(),
      )
      .min(1)
      .max(100),
    expenses: z
      .array(
        z
          .object({
            id,
            label: z.string().min(1).max(120),
            amount: cents,
            paidBy: z.enum(["band", "venue", "unpaid", "person"]),
            personId: id.nullable(),
            reimbursed: z.boolean(),
          })
          .strict(),
      )
      .max(100),
    savings: z
      .object({ mode: z.enum(["fixed", "percent"]), amount: cents })
      .strict(),
    taxReserve: cents,
    engagements: z.array(engagementSchema).max(100),
    drawings: z
      .array(
        z
          .object({
            id,
            personId: id,
            name: z.string().min(1).max(120),
            allocation: z.enum(["fixed", "share"]),
            amount: cents,
            weight: z.number().int().min(1).max(10000),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type Draft = z.infer<typeof draftSchema>;
export type Engagement = z.infer<typeof engagementSchema>;
export type Fee = z.infer<typeof feeSchema>;
export class FinanceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: string, message: string): never {
  throw new FinanceError(code, message);
}
function bounded(value: bigint): number {
  if (value < 0n || value > BigInt(MAX_CENTS))
    fail("amount_range", "Amount exceeds the supported range.");
  return Number(value);
}
export const sum = (values: number[]) =>
  bounded(values.reduce((a, b) => a + BigInt(b), 0n));
export function parseMoney(text: string): number {
  if (!/^\d+(\.\d{0,2})?$/.test(text))
    fail(
      "invalid_money",
      "Enter a positive amount with at most two decimal places.",
    );
  const [whole, fraction = ""] = text.split(".");
  return bounded(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
}
export const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    value / 100,
  );
export const roundRate = (value: number, basisPoints: number) =>
  bounded((BigInt(value) * BigInt(basisPoints) + 5000n) / 10000n);
export function rateFor(payday: string) {
  localDate.parse(payday);
  if (payday < "2026-07-01" || payday > "2027-06-30")
    fail(
      "rule_review",
      "This payday needs an effective-date rule review. Historical arrears are not supported.",
    );
  return {
    basisPoints: 1200,
    effectiveFrom: "2025-07-01",
    version: RULE_VERSION,
  };
}
export function calculateFee(
  input: Fee,
  payday: string,
  adjustmentSupported = false,
) {
  const f = feeSchema.strip().parse(input);
  const rate = rateFor(payday);
  if (f.classification !== "adult_eligible_contractor")
    fail(
      "classification_review",
      "Confirm standard adult eligible-contractor treatment before calculating.",
    );
  if (f.gst === "mixed")
    fail("mixed_gst", "Mixed GST lines need a separate tax review.");
  if (!f.agreementEvidence.trim())
    fail("agreement_missing", "Record the original agreement and fee basis.");
  if (f.hire > 0 && !f.hireEvidence.trim())
    fail(
      "hire_evidence",
      "Genuine hire requires supporting agreement evidence.",
    );
  if (f.hire > f.amount)
    fail("hire_exceeds_fee", "Hire cannot exceed the agreed amount.");
  const tax = (n: number) => (f.gst === "uniform" ? roundRate(n, 1000) : 0);
  const sg = (n: number) => roundRate(n, rate.basisPoints);
  let labour = f.amount - f.hire;
  let residual = 0;
  if (f.mode !== "exclusive") {
    const cost = (l: number) =>
      sum([l, f.hire, sg(l), f.mode === "cashcap" ? tax(l + f.hire) : 0]);
    if (cost(0) > f.amount)
      fail("hire_exceeds_cap", "Hire including GST exceeds the cash cap.");
    let lo = 0,
      hi = labour;
    while (lo < hi) {
      const mid = lo + Math.ceil((hi - lo) / 2);
      if (cost(mid) <= f.amount) lo = mid;
      else hi = mid - 1;
    }
    labour = lo;
    residual = f.amount - cost(labour);
  }
  const gst = tax(labour + f.hire);
  const requiredSuper = sg(labour);
  const superAdjustment = adjustmentSupported ? residual : 0;
  const superAmount = requiredSuper + superAdjustment;
  const invoice = sum([labour, f.hire, gst]);
  return {
    labour,
    hire: f.hire,
    gst,
    requiredSuper,
    superAdjustment,
    super: superAmount,
    invoice,
    residual: adjustmentSupported ? 0 : residual,
    total: sum([invoice, superAmount]),
    budget: sum([invoice, superAmount, adjustmentSupported ? 0 : residual]),
    ruleVersion: rate.version,
    sgBasisPoints: rate.basisPoints,
  };
}
export function allocate(
  pool: number,
  recipients: { id: string; weight: number }[],
) {
  cents.parse(pool);
  if (!recipients.length) return [];
  if (new Set(recipients.map((r) => r.id)).size !== recipients.length)
    fail("duplicate_recipient", "Duplicate allocation recipient.");
  recipients.forEach((r) => z.number().int().min(1).max(10000).parse(r.weight));
  const totalWeight = recipients.reduce((a, r) => a + BigInt(r.weight), 0n);
  const rows = recipients.map((r) => ({
    id: r.id,
    amount: Number((BigInt(pool) * BigInt(r.weight)) / totalWeight),
    remainder: (BigInt(pool) * BigInt(r.weight)) % totalWeight,
  }));
  const remaining = pool - sum(rows.map((r) => r.amount));
  [...rows]
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.id < b.id
          ? -1
          : 1
        : a.remainder > b.remainder
          ? -1
          : 1,
    )
    .slice(0, remaining)
    .forEach((r) => r.amount++);
  return rows.map(({ id, amount }) => ({ id, amount }));
}
export function settle(input: Draft) {
  const d = draftSchema.parse(input);
  rateFor(d.payday);
  const allIds = [
    ...d.receipts,
    ...d.expenses,
    ...d.engagements,
    ...d.drawings,
  ].map((x) => x.id);
  if (new Set(allIds).size !== allIds.length)
    fail("duplicate_line", "Every settlement line needs a unique ID.");
  if (
    new Set(d.engagements.map((e) => e.personId)).size !== d.engagements.length
  )
    fail("duplicate_engagement", "Enter each musician or crew member once.");
  if (
    d.engagements.some((e) => e.category === "crew" && e.allocation === "share")
  )
    fail(
      "crew_share",
      "Crew must have a fixed agreed fee before distributing the pool.",
    );
  if (
    d.engagements.some((e) => e.allocation === "share" && e.mode !== "cashcap")
  )
    fail(
      "share_mode",
      "Shares must include GST and super within their cash cap.",
    );
  if (d.expenses.some((e) => e.paidBy === "person" && !e.personId))
    fail(
      "reimbursement_person",
      "Select the person who paid each personal expense.",
    );
  if (d.savings.mode === "percent" && d.savings.amount > 10000)
    fail("savings_percent", "Savings cannot exceed 100%.");
  const revenue = sum(d.receipts.map((r) => r.amount));
  const venueWithheld = sum(
    d.expenses.filter((e) => e.paidBy === "venue").map((e) => e.amount),
  );
  const supplierCost = sum(
    d.expenses
      .filter((e) => !(d.basis === "net" && e.paidBy === "venue"))
      .map((e) => e.amount),
  );
  const fixed = d.engagements
    .filter((e) => e.allocation === "fixed")
    .map((e) => ({
      id: e.id,
      personId: e.personId,
      category: e.category,
      ...calculateFee(e, d.payday),
    }));
  const crewCost = sum(
    fixed.filter((e) => e.category === "crew").map((e) => e.budget),
  );
  const reserveBase = revenue - supplierCost - crewCost - d.taxReserve;
  const savings =
    d.savings.mode === "fixed"
      ? d.savings.amount
      : roundRate(Math.max(0, reserveBase), d.savings.amount);
  const fixedMusicians = sum(
    fixed.filter((e) => e.category === "musician").map((e) => e.budget),
  );
  const fixedDrawings = sum(
    d.drawings.filter((e) => e.allocation === "fixed").map((e) => e.amount),
  );
  const pool = reserveBase - savings - fixedMusicians - fixedDrawings;
  const shared = [
    ...d.engagements.filter((e) => e.allocation === "share"),
    ...d.drawings.filter((e) => e.allocation === "share"),
  ];
  // Fixed fees remain unchanged on a shortfall. Shared allocations cannot be proposed.
  const shares = pool >= 0 ? allocate(pool, shared) : [];
  const allocations = [
    ...fixed,
    ...d.engagements
      .filter((e) => e.allocation === "share")
      .map((e) => ({
        id: e.id,
        personId: e.personId,
        category: e.category,
        ...(pool >= 0
          ? calculateFee(
              { ...e, amount: shares.find((s) => s.id === e.id)!.amount },
              d.payday,
            )
          : calculateFee({ ...e, amount: e.hire, hire: 0 }, d.payday)),
      })),
  ];
  if (pool < 0 && shared.length)
    fail(
      "insufficient_pool",
      "Fixed commitments exceed receipts. Add funding or review costs; fixed fees have been preserved.",
    );
  const drawings = d.drawings.map((e) => ({
    id: e.id,
    personId: e.personId,
    amount:
      e.allocation === "fixed"
        ? e.amount
        : (shares.find((s) => s.id === e.id)?.amount ?? 0),
  }));
  const reimbursements = d.expenses
    .filter((e) => e.paidBy === "person")
    .map((e) => ({
      expenseId: e.id,
      personId: e.personId!,
      amount: e.amount,
      outstanding: e.reimbursed ? 0 : e.amount,
    }));
  const invoiceTotal = sum(allocations.map((e) => e.invoice));
  const superTotal = sum(allocations.map((e) => e.super));
  const residual = sum(allocations.map((e) => e.residual));
  const drawingsTotal = sum(drawings.map((e) => e.amount));
  const balance =
    revenue -
    supplierCost -
    savings -
    d.taxReserve -
    invoiceTotal -
    superTotal -
    residual -
    drawingsTotal;
  const unpaidSuppliers = sum(
    d.expenses.filter((e) => e.paidBy === "unpaid").map((e) => e.amount),
  );
  return {
    currency: "AUD",
    ruleVersion: RULE_VERSION,
    sgBasisPoints: 1200,
    revenue,
    venueWithheld,
    supplierCost,
    crewCost,
    reserveBase,
    savings,
    taxReserve: d.taxReserve,
    pool,
    allocations,
    drawings,
    reimbursements,
    invoiceTotal,
    superTotal,
    residual,
    drawingsTotal,
    balance,
    upcomingCashBeforeRecordedTransfers: sum([
      invoiceTotal,
      superTotal,
      drawingsTotal,
      unpaidSuppliers,
      ...reimbursements.map((e) => e.outstanding),
    ]),
    warnings: [
      ...(balance < 0
        ? ["Funding shortfall. Fixed fees have not been reduced."]
        : []),
      ...(residual > 0
        ? [
            "Rounding residual requires review; provider adjustment support is unconfirmed.",
          ]
        : []),
    ],
  };
}
export type Settlement = ReturnType<typeof settle>;
export function deadline(
  payday: string,
  calendar: {
    reviewed: boolean;
    version: string;
    from: string;
    to: string;
    holidays: string[];
  },
  leadBusinessDays: number,
) {
  localDate.parse(payday);
  if (
    !calendar.reviewed ||
    !calendar.version ||
    payday < calendar.from ||
    payday > calendar.to
  )
    fail(
      "calendar_review",
      "A reviewed holiday calendar is required before confirming the deadline.",
    );
  z.number().int().min(0).max(7).parse(leadBusinessDays);
  calendar.holidays.forEach((h) => localDate.parse(h));
  const date = new Date(`${payday}T12:00:00Z`),
    days: string[] = [];
  while (days.length < 7) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.toISOString().slice(0, 10);
    if (day > calendar.to)
      fail(
        "calendar_review",
        "Holiday calendar does not cover the complete deadline.",
      );
    if (![0, 6].includes(date.getUTCDay()) && !calendar.holidays.includes(day))
      days.push(day);
  }
  return {
    statutoryDueDate: days[6],
    operationalTarget:
      leadBusinessDays === 7 ? payday : days[6 - leadBusinessDays],
    calendarVersion: calendar.version,
  };
}
