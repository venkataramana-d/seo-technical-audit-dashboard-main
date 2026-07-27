"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/state/AuthContext";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        await signup(email.trim(), password, orgName.trim());
      } else {
        await login(email.trim(), password);
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-[var(--seo-radius-sm)] border border-[var(--seo-border-strong)] bg-[var(--seo-card-bg)] px-3.5 py-2.5 text-[14px] text-[var(--seo-text)] outline-none transition focus:border-[var(--seo-accent)] focus:ring-2 focus:ring-[var(--seo-accent-light)] placeholder:text-[var(--seo-placeholder)]";
  const labelCls = "mb-1.5 block text-[12.5px] font-semibold text-[var(--seo-subheading)]";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--seo-app-bg)] px-4 py-10">
      <div className="w-full max-w-[400px]">
        {/* Brand */}
        <div className="mb-7 flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[var(--seo-radius-sm)] text-white"
            style={{ background: "var(--seo-gradient)" }}
            aria-hidden="true"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx={11} cy={11} r={7} />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <span className="text-[15px] font-bold tracking-tight text-[var(--seo-heading)]">
            SEO Technical Audit
          </span>
        </div>

        <div
          className="rounded-[var(--seo-radius-lg)] border border-[var(--seo-border)] bg-[var(--seo-card-bg)] p-6 shadow-[var(--seo-shadow-lg)] sm:p-7"
        >
          <h1 className="text-[20px] font-bold tracking-tight text-[var(--seo-heading)]">
            {mode === "login" ? "Welcome back" : "Create your workspace"}
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--seo-text-light)]">
            {mode === "login"
              ? "Sign in to your audit workspace."
              : "Start auditing sites and saving your crawl history."}
          </p>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            {mode === "signup" && (
              <div>
                <label className={labelCls} htmlFor="orgName">Workspace name</label>
                <input
                  id="orgName"
                  className={inputCls}
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Marketing"
                  required
                  autoComplete="organization"
                />
              </div>
            )}
            <div>
              <label className={labelCls} htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-[var(--seo-radius-sm)] border px-3.5 py-2.5 text-[13px]"
                style={{
                  background: "var(--seo-error-bg)",
                  borderColor: "var(--seo-error-border)",
                  color: "var(--seo-error)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 flex items-center justify-center rounded-[var(--seo-radius-sm)] btn-gradient px-4 py-2.5 text-[14px] font-semibold text-white transition disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[13px] text-[var(--seo-text-light)]">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              setMode(mode === "login" ? "signup" : "login");
            }}
            className="font-semibold text-[var(--seo-accent)] hover:underline"
          >
            {mode === "login" ? "Create a workspace" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
