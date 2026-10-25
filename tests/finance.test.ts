import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  calculateFee,
  settle,
  allocate,
  parseMoney,
  deadline,
  type Fee,
  type Draft,
} from "../src/lib/finance";
const base: Fee = {
  amount: 10000,
  hire: 0,
  mode: "package",
  gst: "none",
  classification: "adult_eligible_contractor",
  agreementEvidence: "Original agreed fee",
  hireEvidence: "",
};
const payday = "2026-10-26";
function draft(): Draft {
  return {
    title: "Test",
    performanceDate: "2026-10-23",
    payday,
    basis: "net",
    receipts: [{ id: randomUUID(), label: "Venue", amount: 100000 }],
    expenses: [],
    savings: { mode: "fixed", amount: 0 },
    taxReserve: 0,
    engagements: [],
    drawings: [],
  };
}
describe("contractor arithmetic", () => {
  it.each([
    [{}, 8929, 0, 8929, 1071, 10000],
    [
      { hire: 5000, hireEvidence: "Agreed kit hire" },
      4464,
      0,
      9464,
      536,
      10000,
    ],
    [{ mode: "exclusive" }, 10000, 0, 10000, 1200, 11200],
    [
      { amount: 12200, mode: "cashcap", gst: "uniform" },
      10000,
      1000,
      11000,
      1200,
      12200,
    ],
    [
      {
        amount: 17700,
        hire: 5000,
        hireEvidence: "Agreed kit hire",
        mode: "cashcap",
        gst: "uniform",
      },
      10000,
      1500,
      16500,
      1200,
      17700,
    ],
  ])(
    "matches the supplied acceptance example %j",
    (input, l, g, i, s, total) => {
      const r = calculateFee({ ...base, ...input } as Fee, payday);
      expect([r.labour, r.gst, r.invoice, r.super, r.total]).toEqual([
        l,
        g,
        i,
        s,
        total,
      ]);
    },
  );
  it("preserves every cent without reducing required super across caps", () => {
    for (let cap = 0; cap < 20000; cap += 7) {
      const r = calculateFee(
        { ...base, amount: cap, mode: "cashcap", gst: "uniform" },
        payday,
      );
      expect(r.invoice + r.super + r.residual).toBe(cap);
      expect(r.super).toBe(r.requiredSuper);
      expect(r.residual).toBeGreaterThanOrEqual(0);
      expect(r.residual).toBeLessThan(3);
    }
  });
  it("discloses residual rather than assuming provider accepts it", () => {
    let found = false;
    for (let amount = 1; amount < 100; amount++) {
      const r = calculateFee({ ...base, amount }, payday);
      if (r.residual) {
        found = true;
        const adjusted = calculateFee({ ...base, amount }, payday, true);
        expect(adjusted.super).toBe(r.super + r.residual);
        expect(adjusted.residual).toBe(0);
      }
    }
    expect(found).toBe(true);
  });
  it.each([
    { amount: -1 },
    { amount: 1.2 },
    { amount: Infinity },
    { amount: Number.MAX_SAFE_INTEGER },
    { gst: "mixed" },
    { classification: "employee" },
    { classification: "under_18" },
    { classification: "unresolved" },
    { hire: 20000 },
    { hire: 100, hireEvidence: "" },
    { agreementEvidence: "" },
  ])("rejects unsafe input %j", (input) =>
    expect(() => calculateFee({ ...base, ...input } as Fee, payday)).toThrow(),
  );
  it("does not interpret malformed decimals or binary floating point as currency", () => {
    expect(parseMoney("123.45")).toBe(12345);
    for (const s of [
      "1.001",
      "1e3",
      "-2",
      "NaN",
      " 1",
      "100000000000000000000",
    ])
      expect(() => parseMoney(s)).toThrow();
  });
  it("blocks unsupported dates and invalid calendar dates", () => {
    for (const date of ["2026-02-30", "2025-10-20", "2027-07-01"])
      expect(() => calculateFee(base, date)).toThrow();
  });
});
describe("whole gig settlement", () => {
  it("does not deduct venue withheld costs twice from net receipts", () => {
    const d = draft();
    d.expenses = [
      {
        id: randomUUID(),
        label: "Withheld",
        amount: 20000,
        paidBy: "venue",
        personId: null,
        reimbursed: false,
      },
    ];
    expect(settle(d).balance).toBe(100000);
    d.basis = "gross";
    expect(settle(d).balance).toBe(80000);
  });
  it("personal payment creates one expense and an outstanding reimbursement", () => {
    const d = draft();
    d.expenses = [
      {
        id: randomUUID(),
        label: "Advertising",
        amount: 15000,
        paidBy: "person",
        personId: randomUUID(),
        reimbursed: false,
      },
    ];
    const r = settle(d);
    expect(r.balance).toBe(85000);
    expect(r.reimbursements[0].outstanding).toBe(15000);
    expect(r.upcomingCashBeforeRecordedTransfers).toBe(15000);
    d.expenses[0].reimbursed = true;
    expect(settle(d).upcomingCashBeforeRecordedTransfers).toBe(0);
    expect(settle(d).balance).toBe(85000);
  });
  it("counts crew once and includes their GST and super", () => {
    const d = draft();
    d.engagements = [
      {
        ...base,
        id: randomUUID(),
        personId: randomUUID(),
        name: "Crew",
        role: "Sound",
        category: "crew",
        allocation: "fixed",
        weight: 100,
        mode: "exclusive",
        gst: "uniform",
      },
    ];
    const r = settle(d);
    expect(r.crewCost).toBe(12200);
    expect(r.balance).toBe(87800);
    expect(r.superTotal).toBe(1200);
  });
  it("uses explicit savings basis after crew, costs and tax reserve", () => {
    const d = draft();
    d.expenses = [
      {
        id: randomUUID(),
        label: "Supplier",
        amount: 10000,
        paidBy: "band",
        personId: null,
        reimbursed: false,
      },
    ];
    d.taxReserve = 10000;
    d.savings = { mode: "percent", amount: 1000 };
    expect(settle(d).savings).toBe(8000);
  });
  it("preserves fixed fees when funds are insufficient", () => {
    const d = draft();
    d.receipts[0].amount = 100;
    d.engagements = [
      {
        ...base,
        id: randomUUID(),
        personId: randomUUID(),
        name: "Fixed",
        role: "Guitar",
        category: "musician",
        allocation: "fixed",
        weight: 1,
        mode: "exclusive",
      },
    ];
    const r = settle(d);
    expect(r.allocations[0].invoice).toBe(10000);
    expect(r.balance).toBe(-11100);
  });
  it("allocates the remaining pool including GST and super within the cap", () => {
    const d = draft();
    d.engagements = [
      {
        ...base,
        id: randomUUID(),
        personId: randomUUID(),
        name: "Share",
        role: "Keys",
        category: "musician",
        allocation: "share",
        weight: 1,
        mode: "cashcap",
        gst: "uniform",
      },
    ];
    d.drawings = [
      {
        id: randomUUID(),
        personId: randomUUID(),
        name: "Partner",
        allocation: "share",
        amount: 0,
        weight: 1,
      },
    ];
    const r = settle(d);
    expect(r.balance).toBe(0);
    expect(r.allocations[0].budget).toBe(50000);
    expect(r.drawingsTotal).toBe(50000);
  });
  it("rejects duplicate people and crew sharing", () => {
    const d = draft();
    const e = {
      ...base,
      id: randomUUID(),
      personId: randomUUID(),
      name: "Test",
      role: "Sound",
      category: "crew" as const,
      allocation: "fixed" as const,
      weight: 1,
    };
    d.engagements = [e, { ...e, id: randomUUID() }];
    expect(() => settle(d)).toThrow();
    d.engagements = [{ ...e, allocation: "share" }];
    expect(() => settle(d)).toThrow();
  });
});
describe("deterministic cent allocation", () => {
  it("conserves cents and uses stable IDs for ties regardless of input ordering", () => {
    const recipients = [
      { id: "c", weight: 1 },
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
    ];
    expect(allocate(100, recipients)).toEqual([
      { id: "c", amount: 33 },
      { id: "a", amount: 34 },
      { id: "b", amount: 33 },
    ]);
    expect(
      allocate(100, [...recipients].reverse()).find((x) => x.id === "a")
        ?.amount,
    ).toBe(34);
  });
  it("handles large products without unsafe number multiplication", () =>
    expect(
      allocate(1e9, [
        { id: "a", weight: 10000 },
        { id: "b", weight: 9999 },
      ]).reduce((s, r) => s + r.amount, 0),
    ).toBe(1e9));
  it("rejects negative pools and duplicate IDs", () => {
    expect(() => allocate(-1, [])).toThrow();
    expect(() =>
      allocate(10, [
        { id: "a", weight: 1 },
        { id: "a", weight: 1 },
      ]),
    ).toThrow();
  });
});
describe("deadline calculation", () => {
  const calendar = {
    reviewed: true,
    version: "test-only",
    from: "2026-10-01",
    to: "2026-12-31",
    holidays: ["2026-11-03"],
  };
  it("skips weekends and supplied holidays", () =>
    expect(deadline("2026-10-26", calendar, 2)).toEqual({
      statutoryDueDate: "2026-11-05",
      operationalTarget: "2026-11-02",
      calendarVersion: "test-only",
    }));
  it("fails closed without reviewed coverage", () => {
    expect(() =>
      deadline("2026-10-26", { ...calendar, reviewed: false }, 2),
    ).toThrow();
    expect(() => deadline("2026-12-30", calendar, 2)).toThrow();
  });
});
