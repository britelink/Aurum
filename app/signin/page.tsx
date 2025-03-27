"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UseGoogleSignIn } from "./UseGoogle";
import Link from "next/link";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-800 via-blue-900 to-slate-900">
      {/* Logo / Header */}
      <div className="px-8 py-6">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-amber-500 rounded-md flex items-center justify-center mr-3">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3 9L12 4L21 9L12 14L3 9Z" fill="white" />
              <path d="M3 14L12 19L21 14" stroke="white" strokeWidth="2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Penny Game</h1>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {/* Form header */}
            <div className="px-8 pt-8 pb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {flow === "signIn"
                  ? "Sign in to your account"
                  : "Create your account"}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {flow === "signIn"
                  ? "Access your portfolio and trading dashboard"
                  : "Start your trading journey with Penny Game"}
              </p>
            </div>

            {/* Form content */}
            <div className="px-8 pb-8">
              <div className="space-y-5">
                {/* Google sign-in */}
                <UseGoogleSignIn />

                {/* Divider */}
                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                  <span className="flex-shrink mx-4 text-sm text-slate-400">
                    or continue with email
                  </span>
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                </div>

                {/* Email form 
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target as HTMLFormElement);
                    formData.set("flow", flow);
                    void signIn("password", formData)
                      .catch((error) => {
                        setError(error.message);
                      })
                      .then(() => {
                        router.push("/");
                      });
                  }}
                >
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Email address
                    </label>
                    <input
                      id="email"
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      type="email"
                      name="email"
                      placeholder="you@example.com"
                      required
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
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      type="password"
                      name="password"
                      placeholder="••••••••"
                      required
                    />
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
                    className="w-full py-3 px-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-blue-900 font-medium rounded-lg shadow-sm transition-all"
                  >
                    {flow === "signIn" ? "Sign in" : "Create account"}
                  </button>

                </form>*/}

                <div className="text-center mt-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {flow === "signIn"
                      ? "Don't have an account?"
                      : "Already have an account?"}
                    <span
                      className="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium cursor-pointer"
                      onClick={() =>
                        setFlow(flow === "signIn" ? "signUp" : "signIn")
                      }
                    >
                      {flow === "signIn" ? "Sign up" : "Sign in"}
                    </span>
                  </p>
                </div>
                {/* Terms */}
                <p className="text-xs text-center text-slate-500 dark:text-slate-500 mt-6">
                  By signing in, you agree to our{" "}
                  <Link
                    href="#"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="#"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Market stats */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-blue-900/50 backdrop-blur-sm border border-blue-500/20 p-3 rounded-md">
              <div className="text-xs text-blue-300">Success Rate</div>
              <div className="text-xl font-bold text-white">85%</div>
            </div>
            <div className="bg-blue-900/50 backdrop-blur-sm border border-blue-500/20 p-3 rounded-md">
              <div className="text-xs text-blue-300">Avg. Return</div>
              <div className="text-xl font-bold text-white">180%</div>
            </div>
            <div className="bg-blue-900/50 backdrop-blur-sm border border-blue-500/20 p-3 rounded-md">
              <div className="text-xs text-blue-300">Active Bets</div>
              <div className="text-xl font-bold text-white">12.7K</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
