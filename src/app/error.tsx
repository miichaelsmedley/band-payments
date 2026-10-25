"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login-form">
      <span className="eyebrow">WORKSPACE UNAVAILABLE</span>
      <h1>We couldn’t load your records.</h1>
      <p>
        Your saved data has not been changed. Check the connection and try
        again.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
