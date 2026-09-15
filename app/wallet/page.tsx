"use client";

/**
 * The wallet — one page for money in, money out and the ledger.
 *
 * It replaces three: `/game-payment` (a fiat provider picker that never
 * settled), `/withdraw` and `/withdraw/manual`. Splitting the same balance
 * across three screens meant a player who had deposited and wanted to play had
 * to navigate to find out whether their money had arrived. Here the balance is
 * at the top of the thing they are already looking at.
 */

import { useState } from "react";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import DepositPanel from "@/components/wallet/DepositPanel";
import WithdrawPanel from "@/components/wallet/WithdrawPanel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "deposit" | "withdraw" | "history";

export default function WalletPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.aurum.myBalance);
  const [tab, setTab] = useState<Tab>("deposit");

  if (isLoading) {
    return (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </Centered>
    );
  }

  if (!isAuthenticated) {
    return (
      <Centered>
        <div className="space-y-4 text-center">
          <p className="text-slate-600 dark:text-slate-300">
            Sign in to see your wallet.
          </p>
          <Link href="/signin">
            <Button>Sign in</Button>
          </Link>
        </div>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950">
      <header className="border-b border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <Link
            href="/play"
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to the table
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            Wallet
          </h1>
        </div>
      </header>

      <main className="container mx-auto max-w-lg px-4 py-6">
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Available balance
          </div>
          <div className="font-mono text-4xl font-semibold tabular-nums text-slate-900 dark:text-white">
            ${(me?.balance ?? 0).toFixed(2)}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Held for you on BNB Smart Chain. Deposits are free; withdrawals carry
            a small fee.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="flex border-b border-slate-200 dark:border-gray-800">
            {(["deposit", "withdraw", "history"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 px-4 py-3 text-sm font-medium capitalize transition-colors",
                  tab === t
                    ? "border-b-2 border-slate-900 text-slate-900 dark:border-white dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "deposit" && <DepositPanel />}
            {tab === "withdraw" && <WithdrawPanel />}
            {tab === "history" && <History />}
          </div>
        </div>
      </main>
    </div>
  );
}

function History() {
  const txs = useQuery(api.aurum.getUserTransactions, { limit: 25 });

  if (txs === undefined) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (txs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        Nothing here yet. Deposit to start playing.
      </p>
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-gray-800">
      {txs.map((t) => (
        <div key={t._id} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium capitalize text-slate-900 dark:text-slate-100">
              {t.type}
            </div>
            <div className="text-xs text-slate-500">
              {new Date(t.timestamp).toLocaleString()}
              {t.status !== "completed" ? ` · ${t.status}` : ""}
            </div>
          </div>
          <div
            className={cn(
              "shrink-0 font-mono text-sm tabular-nums",
              t.amount >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-700 dark:text-slate-300",
            )}
          >
            {t.amount >= 0 ? "+" : ""}
            {t.amount.toFixed(2)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-gray-950">
      {children}
    </div>
  );
}
