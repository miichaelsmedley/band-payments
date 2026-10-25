"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
export function MfaPanel() {
  const router = useRouter();
  const [state, setState] = useState<{
    aal?: string;
    factors?: { id: string; friendly_name: string }[];
    qr?: string;
    factorId?: string;
  }>({});
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false);
  async function action(action: string, fields: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...fields }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error.message);
      if (action === "mfa_verify") {
        setSuccess(true);
        setState({ aal: "aal2" });
        router.refresh();
      } else setState(j.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card section-gap">
      <div className="card-heading">
        <div>
          <h2>Multi-factor authentication</h2>
          <p>
            Payment approvals require an authenticator code as well as your
            password.
          </p>
        </div>
        <ShieldCheck size={22} />
      </div>
      <div className="card-body">
        {!state.aal && !state.qr && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => action("mfa_status")}
          >
            Check my MFA setup
          </button>
        )}
        {state.aal === "aal2" || success ? (
          <div className="notice">
            <ShieldCheck size={20} />
            Your current session has passed multi-factor verification.
          </div>
        ) : (
          <>
            {state.aal && state.factors?.length === 0 && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => action("mfa_enroll")}
              >
                Set up authenticator
              </button>
            )}
            {state.qr && (
              <div>
                <p>
                  Scan this code using your authenticator app, then enter its
                  six-digit code.
                </p>
                <img
                  src={state.qr}
                  alt="Authenticator setup QR code"
                  width={200}
                  height={200}
                />
              </div>
            )}
            {(state.factorId || Boolean(state.factors?.length)) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action("mfa_verify", {
                    factorId: state.factorId ?? f.get("factorId"),
                    code: f.get("code"),
                  });
                }}
              >
                {!state.factorId && (
                  <label>
                    Authenticator
                    <select name="factorId">
                      {state.factors?.map((f) => (
                        <option value={f.id} key={f.id}>
                          {f.friendly_name || "Authenticator"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Six-digit code
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  Verify this session
                </button>
              </form>
            )}
          </>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <p className="small">
          MFA does not grant an approval role. Your workspace owner must
          designate approvers separately.
        </p>
      </div>
    </section>
  );
}
