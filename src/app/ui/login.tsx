"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  ArrowUpRight,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
export function Login({
  configured,
  local,
  signedIn = false,
}: {
  configured: boolean;
  local: boolean;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function signIn(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error.message);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <a href="/" className="brand">
          <AudioLines size={34} />
          <span>
            band<span className="brand-light">payments</span>
          </span>
        </a>
        <div>
          <span className="eyebrow">FROM THE LAST NOTE TO THE LAST CENT</span>
          <h1>
            Good gigs.
            <br />
            Clear payments.
          </h1>
          <p>
            Give every performance a clear finish. Keep the gig budget, player
            invoices and super in one considered place.
          </p>
          <div className="login-note">
            <ShieldCheck />
            <span>
              One gig. Two payment paths.
              <br />
              <small>Player invoices and super stay separate.</small>
            </span>
          </div>
        </div>
        <span className="attribution">
          A band finance workspace · PRIS connection pending
        </span>
      </section>
      <section className="login-form">
        <span className="eyebrow">YOUR BACKSTAGE DESK</span>
        <h2>{signedIn ? "Join your band workspace" : "Welcome back"}</h2>
        <p>
          {signedIn
            ? "Enter the invitation code provided by your band manager."
            : "Sign in to manage your gigs or review your own payments."}
        </p>
        {!configured ? (
          <div className="notice">
            Supabase has not been configured. Follow the local setup
            instructions in the project README.
          </div>
        ) : signedIn ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const form = new FormData(e.currentTarget);
              try {
                const r = await fetch("/api/v1/commands", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "claim_invitation",
                    token: form.get("token"),
                  }),
                });
                const j = await r.json();
                if (!r.ok) throw Error(j.error.message);
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
              setBusy(false);
            }}
          >
            <label>
              Invitation code
              <input name="token" required autoComplete="off" />
            </label>
            <button className="button primary" disabled={busy}>
              Join workspace <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="button quiet"
              onClick={() => signIn({ action: "signout" })}
            >
              Sign out
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              signIn({ email: f.get("email"), password: f.get("password") });
            }}
          >
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="button primary full" disabled={busy}>
              Sign in <ArrowUpRight size={18} />
            </button>
            <p className="small">
              Access is by invitation. Contact your band manager for account
              access or recovery.
            </p>
          </form>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {local && (
          <div className="local-access">
            <span className="badge amber">LOCAL DEVELOPMENT</span>
            <h3>Explore the working application</h3>
            <p>
              Isolated Supabase accounts with synthetic data. No real band
              selected and no payments enabled.
            </p>
            <div className="actions">
              {(["manager", "player", "reviewer"] as const).map((role) => (
                <button
                  className="button secondary"
                  key={role}
                  disabled={busy}
                  onClick={() => signIn({ action: "local", role })}
                >
                  Open as {role}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
