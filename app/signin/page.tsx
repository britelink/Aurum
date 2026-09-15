"use client";

/**
 * Sign in.
 *
 * Rebuilt because this page could not sign anybody in. The email form was
 * commented out, leaving a Google button as the only route — and Google has no
 * credentials on this deployment, so `signIn("google")` threw, the handler
 * logged to the console, and the button appeared to do nothing at all.
 *
 * Now: the password form works (Convex Auth's `Password` provider needs no
 * third party), Google appears only when it can actually complete, and every
 * failure is shown to the person who caused it instead of to a console nobody
 * has open.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { UseGoogleSignIn } from "./UseGoogle";
import Link from "next/link";

type Flow = "signIn" | "signUp";

export default function SignIn() {
  const [flow, setFlow] = useState<Flow>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuthActions();
  const router = useRouter();
  const providers = useQuery(api.authStatus.providers);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const formData = new FormData(e.currentTarget);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
      router.push("/play");
    } catch (err) {
      /*
       * Convex Auth deliberately does not say which half was wrong, and the
       * raw message is a server stack line. Translate the one case a person can
       * act on — the wrong flow — and keep the rest short.
       */
      const raw = err instanceof Error ? err.message : String(err);
      setError(
        raw.includes("InvalidAccountId") || raw.includes("InvalidSecret")
          ? flow === "signIn"
            ? "That email and password did not match. If you are new, create an account instead."
            : "That email is already registered. Sign in instead."
          : "Could not complete that. Check the details and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-800 via-blue-900 to-slate-900">
      <div className="px-8 py-6">
        <Link href="/" className="flex items-center">
          <div className="w-10 h-10 bg-amber-500 rounded-md flex items-center justify-center mr-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 9L12 4L21 9L12 14L3 9Z" fill="white" />
              <path d="M3 14L12 19L21 14" stroke="white" strokeWidth="2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Penny Game</h1>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-8 pt-8 pb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {flow === "signIn"
                  ? "Sign in to your account"
                  : "Create your account"}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {flow === "signIn"
                  ? "Pick a side, watch the price run."
                  : "Deposit is free. You need $1 to take a position."}
              </p>
            </div>

            <div className="px-8 pb-8">
              <div className="space-y-5">
                {/* Only offered when the deployment can actually complete it. */}
                {providers?.google && (
                  <>
                    <UseGoogleSignIn onError={setError} />
                    <div className="relative flex items-center py-2">
                      <div className="flex-grow border-t border-slate-200 dark:border-slate-700" />
                      <span className="flex-shrink mx-4 text-sm text-slate-400">
                        or continue with email
                      </span>
                      <div className="flex-grow border-t border-slate-200 dark:border-slate-700" />
                    </div>
                  </>
                )}

                <form className="space-y-4" onSubmit={submit}>
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Email address
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={
                        flow === "signIn" ? "current-password" : "new-password"
                      }
                      required
                      minLength={8}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    {flow === "signUp" && (
                      <p className="mt-1 text-xs text-slate-500">
                        At least 8 characters.
                      </p>
                    )}
                  </div>

                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <p className="text-red-600 dark:text-red-400 text-sm">
                        {error}
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-3 px-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 disabled:opacity-60 text-blue-900 font-medium rounded-lg shadow-sm transition-all"
                  >
                    {busy
                      ? "Working…"
                      : flow === "signIn"
                        ? "Sign in"
                        : "Create account"}
                  </button>
                </form>

                <div className="text-center mt-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {flow === "signIn"
                      ? "Don't have an account?"
                      : "Already have an account?"}
                    <button
                      type="button"
                      className="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                      onClick={() => {
                        setError(null);
                        setFlow(flow === "signIn" ? "signUp" : "signIn");
                      }}
                    >
                      {flow === "signIn" ? "Create one" : "Sign in"}
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-white/50">
            <Link href="/" className="hover:text-white/80">
              Back to the homepage
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
