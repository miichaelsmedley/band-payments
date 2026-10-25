"use client";
import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  LayoutDashboard,
  Users,
  ReceiptText,
  Landmark,
  History,
  Settings2,
  LogOut,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
  ShieldCheck,
  Clock3,
  CircleAlert,
  X,
  Wallet,
  SlidersHorizontal,
  CalendarDays,
  ChevronDown,
  FileText,
} from "lucide-react";
import { MfaPanel } from "./mfa";
import type {
  AppData,
  ExternalSuper,
  Gig,
  Person,
  PlayerGig,
} from "@/lib/data";
import {
  settle,
  calculateFee,
  money,
  parseMoney,
  type Draft,
  type Settlement,
} from "@/lib/finance";

type Command = (
  action: string,
  fields?: Record<string, unknown>,
  refresh?: boolean,
) => Promise<any>;
const dateText = (v: string) => {
  const date = new Date(v.length === 10 ? `${v}T12:00:00Z` : v);
  return Number.isNaN(date.getTime())
    ? "Choose a date"
    : new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Australia/Melbourne",
      }).format(date);
};
const labelState = (v: string) => v.replaceAll("_", " ");
const SUPER_TIMING =
  "Super must reach the fund within 7 business days after the player is paid (20 for a first contribution to a new person or fund). Business days exclude any state-wide public holiday in Australia.";
