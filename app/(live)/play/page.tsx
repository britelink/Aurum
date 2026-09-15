"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import LiveGame from "@/components/game/LiveGame";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet } from "lucide-react";

/**
 * The table.
 *
 * Reads `myBalance` rather than `getCurrentUser`: the whole user row was being
 * pushed to every open tab on any write to it — a remembered payout address, a
 * phone number — and this page only ever wanted the number in the header.
 */
export default function PlayPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.aurum.myBalance);

  if (isLoading) return <Centered><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></Centered>;

  if (!isAuthenticated) {
    return (
      <Centered>
        <div className="space-y-4 text-center">
          <p className="text-slate-600 dark:text-slate-300">
            Sign in to take a position.
          </p>
          <Link href="/signin">
            <Button>Sign in</Button>
          </Link>
        </div>
      </Centered>
    );
  }

  const balance = me?.balance ?? 0;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950">
      <header className="border-b border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Penny Game
          </h1>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                Balance
              </div>
              <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
                ${balance.toFixed(2)}
              </div>
            </div>
            <Link href="/wallet">
              <Button variant="outline" size="sm" className="gap-2">
                <Wallet className="h-4 w-4" />
                Wallet
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-6">
        {/*
         * The table renders regardless of balance. Hiding it behind a deposit
         * wall — which is what this page used to do below $1 — meant a new
         * player's first impression of the game was a form, with no idea what
         * they were being asked to fund. The chart runs; only the buttons need
         * money.
         */}
        {balance < 1 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-700/50 dark:bg-amber-900/20">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                Watch as long as you like — you need $1 to take a position.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Deposits are free and land in a couple of minutes.
              </p>
            </div>
            <Link href="/wallet">
              <Button>Add funds</Button>
            </Link>
          </div>
        )}

        <LiveGame />

        <p className="mt-4 text-center text-xs text-slate-500">
          30 seconds to take a side, 30 seconds for the price to run. Winners
          share the losing pool after an 8% house cut; a one-sided round is
          voided and every stake comes back.
        </p>
      </main>
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
