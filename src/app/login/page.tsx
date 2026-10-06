"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [setup, setSetup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        setup ? "/api/auth/bootstrap" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            setup
              ? { token, email, password, organizationName, organizationSlug }
              : { email, password, organizationSlug },
          ),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Sign-in failed.");
      router.push("/operations");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Sign-in failed.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-context" aria-label="Ophanim product context">
        <Link className="auth-brand" href="/" aria-label="Ophanim home">
          <span aria-hidden="true">O</span>
          <strong>Ophanim</strong>
        </Link>
        <div className="auth-context__copy">
          <p>Operations intelligence</p>
          <h1>Know what outside events matter to your shipments.</h1>
          <ul>
            <li>
              <Check aria-hidden="true" size={15} /> Organization-isolated data
            </li>
            <li>
              <Check aria-hidden="true" size={15} /> Evidence retained with
              every signal
            </li>
            <li>
              <Check aria-hidden="true" size={15} /> CSV and Excel shipment
              imports
            </li>
          </ul>
        </div>
        <p className="auth-context__note">
          Your existing systems run the freight. Ophanim watches the world for
          it.
        </p>
      </section>

      <section className="auth-form-pane">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-form__heading">
            <span>
              <LockKeyhole aria-hidden="true" size={16} />
            </span>
            <div>
              <p>{setup ? "Workspace setup" : "Secure access"}</p>
              <h2>
                {setup ? "Create your organization" : "Sign in to Ophanim"}
              </h2>
            </div>
          </div>

          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}

          <label>
            Organization slug
            <input
              value={organizationSlug}
              onChange={(event) => setOrganizationSlug(event.target.value)}
              autoComplete="organization"
              required
            />
          </label>
          {setup && (
            <>
              <label>
                Organization name
                <input
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  autoComplete="organization"
                  required
                />
              </label>
              <label>
                Setup token
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  type="password"
                  autoComplete="one-time-code"
                  required
                />
              </label>
            </>
          )}
          <label>
            Work email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={setup ? "new-password" : "current-password"}
              required
            />
          </label>

          <button type="submit" className="auth-submit" disabled={saving}>
            {saving ? "Please wait" : setup ? "Create organization" : "Sign in"}
            {!saving && <ArrowRight aria-hidden="true" size={16} />}
          </button>
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setSetup((value) => !value);
              setError("");
            }}
          >
            {setup
              ? "Sign in to an existing organization"
              : "Set up the first organization"}
          </button>
        </form>
      </section>
    </main>
  );
}