const sections = [
  ["settlement", "Gig settlement", LayoutDashboard],
  ["people", "People & invitations", Users],
  ["invoices", "Invoices & transfers", ReceiptText],
  ["payments", "Super contributions", Landmark],
  ["activity", "Activity", History],
  ["settings", "Workspace setup", Settings2],
] as const;
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <AudioLines size={35} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function MoneyField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState((value / 100).toFixed(2)),
    [error, setError] = useState(false);
  return (
    <label>
      {label}
      <span className="money-input">
        <span>$</span>
        <input
          aria-invalid={error}
          disabled={disabled}
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            try {
              onChange(parseMoney(e.target.value));
              setError(false);
            } catch {
              setError(true);
            }
          }}
          onBlur={() => {
            if (!error) setText((value / 100).toFixed(2));
          }}
          required
          pattern="[0-9]+(\.[0-9]{0,2})?"
        />
      </span>
      {error && <small className="error-text">Use dollars and cents.</small>}
    </label>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = ref.current?.querySelector<HTMLElement>(
      "input,textarea,select,button",
    );
    first?.focus();
    return () => {
      document.body.style.overflow = scroll;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const items = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]",
              ) ?? [],
            );
            const first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="card-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Dashboard({ data }: { data: AppData }) {
  const router = useRouter();
  const player = data.role === "player";
  const [tab, setTab] = useState(player ? "mygigs" : "settlement"),
    [selected, setSelected] = useState(data.gigs[0]?.id ?? ""),
    [toast, setToast] = useState(""),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [newGig, setNewGig] = useState(false);
  const gig = data.gigs.find((g) => g.id === selected) ?? data.gigs[0];
  const command: Command = async (action, fields = {}, refresh = true) => {
    setBusy(true);
    setFailure("");
    setToast("");
    try {
      const r = await fetch("/api/v1/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          workspaceId: data.workspace.id,
          ...fields,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error.message);
      if (refresh) router.refresh();
      setToast(
        action === "create_invitation"
          ? "Invitation created. No email sent."
          : action === "record_transfer"
            ? "Transfer recorded by operator. Bank receipt remains unconfirmed."
            : action === "record_external_super"
              ? "Clearing house payment recorded. Fund receipt is not yet confirmed."
              : action === "confirm_external_super_receipt"
                ? "Fund receipt confirmed."
                : "Saved to your workspace.",
      );
      return j.data;
    } catch (e) {
      setFailure((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const safely = (work: () => Promise<unknown>) => {
    void work().catch(() => {});
  };
  const navigation = player
    ? ([
        ["mygigs", "My gigs", LayoutDashboard],
        ["profile", "My details", Users],
        ["settings", "Help & privacy", ShieldCheck],
      ] as const)
    : sections;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="/" className="brand">
          <AudioLines />
          <span>
            band<span className="brand-light">payments</span>
          </span>
        </a>
        <div className="workspace-box">
          <span className="workspace-mark">
            <AudioLines size={22} />
          </span>
          <div>
            <strong>{data.workspace.name}</strong>
            <small>
              {data.local ? "Local test workspace" : "Band workspace"}
            </small>
          </div>
        </div>
        <span className="nav-label">
          {player ? "YOUR PAYMENTS" : "BACKSTAGE DESK"}
        </span>
        <nav aria-label="Main navigation">
          {navigation.map(([key, title, Icon]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setFailure("");
              }}
              aria-current={tab === key ? "page" : undefined}
            >
              <Icon size={18} />
              {title}
              {tab === key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-notice">
            <ShieldCheck size={19} />
            <div>
              Live payments disabled<small>No clearinghouse connected</small>
            </div>
          </div>
          <button
            className="logout"
            onClick={async () => {
              await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "signout" }),
              });
              router.refresh();
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
          <small className="attribution">
            WITH PRIS IN MIND
            <br />
            Identity connection pending
          </small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span>{" "}
            <strong>{navigation.find((x) => x[0] === tab)?.[1]}</strong>
          </span>
          <div>
            <Badge tone="green">AUD</Badge>
            <span className="role-label">{labelState(data.role)}</span>
            <div className="avatar">{player ? "PL" : "BP"}</div>
            <button
              className="icon-button mobile-signout"
              aria-label="Sign out"
              onClick={async () => {
                await fetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "signout" }),
                });
                router.refresh();
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main id="main">
          <div className="environment-banner">
            <span className="status-dot" />
            <strong>
              {data.local ? "Local development" : "Payment setup incomplete"}
            </strong>
            <span>
              {data.local
                ? "Synthetic records in an isolated database."
                : "Live submission remains disabled."}{" "}
              No money will move.
            </span>
          </div>
          {failure && (
            <div className="notice error" role="alert">
              <CircleAlert size={19} />
              <span>{failure}</span>
              <button aria-label="Dismiss error" onClick={() => setFailure("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {toast && (
            <div className="toast" role="status">
              <Check size={16} />
              {toast}
              <button
                aria-label="Dismiss notification"
                onClick={() => setToast("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {tab === "settlement" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">EVERY CENT, ACCOUNTED FOR</span>
                  <h1>Settle the gig.</h1>
                  <p>
                    Start with the income. Cover the costs. Get the split right.
                  </p>
                </div>
                {data.role !== "reviewer" && (
                  <button
                    className="button primary"
                    onClick={() => setNewGig(true)}
                  >
                    <Plus size={17} />
                    New gig
                  </button>
                )}
              </div>
              {data.gigs.length > 0 ? (
                <>
                  <div className="gig-selector">
                    <CalendarDays size={20} />
                    <label>
                      Current gig
                      <select
                        value={gig?.id}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        {data.gigs.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="gig-selector-date">
                      {dateText(gig.performance_date)}
                      <small>Performance date</small>
                    </div>
                    <Badge>Revision {gig.version}</Badge>
                  </div>
                  <SettlementEditor
                    key={`${gig.id}-${gig.version}`}
                    gig={gig}
                    data={data}
                    command={command}
                    busy={busy}
                  />
                </>
              ) : (
                <div className="card">
                  <Empty title="Your first gig starts here">
                    Add a gig, record the original agreements and enter the
                    actual receipts.
                  </Empty>
                </div>
              )}
            </>
          )}
          {tab === "people" && (
            <PeoplePanel data={data} command={command} busy={busy} />
          )}
          {tab === "invoices" && (
            <InvoicesPanel data={data} command={command} busy={busy} />
          )}
          {tab === "payments" && (
            <PaymentsPanel
              data={data}
              gig={gig}
              command={command}
              busy={busy}
            />
          )}
          {tab === "activity" && (
            <>
              <PageTitle
                eyebrow="A RECORD YOU CAN FOLLOW"
                title="Activity & evidence."
                text="Recent events written by the application. Times shown in Melbourne time."
              />
              <section className="card">
                <div className="card-heading">
                  <h2>Audit history</h2>
                  <Badge>Latest {data.audit.length} · up to 200</Badge>
                </div>
                {data.audit.length ? (
                  <div className="timeline">
                    {data.audit.map((a) => (
                      <div key={a.id}>
                        <span className="timeline-dot" />
                        <div>
                          <strong>
                            {labelState(a.action.replaceAll(".", " · "))}
                          </strong>
                          <small>
                            {new Intl.DateTimeFormat("en-AU", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "Australia/Melbourne",
                            }).format(new Date(a.created_at))}
                          </small>
                        </div>
                        <ShieldCheck size={18} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title="No activity yet">
                    Saved changes and workflow actions will appear here.
                  </Empty>
                )}
              </section>
            </>
          )}
          {tab === "settings" && <SettingsPanel data={data} />}
          {tab === "mygigs" && (
            <PlayerPanel
              data={data}
              command={command}
              busy={busy}
              reportError={setFailure}
            />
          )}
          {tab === "profile" && (
            <ProfilePanel data={data} command={command} busy={busy} />
          )}
          <footer className="footer">
            <span>
              <AudioLines size={16} />
              Band Payments + Super
            </span>
            <span>
              AUD · Australia/Melbourne ·{" "}
              {data.local ? "Local test environment" : "Private workspace"}
            </span>
          </footer>
        </main>
      </div>
      {newGig && (
        <Modal title="Create a gig" onClose={() => setNewGig(false)}>
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                id = crypto.randomUUID();
              const draft: Draft = {
                title: String(f.get("title")),
                performanceDate: String(f.get("date")),
                payday: String(f.get("payday")),
                basis: "net",
                receipts: [
                  {
                    id: crypto.randomUUID(),
                    label: "Venue settlement",
                    amount: 0,
                  },
                ],
                expenses: [],
                savings: { mode: "fixed", amount: 0 },
                taxReserve: 0,
                engagements: [],
                drawings: [],
              };
              safely(async () => {
                await command("save_draft", { gigId: id, version: 0, draft });
                setSelected(id);
                setNewGig(false);
              });
            }}
          >
            <label>
              Gig name
              <input name="title" required maxLength={120} autoFocus />
            </label>
            <div className="form-grid">
              <label>
                Performance date
                <input name="date" type="date" required />
              </label>
              <label>
                Expected player payday
                <input
                  name="payday"
                  type="date"
                  required
                  min="2026-07-01"
                  max="2027-06-30"
                />
              </label>
            </div>
            <p className="small">
              The player payday is separate from the date the venue paid the
              band.
            </p>
            <button className="button primary" disabled={busy}>
              Create gig <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
function SettlementEditor({
  gig,
  data,
  command,
  busy,
}: {
  gig: Gig;
  data: AppData;
  command: Command;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(gig.draft),
    [dirty, setDirty] = useState(false);
  const readonly = data.role === "reviewer";
  const update = (work: (d: Draft) => void) => {
    setDraft((d) => {
      const next = structuredClone(d);
      work(next);
      return next;
    });
    setDirty(true);
  };
  const calc = useMemo(() => {
    try {
      return { result: settle(draft), error: "" };
    } catch (e) {
      return { result: null, error: (e as Error).message };
    }
  }, [draft]);
  const result = calc.result;
  const latest = data.revisions.find(
    (r) => r.gig_id === gig.id && r.gig_version === gig.version,
  );
  async function validate() {
    if (
      !(
        document.getElementById("settlement-form") as HTMLFormElement
      )?.reportValidity()
    )
      return;
    try {
      let version = gig.version;
      if (dirty) {
        const saved = await command(
          "save_draft",
          { gigId: gig.id, version, draft },
          false,
        );
        version = saved.version;
      }
      await command("calculate", { gigId: gig.id, version });
      setDirty(false);
    } catch {}
  }
  const addEngagement = () => {
    const person = data.people.find(
      (p) => !draft.engagements.some((e) => e.personId === p.id),
    );
    if (!person) return;
    update((d) =>
      d.engagements.push({
        id: crypto.randomUUID(),
        personId: person.id,
        name: person.name,
        role: "Musician",
        category: "musician",
        allocation: "fixed",
        weight: 100,
        amount: 0,
        hire: 0,
        mode: "exclusive",
        gst: "none",
        classification: "unresolved",
        agreementEvidence: "",
        hireEvidence: "",
      }),
    );
  };
  return (
    <>
      <div className="metrics">
        <div className="metric featured">
          <div>
            <span>Gig receipts</span>
            <Wallet size={19} />
          </div>
          <strong>{result ? money(result.revenue) : "—"}</strong>
          <small>
            {draft.basis === "net"
              ? "After venue deductions"
              : "Before venue deductions"}
          </small>
        </div>
        <div className="metric">
          <div>
            <span>Player & crew invoices</span>
            <ReceiptText size={19} />
          </div>
          <strong>{result ? money(result.invoiceTotal) : "—"}</strong>
          <small>Labour, genuine hire and any GST</small>
        </div>
        <div className="metric">
          <div>
            <span>Employer super</span>
            <Landmark size={19} />
          </div>
          <strong>{result ? money(result.superTotal) : "—"}</strong>
          <small>Separate from invoice payments · SG 12%</small>
        </div>
      </div>
      <div className="editor-layout">
        <div className="editor-stack">
          <form
            id="settlement-form"
            onSubmit={(e) => {
              e.preventDefault();
              void command("save_draft", {
                gigId: gig.id,
                version: gig.version,
                draft,
              })
                .then(() => setDirty(false))
                .catch(() => {});
            }}
          >
            <fieldset disabled={readonly || busy} className="unframed">
              <section className="card">
                <div className="card-heading">
                  <div>
                    <span className="section-number">01 / MONEY IN</span>
                    <h2>The whole gig</h2>
                    <p>Record the actual receipts, then choose their basis.</p>
                  </div>
                  <Wallet size={22} className="muted" />
                </div>
                <div className="card-body">
                  <div className="form-grid">
                    <label>
                      Gig name
                      <input
                        value={draft.title}
                        onChange={(e) =>
                          update((d) => {
                            d.title = e.target.value;
                          })
                        }
                        required
                      />
                    </label>
                    <label>
                      Receipt basis
                      <select
                        value={draft.basis}
                        onChange={(e) =>
                          update((d) => {
                            d.basis = e.target.value as Draft["basis"];
                          })
                        }
                      >
                        <option value="net">Net venue settlement</option>
                        <option value="gross">
                          Gross before venue deductions
                        </option>
                      </select>
                    </label>
                    <label>
                      Performance date
                      <input
                        type="date"
                        required
                        value={draft.performanceDate}
                        onChange={(e) =>
                          update((d) => {
                            d.performanceDate = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      Expected player payday
                      <input
                        type="date"
                        required
                        value={draft.payday}
                        onChange={(e) =>
                          update((d) => {
                            d.payday = e.target.value;
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="line-section">
                    {draft.receipts.map((r, i) => (
                      <div className="line-row" key={r.id}>
                        <label>
                          Receipt description
                          <input
                            value={r.label}
                            required
                            onChange={(e) =>
                              update((d) => {
                                d.receipts[i].label = e.target.value;
                              })
                            }
                          />
                        </label>
                        <MoneyField
                          label="Amount received"
                          value={r.amount}
                          onChange={(v) =>
                            update((d) => {
                              d.receipts[i].amount = v;
                            })
                          }
                        />
                        {draft.receipts.length > 1 && (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Remove receipt ${i + 1}`}
                            onClick={() =>
                              update((d) => {
                                d.receipts.splice(i, 1);
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      update((d) =>
                        d.receipts.push({
                          id: crypto.randomUUID(),
                          label: "Additional receipt",
                          amount: 0,
                        }),
                      )
                    }
                  >
                    <Plus size={15} />
                    Add receipt
                  </button>
                </div>
                <div className="card-foot">
                  <CircleAlert size={15} />
                  {draft.basis === "net"
                    ? "Venue-withheld costs are recorded below but will not be deducted again."
                    : "Venue-withheld costs will be deducted once from gross receipts."}
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <span className="section-number">
                      02 / COSTS & RESERVES
                    </span>
                    <h2>Cover what went into it</h2>
                    <p>Promotion, suppliers and genuine equipment costs.</p>
                  </div>
                </div>
                <div className="card-body">
                  {draft.expenses.map((e, i) => (
                    <div className="expense-row" key={e.id}>
                      <div className="line-row">
                        <label>
                          Expense description
                          <input
                            value={e.label}
                            required
                            onChange={(ev) =>
                              update((d) => {
                                d.expenses[i].label = ev.target.value;
                              })
                            }
                          />
                        </label>
                        <MoneyField
                          label="Cost including GST"
                          value={e.amount}
                          onChange={(v) =>
                            update((d) => {
                              d.expenses[i].amount = v;
                            })
                          }
                        />
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Remove expense ${i + 1}`}
                          onClick={() =>
                            update((d) => {
                              d.expenses.splice(i, 1);
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="form-grid">
                        <label>
                          Paid by
                          <select
                            value={e.paidBy}
                            onChange={(ev) =>
                              update((d) => {
                                d.expenses[i].paidBy = ev.target
                                  .value as Draft["expenses"][0]["paidBy"];
                                d.expenses[i].personId = null;
                                d.expenses[i].reimbursed = false;
                              })
                            }
                          >
                            <option value="unpaid">
                              Supplier still to be paid
                            </option>
                            <option value="band">Already paid by band</option>
                            <option value="venue">Withheld by venue</option>
                            <option value="person">
                              Paid personally · reimburse
                            </option>
                          </select>
                        </label>
                        {e.paidBy === "person" && (
                          <label>
                            Reimburse to
                            <select
                              required
                              value={e.personId ?? ""}
                              onChange={(ev) =>
                                update((d) => {
                                  d.expenses[i].personId = ev.target.value;
                                })
                              }
                            >
                              <option value="">Select person</option>
                              {data.people.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                      {e.paidBy === "person" && (
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={e.reimbursed}
                            onChange={(ev) =>
                              update((d) => {
                                d.expenses[i].reimbursed = ev.target.checked;
                              })
                            }
                          />
                          Reimbursement already paid (record evidence before
                          production)
                        </label>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      update((d) =>
                        d.expenses.push({
                          id: crypto.randomUUID(),
                          label: "Supplier expense",
                          amount: 0,
                          paidBy: "unpaid",
                          personId: null,
                          reimbursed: false,
                        }),
                      )
                    }
                  >
                    <Plus size={15} />
                    Add expense
                  </button>
                  <div className="divider" />
                  <div className="form-grid">
                    <label>
                      Retained savings
                      <select
                        value={draft.savings.mode}
                        onChange={(e) =>
                          update((d) => {
                            d.savings = {
                              mode: e.target.value as "fixed" | "percent",
                              amount: 0,
                            };
                          })
                        }
                      >
                        <option value="fixed">Fixed amount</option>
                        <option value="percent">
                          Percentage of reserve base
                        </option>
                      </select>
                    </label>
                    {draft.savings.mode === "fixed" ? (
                      <MoneyField
                        key="fixed"
                        label="Savings to retain"
                        value={draft.savings.amount}
                        onChange={(v) =>
                          update((d) => {
                            d.savings.amount = v;
                          })
                        }
                      />
                    ) : (
                      <label>
                        Savings percentage
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={draft.savings.amount / 100}
                          onChange={(e) => {
                            if (/^\d+(\.\d{0,2})?$/.test(e.target.value || "0"))
                              update((d) => {
                                d.savings.amount = parseMoney(
                                  e.target.value || "0",
                                );
                              });
                          }}
                        />
                      </label>
                    )}
                    <MoneyField
                      label="Manual tax reserve"
                      value={draft.taxReserve}
                      onChange={(v) =>
                        update((d) => {
                          d.taxReserve = v;
                        })
                      }
                    />
                  </div>
                  <p className="small">
                    Percentage basis: receipts less supplier costs, crew and tax
                    reserve. Savings stay with the band and are not an expense.
                    This is not a BAS calculation.
                  </p>
                </div>
                <div className="card-foot">
                  <Users size={15} />
                  Enter sound engineers and other crew as engagements below,
                  once.
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <span className="section-number">
                      03 / PEOPLE & AGREEMENTS
                    </span>
                    <h2>The line-up</h2>
                    <p>Preserve the original agreement for every person.</p>
                  </div>
                  <Badge>{draft.engagements.length} engagements</Badge>
                </div>
                <div className="engagement-list">
                  {draft.engagements.map((e, i) => {
                    const amount = result?.allocations.find(
                      (a) => a.id === e.id,
                    );
                    return (
                      <details
                        className="engagement"
                        key={e.id}
                        open={e.classification === "unresolved"}
                      >
                        <summary>
                          <span className="avatar">{e.name.slice(0, 1)}</span>
                          <span className="engagement-name">
                            <strong>{e.name}</strong>
                            <small>
                              {e.role} · {e.category}
                            </small>
                          </span>
                          <span className="engagement-amount">
                            {amount ? money(amount.budget) : "Needs review"}
                            <small>
                              {e.allocation === "share"
                                ? "Share of remainder"
                                : "Fixed agreement"}
                            </small>
                          </span>
                          <ChevronDown size={16} />
                        </summary>
                        <div className="engagement-fields">
                          <div className="form-grid">
                            <label>
                              Role
                              <input
                                value={e.role}
                                onChange={(v) =>
                                  update((d) => {
                                    d.engagements[i].role = v.target.value;
                                  })
                                }
                                required
                              />
                            </label>
                            <label>
                              Category
                              <select
                                value={e.category}
                                onChange={(v) =>
                                  update((d) => {
                                    d.engagements[i].category = v.target
                                      .value as "musician" | "crew";
                                    d.engagements[i].allocation = "fixed";
                                  })
                                }
                              >
                                <option value="musician">Musician</option>
                                <option value="crew">Crew</option>
                              </select>
                            </label>
                            <label>
                              Engagement treatment
                              <select
                                value={e.classification}
                                onChange={(v) =>
                                  update((d) => {
                                    d.engagements[i].classification = v.target
                                      .value as typeof e.classification;
                                  })
                                }
                              >
                                <option value="unresolved">
                                  Needs classification review
                                </option>
                                <option value="adult_eligible_contractor">
                                  Reviewed adult eligible contractor
                                </option>
                                <option value="employee">
                                  Employee · payroll required
                                </option>
                                <option value="under_18">
                                  Under 18 · review required
                                </option>
                                <option value="other">
                                  Other · review required
                                </option>
                              </select>
                            </label>
                            <label>
                              Allocation
                              <select
                                value={e.allocation}
                                onChange={(v) =>
                                  update((d) => {
                                    d.engagements[i].allocation = v.target
                                      .value as "fixed" | "share";
                                    if (v.target.value === "share")
                                      d.engagements[i].mode = "cashcap";
                                  })
                                }
                              >
                                <option value="fixed">Fixed agreed fee</option>
                                {e.category === "musician" && (
                                  <option value="share">
                                    Agreed share of remainder
                                  </option>
                                )}
                              </select>
                            </label>
                            {e.allocation === "fixed" ? (
                              <MoneyField
                                label="Agreed fee"
                                value={e.amount}
                                onChange={(v) =>
                                  update((d) => {
                                    d.engagements[i].amount = v;
                                  })
                                }
                              />
                            ) : (
                              <label>
                                Share weight (whole units)
                                <input
                                  type="number"
                                  min="1"
                                  max="10000"
                                  value={e.weight}
                                  onChange={(v) =>
                                    update((d) => {
                                      d.engagements[i].weight = Number(
                                        v.target.value,
                                      );
                                    })
                                  }
                                />
                              </label>
                            )}
                            <label>
                              Original fee basis
                              <select
                                value={e.mode}
                                disabled={e.allocation === "share"}
                                onChange={(v) =>
                                  update((d) => {
                                    d.engagements[i].mode = v.target
                                      .value as typeof e.mode;
                                  })
                                }
                              >
                                <option value="exclusive">
                                  Fee + super + any GST
                                </option>
                                <option value="package">
                                  Includes super, GST additional
                                </option>
                                <option value="cashcap">
                                  All-in cap including GST & super
                                </option>
                              </select>
                            </label>
                            <MoneyField
                              label="Genuine hire excluding GST"
                              value={e.hire}
                              onChange={(v) =>
                                update((d) => {
                                  d.engagements[i].hire = v;
                                })
                              }
                            />
                            <label>
                              GST treatment
                              <select
                                value={e.gst}
                                onChange={(v) =>
                                  update((d) => {
                                    d.engagements[i].gst = v.target
                                      .value as typeof e.gst;
                                  })
                                }
                              >
                                <option value="none">No GST</option>
                                <option value="uniform">
                                  All invoice lines taxable · 10%
                                </option>
                                <option value="mixed">
                                  Mixed · separate review required
                                </option>
                              </select>
                            </label>
                          </div>
                          <label>
                            Original agreement evidence
                            <textarea
                              value={e.agreementEvidence}
                              onChange={(v) =>
                                update((d) => {
                                  d.engagements[i].agreementEvidence =
                                    v.target.value;
                                })
                              }
                              placeholder="Record when and how this fee basis was originally agreed."
                              required
                              maxLength={2000}
                            />
                          </label>
                          {e.hire > 0 && (
                            <label>
                              Genuine hire evidence
                              <textarea
                                value={e.hireEvidence}
                                onChange={(v) =>
                                  update((d) => {
                                    d.engagements[i].hireEvidence =
                                      v.target.value;
                                  })
                                }
                                required
                                maxLength={2000}
                              />
                            </label>
                          )}
                          {amount && (
                            <div className="breakdown-chips">
                              <span>
                                Labour <b>{money(amount.labour)}</b>
                              </span>
                              <span>
                                Hire <b>{money(amount.hire)}</b>
                              </span>
                              <span>
                                GST <b>{money(amount.gst)}</b>
                              </span>
                              <span>
                                Super <b>{money(amount.super)}</b>
                              </span>
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
                <div className="card-body">
                  <button
                    type="button"
                    className="text-button"
                    onClick={addEngagement}
                    disabled={draft.engagements.length >= data.people.length}
                  >
                    <Plus size={15} />
                    Add person from roster
                  </button>
                  <p className="small">
                    Add new people under People & invitations. A late acceptance
                    records their response today; it cannot backdate or reduce
                    an original fee.
                  </p>
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <span className="section-number">
                      04 / PARTNER DRAWINGS
                    </span>
                    <h2>Share what remains</h2>
                    <p>
                      Drawings are separate from hired-player invoices and
                      super.
                    </p>
                  </div>
                </div>
                <div className="card-body">
                  {draft.drawings.map((p, i) => (
                    <div className="expense-row" key={p.id}>
                      <div className="form-grid">
                        <label>
                          Partner
                          <select
                            value={p.personId}
                            onChange={(e) =>
                              update((d) => {
                                const person = data.people.find(
                                  (x) => x.id === e.target.value,
                                )!;
                                d.drawings[i].personId = person.id;
                                d.drawings[i].name = person.name;
                              })
                            }
                          >
                            {data.people.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Allocation
                          <select
                            value={p.allocation}
                            onChange={(e) =>
                              update((d) => {
                                d.drawings[i].allocation = e.target.value as
                                  "fixed" | "share";
                              })
                            }
                          >
                            <option value="fixed">Fixed drawings</option>
                            <option value="share">
                              Share of remaining pool
                            </option>
                          </select>
                        </label>
                        {p.allocation === "fixed" ? (
                          <MoneyField
                            label="Drawings"
                            value={p.amount}
                            onChange={(v) =>
                              update((d) => {
                                d.drawings[i].amount = v;
                              })
                            }
                          />
                        ) : (
                          <label>
                            Share weight
                            <input
                              type="number"
                              min="1"
                              max="10000"
                              value={p.weight}
                              onChange={(e) =>
                                update((d) => {
                                  d.drawings[i].weight = Number(e.target.value);
                                })
                              }
                            />
                          </label>
                        )}
                      </div>
                      <div className="inline-spread">
                        <strong>
                          {money(
                            result?.drawings.find((x) => x.id === p.id)
                              ?.amount ?? 0,
                          )}
                        </strong>
                        <button
                          type="button"
                          className="text-button danger"
                          onClick={() =>
                            update((d) => {
                              d.drawings.splice(i, 1);
                            })
                          }
                        >
                          Remove drawings
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-button"
                    disabled={!data.people.length}
                    onClick={() =>
                      update((d) =>
                        d.drawings.push({
                          id: crypto.randomUUID(),
                          personId: data.people[0].id,
                          name: data.people[0].name,
                          allocation: "fixed",
                          amount: 0,
                          weight: 100,
                        }),
                      )
                    }
                  >
                    <Plus size={15} />
                    Add partner drawings
                  </button>
                </div>
              </section>
            </fieldset>
          </form>
        </div>
        <aside className="settlement-aside">
          <section className="card reconciliation">
            <span className="section-number">THE SETTLEMENT</span>
            <h2>Where the money goes</h2>
            <Badge tone={latest && !dirty ? "green" : "amber"}>
              {latest && !dirty ? "Server validated" : "Provisional preview"}
            </Badge>
            {result ? (
              <>
                <div className="settlement-lines">
                  {[
                    ["Receipts", result.revenue],
                    ["Suppliers & reimbursements", -result.supplierCost],
                    ["Crew invoices & super", -result.crewCost],
                    ["Tax reserve", -result.taxReserve],
                    ["Retained savings", -result.savings],
                    [
                      "Musician invoices & super",
                      -(
                        result.invoiceTotal +
                        result.superTotal +
                        result.residual -
                        result.crewCost
                      ),
                    ],
                    ["Partner drawings", -result.drawingsTotal],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <b>{money(Number(value))}</b>
                    </div>
                  ))}
                </div>
                <div
                  className={`settlement-balance ${result.balance < 0 ? "negative" : ""}`}
                >
                  <span>
                    {result.balance < 0
                      ? "Funding shortfall"
                      : "Unallocated balance"}
                  </span>
                  <strong>{money(result.balance)}</strong>
                </div>
                {result.residual > 0 && (
                  <p className="error-text">
                    {money(result.residual)} rounding residual requires review.
                  </p>
                )}
                <div className="funding-note">
                  <Wallet size={17} />
                  <p>
                    Upcoming cash before recorded transfers:{" "}
                    <strong>
                      {money(result.upcomingCashBeforeRecordedTransfers)}
                    </strong>
                    . Check the actual bank balance separately.
                  </p>
                </div>
                {result.reimbursements.some((r) => r.outstanding > 0) && (
                  <div className="reimbursement-note">
                    <h3>Personal reimbursements</h3>
                    {result.reimbursements
                      .filter((r) => r.outstanding > 0)
                      .map((r) => (
                        <div key={r.expenseId}>
                          <span>
                            {data.people.find((p) => p.id === r.personId)?.name}
                          </span>
                          <b>{money(r.outstanding)}</b>
                        </div>
                      ))}
                    <p>Already counted in supplier costs.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="notice amber">
                <CircleAlert size={19} />
                <p>{calc.error}</p>
              </div>
            )}
            {!readonly && (
              <div className="aside-actions">
                <button
                  className="button primary full"
                  disabled={busy || !result}
                  onClick={validate}
                >
                  {busy
                    ? "Saving…"
                    : dirty
                      ? "Save & validate"
                      : "Validate calculation"}
                  <ArrowUpRight size={17} />
                </button>
                <button
                  className="button secondary full"
                  type="submit"
                  form="settlement-form"
                  disabled={busy || !dirty}
                >
                  Save draft
                </button>
              </div>
            )}
            <p className="small">
              {dirty
                ? "You have unsaved changes."
                : "Draft saved in your workspace."}{" "}
              Validation records an immutable revision. It does not authorise a
              payment.
            </p>
          </section>
          <section className="small-callout">
            <Clock3 size={22} />
            <h3>Payday sets the clock</h3>
            <p>
              Expected payday: <strong>{dateText(draft.payday)}</strong>
            </p>
            <p>
              A reviewed holiday calendar and actual payday are required before
              confirming the fund-receipt deadline. Missing invoices do not
              remove a super obligation.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

function PeoplePanel({
  data,
  command,
  busy,
}: {
  data: AppData;
  command: Command;
  busy: boolean;
}) {
  const [add, setAdd] = useState(false),
    [invite, setInvite] = useState<Person | null>(null),
    [code, setCode] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A PLACE FOR EVERY PLAYER</span>
          <h1>People & invitations.</h1>
          <p>Each person gets access to their own agreements and payments.</p>
        </div>
        {data.role !== "reviewer" && (
          <button className="button primary" onClick={() => setAdd(true)}>
            <Plus size={16} />
            Add person
          </button>
        )}
      </div>
      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Account</th>
                <th>Bank details</th>
                <th>Super fund</th>
                <th>Invitation</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <small>{p.email}</small>
                  </td>
                  <td>
                    <Badge tone={p.auth_user_id ? "green" : "neutral"}>
                      {p.auth_user_id ? "Linked" : "Not linked"}
                    </Badge>
                  </td>
                  <td>
                    <Badge>{labelState(p.bank_status)}</Badge>
                  </td>
                  <td>
                    <Badge>{labelState(p.fund_status)}</Badge>
                  </td>
                  <td>
                    <button
                      className="button secondary small-button"
                      disabled={busy || data.role === "reviewer"}
                      onClick={() => {
                        setInvite(p);
                        setCode("");
                      }}
                    >
                      Create invitation
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.people.length && (
          <Empty title="Add your first person">
            People are scoped to this band workspace.
          </Empty>
        )}
      </div>
      <section className="card section-gap">
        <div className="card-heading">
          <h2>Invitation history</h2>
          <Badge>No automatic email</Badge>
        </div>
        {data.invitations.length ? (
          <div className="list-rows">
            {data.invitations.map((i) => (
              <div key={i.id}>
                <div>
                  <strong>{i.email}</strong>
                  <small>Expires {dateText(i.expires_at)}</small>
                </div>
                <Badge tone={i.claimed_at ? "green" : "neutral"}>
                  {i.claimed_at
                    ? "Claimed"
                    : i.revoked_at
                      ? "Revoked"
                      : new Date(i.expires_at) < new Date()
                        ? "Expired"
                        : "Created · not sent"}
                </Badge>
                {!i.claimed_at && !i.revoked_at && data.role !== "reviewer" && (
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() =>
                      void command("revoke_invitation", {
                        invitationId: i.id,
                      }).catch(() => {})
                    }
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No invitations created">
            Creating a code and sending an invitation are separate actions.
          </Empty>
        )}
      </section>
      {add && (
        <Modal title="Add a person" onClose={() => setAdd(false)}>
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void command("add_person", {
                name: f.get("name"),
                email: f.get("email"),
              })
                .then(() => setAdd(false))
                .catch(() => {});
            }}
          >
            <label>
              Legal or preferred name
              <input name="name" required autoFocus maxLength={120} />
            </label>
            <label>
              Verified destination email
              <input name="email" type="email" required />
            </label>
            <p className="small">
              Confirm this address with the person before sharing an invitation.
            </p>
            <button className="button primary" disabled={busy}>
              Add person
            </button>
          </form>
        </Modal>
      )}
      {invite && (
        <Modal title={`Invite ${invite.name}`} onClose={() => setInvite(null)}>
          <div className="modal-body">
            {code ? (
              <>
                <p>
                  This code expires after seven days. It is shown only now. No
                  email has been sent.
                </p>
                <label>
                  Invitation code
                  <textarea
                    readOnly
                    value={code}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <p className="small">
                  The recipient must sign in with their verified email and
                  submit this code. Opening a link cannot claim it. Account
                  provisioning and email delivery need configuration before real
                  invitations.
                </p>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void command("create_invitation", {
                    gigId: f.get("gig"),
                    personId: invite.id,
                  })
                    .then((r) => setCode(r.token))
                    .catch(() => {});
                }}
              >
                <label>
                  Gig
                  <select name="gig" required>
                    <option value="">Select an engagement</option>
                    {data.gigs
                      .filter((g) =>
                        g.draft.engagements.some(
                          (e) => e.personId === invite.id,
                        ),
                      )
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                  </select>
                </label>
                <p>Destination: {invite.email}</p>
                <button className="button primary" disabled={busy}>
                  Create code · do not send
                </button>
              </form>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
function InvoicesPanel({
  data,
  command,
  busy,
}: {
  data: AppData;
  command: Command;
  busy: boolean;
}) {
  const [transfer, setTransfer] = useState<AppData["invoices"][0] | null>(null);
  return (
    <>
      <PageTitle
        eyebrow="ONE INVOICE, ONE PAYMENT RECORD"
        title="Invoices & transfers."
        text="Review the supplier's issued invoice, then record the bank transfer with evidence."
      />
      <section className="card">
        <div className="card-heading">
          <h2>Player invoices</h2>
          <Badge>Bank transfers recorded manually</Badge>
        </div>
        {data.invoices.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Amount</th>
                  <th>Document</th>
                  <th>Match</th>
                  <th>Invoice transfer</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => {
                  const scan = data.documents.find(
                    (d) => d.id === i.document_id,
                  )?.scan_status;
                  const bank = data.transfers.find(
                    (t) => t.invoice_id === i.id,
                  );
                  const engagement = data.engagements.find(
                    (e) => e.id === i.engagement_id,
                  );
                  const g = data.gigs.find((g) => g.id === engagement?.gig_id);
                  const revision = data.revisions.find(
                    (r) => r.gig_id === g?.id && r.gig_version === g?.version,
                  );
                  return (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.invoice_number}</strong>
                        <small>
                          {data.people.find((p) => p.id === i.person_id)?.name}
                        </small>
                      </td>
                      <td>{money(i.amount_cents)}</td>
                      <td>
                        {scan === "clean" ? (
                          <a
                            href={`/api/v1/documents/${i.document_id}`}
                            className="text-button"
                          >
                            Download
                          </a>
                        ) : (
                          <Badge tone="amber">Quarantined</Badge>
                        )}
                      </td>
                      <td>
                        <Badge>{labelState(i.status)}</Badge>
                      </td>
                      <td>
                        {bank ? (
                          <Badge tone="green">Operator recorded</Badge>
                        ) : (
                          <button
                            className="button secondary small-button"
                            disabled={
                              busy ||
                              data.role === "reviewer" ||
                              i.status !== "matched"
                            }
                            onClick={() => setTransfer(i)}
                          >
                            Record transfer
                          </button>
                        )}
                      </td>
                      <td>
                        <button
                          className="text-button"
                          disabled={
                            busy || data.role === "reviewer" || !revision
                          }
                          onClick={() =>
                            void command("review_invoice", {
                              invoiceId: i.id,
                              revisionId: revision?.id,
                            }).catch(() => {})
                          }
                        >
                          Match to revision
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Waiting for issued invoices">
            Players upload their own documents in their portal. Missing invoices
            remain an exception; super obligations still need attention.
          </Empty>
        )}
      </section>
      <div className="notice section-gap">
        <ShieldCheck size={20} />
        <span>
          Uploads stay private and quarantined until malware scanning is
          configured and completes. An operator-recorded transfer is not
          independently bank-confirmed receipt.
        </span>
      </div>
      {transfer && (
        <Modal title="Record a bank transfer" onClose={() => setTransfer(null)}>
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void command("record_transfer", {
                invoiceId: transfer.id,
                amount: transfer.amount_cents,
                paidDate: f.get("date"),
                evidence: f.get("evidence"),
              })
                .then(() => setTransfer(null))
                .catch(() => {});
            }}
          >
            <p>
              Invoice {transfer.invoice_number} ·{" "}
              <strong>{money(transfer.amount_cents)}</strong>
            </p>
            <label>
              Actual transfer date
              <input type="date" name="date" required />
            </label>
            <label>
              Bank statement / transaction evidence reference
              <input name="evidence" required minLength={3} maxLength={500} />
            </label>
            <p className="small">
              Do not enter bank account numbers. MFA, an invoice match and a
              verified secure bank reference are required.
            </p>
            <button className="button primary" disabled={busy}>
              Record operator evidence
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function PaymentsPanel({
  data,
  gig,
  command,
  busy,
}: {
  data: AppData;
  gig?: Gig;
  command: Command;
  busy: boolean;
}) {
  const revision = data.revisions.find(
    (r) => r.gig_id === gig?.id && r.gig_version === gig?.version,
  );
  const [portal, setPortal] = useState<{
      engagementId: string;
      name: string;
      amount: number;
    } | null>(null),
    [receipt, setReceipt] = useState<ExternalSuper | null>(null);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
  }).format(new Date());
  const gigEngagements = data.engagements.filter((e) => e.gig_id === gig?.id);
  return (
    <>
      <PageTitle
        eyebrow="SEPARATE MONEY. SEPARATE EVIDENCE."
        title="Super contributions."
        text="Track each contribution through the clearinghouse to the player's fund."
      />
      <div className="provider-card">
        <div className="provider-icon">
          <Landmark size={32} />
        </div>
        <div>
          <Badge tone="amber">Not connected</Badge>
          <h2>Connect an approved clearinghouse</h2>
          <p>
            Wrkr / ClickSuper is the first candidate. API access, a payer
            mandate, onboarding and sandbox verification are still required.
          </p>
        </div>
        <ShieldCheck size={27} />
      </div>
      <div className="two-columns section-gap">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Prepare the exact revision</h2>
              <p>
                Preparation is blocked until provider and deadline setup is
                verified.
              </p>
            </div>
          </div>
          <form
            className="card-body"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void command("prepare_run", {
                revisionId: revision?.id,
                funding: parseMoney(String(f.get("funding"))),
                evidence: f.get("evidence"),
              }).catch(() => {});
            }}
          >
            <label>
              Current gig
              <input value={gig?.title ?? "No gig selected"} readOnly />
            </label>
            <label>
              Available bank funding (AUD)
              <input
                name="funding"
                inputMode="decimal"
                pattern="[0-9]+(\.[0-9]{0,2})?"
                required
                placeholder="0.00"
              />
            </label>
            <label>
              Funding check evidence
              <input
                name="evidence"
                minLength={3}
                required
                placeholder="Statement reference and check date"
              />
            </label>
            <button
              className="button primary"
              disabled={busy || !revision || data.role === "reviewer"}
            >
              Check pay-run readiness
              <ArrowUpRight size={16} />
            </button>
            {!revision && (
              <p className="small">Validate the selected gig first.</p>
            )}
          </form>
        </section>
        <section className="card">
          <div className="card-heading">
            <h2>Before anything moves</h2>
          </div>
          <ol className="checklist">
            <li>
              <span>01</span>
              <div>
                <strong>Exact amounts and destinations</strong>
                <p>
                  An immutable revision, verified fund references and current
                  agreements.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Explicit payment authority</strong>
                <p>A designated approver, MFA and current funding evidence.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Evidence for every contribution</strong>
                <p>
                  Provider acceptance, funding and fund receipt are distinct
                  states.
                </p>
              </div>
            </li>
          </ol>
        </section>
      </div>
      <section className="card section-gap">
        <div className="card-heading">
          <h2>Contribution outcomes</h2>
        </div>
        {data.contributions.length ? (
          <div className="list-rows">
            {data.contributions.map((c) => (
              <div key={c.id}>
                <strong>
                  {data.people.find((p) => p.id === c.person_id)?.name}
                </strong>
                <span>{money(c.amount_cents)}</span>
                <Badge>{labelState(c.status)}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No contributions submitted">
            There are no provider receipts or fund outcomes to report.
          </Empty>
        )}
      </section>
      <section className="card section-gap">
        <div className="card-heading">
          <div>
            <h2>Paid through the clearing house</h2>
            <p>
              Super paid outside the app, such as through the AustralianSuper
              Employer Portal, for {gig?.title ?? "the selected gig"}.
            </p>
          </div>
          <Badge>Recorded manually</Badge>
        </div>
        {gigEngagements.length ? (
          <div className="list-rows">
            {gigEngagements.map((e) => {
              const required = revision?.result.allocations.find(
                  (a) => a.id === e.id,
                )?.super,
                record = data.externalSuper.find(
                  (x) => x.engagement_id === e.id,
                ),
                inRun = data.contributions.some(
                  (c) => c.engagement_id === e.id,
                ),
                name = data.people.find((p) => p.id === e.person_id)?.name;
              return (
                <div key={e.id}>
                  <div>
                    <strong>{name}</strong>
                    {record ? (
                      <small>
                        QE day {dateText(record.qe_day)} · Paid via portal{" "}
                        {dateText(record.paid_on)} · Ref{" "}
                        {record.portal_reference} · {record.fund_label}
                      </small>
                    ) : (
                      <small>
                        {inRun
                          ? "Included in an app pay run"
                          : "No clearing house payment recorded"}
                      </small>
                    )}
                  </div>
                  <span>
                    {record
                      ? money(record.amount_cents)
                      : required
                        ? `${money(required)} required`
                        : "Validate the gig"}
                  </span>
                  {record ? (
                    record.status === "fund_receipt_confirmed" ? (
                      <Badge tone="green">Fund receipt confirmed</Badge>
                    ) : (
                      <>
                        <Badge tone="amber">Paid via clearing house</Badge>
                        <button
                          className="button secondary small-button"
                          disabled={busy || data.role === "reviewer"}
                          onClick={() => setReceipt(record)}
                        >
                          Confirm fund receipt
                        </button>
                      </>
                    )
                  ) : (
                    <button
                      className="button secondary small-button"
                      disabled={
                        busy ||
                        data.role === "reviewer" ||
                        inRun ||
                        !required ||
                        !revision
                      }
                      onClick={() =>
                        setPortal({
                          engagementId: e.id,
                          name: name ?? "Player",
                          amount: required!,
                        })
                      }
                    >
                      Record portal payment
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title="No players on this gig">
            Add engagements and validate the gig to see the super each player is
            owed.
          </Empty>
        )}
      </section>
      <div className="notice section-gap">
        <Clock3 size={20} />
        <span>{SUPER_TIMING}</span>
      </div>
      {portal && revision && (
        <Modal
          title="Record a clearing house payment"
          onClose={() => setPortal(null)}
        >
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void command("record_external_super", {
                engagementId: portal.engagementId,
                revisionId: revision.id,
                amount: portal.amount,
                qeDay: f.get("qeDay"),
                paidOn: f.get("paidOn"),
                reference: f.get("reference"),
                fundLabel: f.get("fundLabel"),
              })
                .then(() => setPortal(null))
                .catch(() => {});
            }}
          >
            <p>
              {portal.name} · {gig?.title}
            </p>
            <label>
              Super amount (from the validated revision)
              <input value={money(portal.amount)} readOnly />
            </label>
            <div className="form-grid">
              <label>
                Day the player&apos;s fee was paid
                <input type="date" name="qeDay" required max={today} />
              </label>
              <label>
                Day paid in the portal
                <input type="date" name="paidOn" required max={today} />
              </label>
            </div>
            <label>
              Portal payment reference
              <input name="reference" required maxLength={100} />
            </label>
            <label>
              Fund name
              <input
                name="fundLabel"
                required
                maxLength={120}
                defaultValue="AustralianSuper"
              />
            </label>
            <p className="small">
              Names and references only. Do not enter member numbers, TFNs or
              bank details. MFA is required. The amount cannot be changed here.
            </p>
            <p className="small">{SUPER_TIMING}</p>
            <button className="button primary" disabled={busy}>
              Record clearing house payment
            </button>
          </form>
        </Modal>
      )}
      {receipt && (
        <Modal title="Confirm fund receipt" onClose={() => setReceipt(null)}>
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void command("confirm_external_super_receipt", {
                externalSuperId: receipt.id,
                evidence: f.get("evidence"),
              })
                .then(() => setReceipt(null))
                .catch(() => {});
            }}
          >
            <p>
              {data.people.find((p) => p.id === receipt.person_id)?.name} ·{" "}
              <strong>{money(receipt.amount_cents)}</strong> paid via portal{" "}
              {dateText(receipt.paid_on)}
            </p>
            <label>
              Fund receipt evidence
              <input
                name="evidence"
                required
                minLength={3}
                maxLength={500}
                placeholder="Fund statement or confirmation reference"
              />
            </label>
            <p className="small">
              Only confirm once the fund shows the contribution as received. Do
              not enter member numbers, TFNs or bank details.
            </p>
            <button className="button primary" disabled={busy}>
              Confirm fund receipt
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function SettingsPanel({ data }: { data: AppData }) {
  return (
    <>
      <PageTitle
        eyebrow="READY MEANS VERIFIED"
        title="Workspace setup."
        text="The band, legal payer and approval roles must be confirmed before live use."
      />
      <div className="two-columns">
        <section className="card">
          <div className="card-heading">
            <h2>Band & payer</h2>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Workspace</dt>
              <dd>{data.workspace.name}</dd>
            </div>
            <div>
              <dt>Legal payer</dt>
              <dd>{data.workspace.legal_name ?? "Not configured"}</dd>
            </div>
            <div>
              <dt>ABN</dt>
              <dd>{data.workspace.abn ?? "Not configured"}</dd>
            </div>
            <div>
              <dt>PRIS connection</dt>
              <dd>Adapter review required</dd>
            </div>
            <div>
              <dt>Payment provider</dt>
              <dd>Not connected</dd>
            </div>
            <div>
              <dt>Live submission</dt>
              <dd>
                <Badge tone="amber">Disabled</Badge>
              </dd>
            </div>
          </dl>
        </section>
        <section className="card">
          <div className="card-heading">
            <h2>Collection & privacy</h2>
          </div>
          <div className="card-body prose">
            <p>
              This workspace stores your contact details, original agreements,
              invoices and payment records so the band can settle gigs.
            </p>
            <p>
              Players can access only their own records. Authorised finance
              staff and reviewers can view workspace records. Documents are
              private and require malware clearance before download.
            </p>
            <p>
              Do not enter TFNs, bank account details or fund member numbers
              here. Secure bank and fund collection is awaiting an approved
              provider path.
            </p>
            <p>
              For corrections or account recovery, contact your band manager.
              The production privacy notice, retention period and processing
              locations must be reviewed before live collection.
            </p>
          </div>
        </section>
      </div>
      <MfaPanel />
      <section className="card section-gap">
        <div className="card-heading">
          <h2>Activation dependencies</h2>
          <Badge tone="amber">External setup required</Badge>
        </div>
        <div className="readiness-grid">
          {[
            "Selected band and legal partnership",
            "Approved provider API and sandbox",
            "Verified bank and fund collection",
            "SMTP and invitation delivery",
            "Multi-factor authentication",
            "Holiday calendar and deadline rules",
            "Malware scanning service",
            "Backup restore and monitoring owner",
          ].map((s) => (
            <div key={s}>
              <Clock3 size={17} />
              {s}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function PlayerPanel({
  data,
  command,
  busy,
  reportError,
}: {
  data: AppData;
  command: Command;
  busy: boolean;
  reportError: (s: string) => void;
}) {
  const [correction, setCorrection] = useState<PlayerGig | null>(null),
    [upload, setUpload] = useState<PlayerGig | null>(null),
    [uploadBusy, setUploadBusy] = useState(false);
  const router = useRouter();
  return (
    <>
      <PageTitle
        eyebrow="YOUR GIGS. YOUR DETAILS."
        title="Ready for the next note."
        text="Review your original agreement, upload your invoice and follow each payment separately."
      />
      <div className="player-gigs">
        {data.playerGigs.map((g) => {
          let result: ReturnType<typeof calculateFee> | null = null;
          try {
            if (g.terms.allocation === "fixed")
              result = calculateFee(g.terms, g.payday);
          } catch {}
          const invoice = data.invoices.find((i) => i.engagement_id === g.id),
            bank = data.transfers.find((t) => t.invoice_id === invoice?.id),
            portal = data.externalSuper.find((x) => x.engagement_id === g.id);
          return (
            <section className="card player-gig" key={g.id}>
              <div className="card-heading">
                <div>
                  <span className="section-number">
                    {dateText(g.performanceDate)} · {g.terms.role}
                  </span>
                  <h2>{g.title}</h2>
                </div>
                <Badge tone={g.response === "accepted" ? "green" : "amber"}>
                  {labelState(g.response)}
                </Badge>
              </div>
              <div className="card-body">
                <div className="payment-paths">
                  <div>
                    <ReceiptText size={22} />
                    <span>Your invoice</span>
                    <strong>
                      {result ? money(result.invoice) : "Awaiting allocation"}
                    </strong>
                    <small>
                      {bank
                        ? "Operator-recorded transfer"
                        : invoice
                          ? "Invoice submitted"
                          : "Invoice outstanding"}
                    </small>
                  </div>
                  <div>
                    <Landmark size={22} />
                    <span>Employer super</span>
                    <strong>
                      {portal
                        ? money(portal.amount_cents)
                        : result
                          ? money(result.super)
                          : "Awaiting allocation"}
                    </strong>
                    <small>
                      {portal?.status === "fund_receipt_confirmed"
                        ? "Fund receipt confirmed"
                        : portal
                          ? `Paid via clearing house on ${dateText(portal.paid_on)}`
                          : "Not submitted to clearinghouse"}
                    </small>
                  </div>
                </div>
                {result && (
                  <div className="breakdown-chips">
                    <span>
                      Labour <b>{money(result.labour)}</b>
                    </span>
                    <span>
                      Hire <b>{money(result.hire)}</b>
                    </span>
                    <span>
                      GST <b>{money(result.gst)}</b>
                    </span>
                  </div>
                )}
                <div className="agreement-note">
                  <span className="eyebrow">ORIGINAL AGREEMENT RECORD</span>
                  <p>
                    {g.terms.agreementEvidence ||
                      "The manager needs to provide the original agreement evidence."}
                  </p>
                  <p className="small">
                    Fee basis:{" "}
                    {g.terms.mode === "exclusive"
                      ? "Fee excluding super and GST"
                      : g.terms.mode === "package"
                        ? "Package includes super; GST additional"
                        : "Cash cap includes GST and super"}
                    . Expected payday {dateText(g.payday)}.
                  </p>
                </div>
                <div className="actions">
                  <button
                    className="button primary"
                    disabled={busy || g.response === "accepted"}
                    onClick={() =>
                      void command("agreement", {
                        engagementId: g.id,
                        version: g.version,
                        response: "accepted",
                        note: "",
                      }).catch(() => {})
                    }
                  >
                    <Check size={16} />
                    Confirm accurate record
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setCorrection(g)}
                  >
                    Request correction
                  </button>
                  <button
                    className="button secondary"
                    disabled={Boolean(invoice)}
                    onClick={() => setUpload(g)}
                  >
                    <Plus size={15} />
                    {invoice ? "Invoice submitted" : "Upload issued invoice"}
                  </button>
                </div>
                <p className="small">
                  Your response is recorded today. It does not backdate an
                  agreement or approve a retrospective fee reduction.
                </p>
              </div>
            </section>
          );
        })}
        {!data.playerGigs.length && (
          <div className="card">
            <Empty title="No gigs assigned yet">
              Your manager can invite you to a gig. Only your own details will
              appear here.
            </Empty>
          </div>
        )}
      </div>
      {correction && (
        <Modal
          title="Request an agreement correction"
          onClose={() => setCorrection(null)}
        >
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void command("agreement", {
                engagementId: correction.id,
                version: correction.version,
                response: "correction_requested",
                note: f.get("note"),
              })
                .then(() => setCorrection(null))
                .catch(() => {});
            }}
          >
            <label>
              What needs correcting?
              <textarea name="note" required maxLength={2000} autoFocus />
            </label>
            <button className="button primary" disabled={busy}>
              Save correction request
            </button>
          </form>
        </Modal>
      )}
      {upload && (
        <Modal
          title="Upload your issued invoice"
          onClose={() => setUpload(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              setUploadBusy(true);
              const f = new FormData(e.currentTarget);
              f.set("workspaceId", data.workspace.id);
              f.set("engagementId", upload.id);
              try {
                const r = await fetch("/api/v1/invoices", {
                  method: "POST",
                  body: f,
                });
                const j = await r.json();
                if (!r.ok) throw Error(j.error.message);
                setUpload(null);
                router.refresh();
              } catch (e) {
                reportError((e as Error).message);
              } finally {
                setUploadBusy(false);
              }
            }}
          >
            <label>
              Invoice number
              <input name="invoiceNumber" required maxLength={100} />
            </label>
            <label>
              Invoice total including GST (AUD)
              <input
                name="amount"
                required
                inputMode="decimal"
                pattern="[0-9]+(\.[0-9]{0,2})?"
              />
            </label>
            <label>
              Issued document
              <input
                type="file"
                name="file"
                accept="application/pdf,image/png,image/jpeg"
                required
              />
            </label>
            <p className="small">
              PDF, PNG or JPEG, up to 8 MB. The document remains quarantined
              until scanning completes. Do not include TFNs or other unnecessary
              identity information.
            </p>
            <button className="button primary" disabled={uploadBusy}>
              {uploadBusy ? "Uploading…" : "Submit invoice"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function ProfilePanel({
  data,
  command,
  busy,
}: {
  data: AppData;
  command: Command;
  busy: boolean;
}) {
  const p = data.people.find((p) => p.auth_user_id === data.userId);
  if (!p) return null;
  return (
    <>
      <PageTitle
        eyebrow="THE DETAILS BEHIND THE MUSIC"
        title="Your details."
        text="Keep your invoice information current. Verification is separate from submission."
      />
      <div className="two-columns">
        <section className="card">
          <div className="card-heading">
            <h2>Contact & business details</h2>
          </div>
          <form
            key={p.profile_version}
            className="card-body"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void command("profile", {
                personId: p.id,
                version: p.profile_version,
                name: f.get("name"),
                abn: f.get("abn"),
                gst: f.get("gst") === "on",
                notice: f.get("notice") === "on",
              }).catch(() => {});
            }}
          >
            <label>
              Legal name
              <input
                name="name"
                defaultValue={p.name}
                required
                maxLength={120}
              />
            </label>
            <label>
              Verified email
              <input readOnly value={p.email} />
            </label>
            <label>
              ABN, if applicable
              <input
                name="abn"
                defaultValue={p.abn ?? ""}
                inputMode="numeric"
                pattern="[0-9]{11}|"
                maxLength={11}
              />
            </label>
            <label className="check-label">
              <input
                name="gst"
                type="checkbox"
                defaultChecked={p.gst_registered}
              />
              Registered for GST
            </label>
            <div className="notice small">
              Your details are used for gig settlement and invoice matching.
              Your band manager can view these records. See Help & privacy for
              collection information.
            </div>
            <label className="check-label">
              <input
                name="notice"
                type="checkbox"
                required
                defaultChecked={Boolean(p.notice_accepted_at)}
              />
              I have read the collection notice.
            </label>
            <button className="button primary" disabled={busy}>
              Save my details
            </button>
            <p className="small">
              Changing identity details invalidates existing bank and fund
              verification for review.
            </p>
          </form>
        </section>
        <div className="editor-stack">
          {[
            ["Bank payment details", p.bank_status, Wallet],
            ["Super fund details", p.fund_status, Landmark],
          ].map(([title, status, Icon]) => {
            const Component = Icon as typeof Wallet;
            return (
              <section className="card" key={String(title)}>
                <div className="card-heading">
                  <h2>{String(title)}</h2>
                  <Component size={22} />
                </div>
                <div className="card-body">
                  <Badge tone="amber">{labelState(String(status))}</Badge>
                  <p>
                    Secure collection is awaiting an approved setup route. Your
                    manager will let you know when it is available.
                  </p>
                  <p className="small">
                    Please do not put bank accounts, fund member numbers or TFNs
                    into an agreement note or support message.
                  </p>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
