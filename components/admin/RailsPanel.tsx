"use client";

/**
 * Rails health, for the admin page.
 *
 * Two numbers and one check, chosen because they are the three things that go
 * wrong silently:
 *
 *  - **The agent float.** Every queued payout is drawn from it. When it runs
 *    dry, payouts fail one after another with "needs more than it holds", and
 *    the first anyone hears about it is a player asking where their money is.
 *  - **The BNB balance.** A wallet full of USDT and out of gas cannot send
 *    anything, and the failure reads as a chain error rather than as "top up".
 *  - **Chessa reachability.** The off-ramp calls Chessa's Convex directly with
 *    a shared secret. If that secret drifts, every EcoCash cash-out fails at the
 *    bridge — asking for a rate proves the link without booking a remittance
 *    somebody then has to cancel.
 *
 * Nothing here polls. Both reads cost a round trip to the chain or to Chessa,
 * so they happen when an operator asks.
 */

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type Float = Awaited<ReturnType<ReturnType<typeof useAction<typeof api.railsSandbox.agentFloat>>>>;
type ChessaCheck = Awaited<
  ReturnType<ReturnType<typeof useAction<typeof api.railsSandbox.checkChessaRail>>>
>;

export default function RailsPanel() {
  const sandbox = useQuery(api.railsSandbox.sandboxStatus);
  const rail = useQuery(api.deposits.depositRailStatus);
  const getFloat = useAction(api.railsSandbox.agentFloat);
  const checkChessa = useAction(api.railsSandbox.checkChessaRail);

  const [float, setFloat] = useState<Float | null>(null);
  const [floatErr, setFloatErr] = useState<string | null>(null);
  const [floatBusy, setFloatBusy] = useState(false);

  const [chessa, setChessa] = useState<ChessaCheck | null>(null);
  const [chessaBusy, setChessaBusy] = useState(false);

  const loadFloat = async () => {
    setFloatBusy(true);
    setFloatErr(null);
    try {
      setFloat(await getFloat({}));
    } catch (e) {
      setFloatErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFloatBusy(false);
    }
  };

  const runChessaCheck = async () => {
    setChessaBusy(true);
    try {
      setChessa(await checkChessa({}));
    } catch (e) {
      setChessa({
        ok: false,
        convexUrl: null,
        secretConfigured: false,
        rate: null,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setChessaBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Rails</h2>
        {sandbox?.enabled && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            sandbox enabled
          </span>
        )}
      </div>

      {/* Inbound ------------------------------------------------------- */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Deposits</span>
          <span
            className={
              rail?.available
                ? "font-medium text-emerald-600 dark:text-emerald-400"
                : "font-medium text-rose-600 dark:text-rose-400"
            }
          >
            {rail === undefined
              ? "…"
              : rail.available
                ? "accepting"
                : "not configured"}
          </span>
        </div>
        {rail?.depositAddress && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Landing at</span>
            <span className="truncate font-mono text-xs">
              {rail.depositAddress}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Deposit fee</span>
          <span className="font-medium">
            {rail ? (rail.feePercent === 0 ? "free" : `${rail.feePercent}%`) : "…"}
          </span>
        </div>
      </div>

      {/* Float --------------------------------------------------------- */}
      <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">Agent wallet float</span>
          <button
            type="button"
            onClick={loadFloat}
            disabled={floatBusy}
            className="text-sm text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
          >
            {floatBusy ? "Checking…" : "Check"}
          </button>
        </div>
        {floatErr && <p className="text-sm text-rose-600">{floatErr}</p>}
        {float?.configured === false && (
          <p className="text-sm text-rose-600">
            No agent wallet configured — set AURUM_AGENT_PRIVATE_KEY.
          </p>
        )}
        {float?.configured && (
          <div className="space-y-1 text-sm">
            <div className="truncate font-mono text-xs text-slate-500">
              {float.address}
            </div>
            {Object.entries(float.balances).map(([symbol, amount]) => (
              <div key={symbol} className="flex justify-between gap-4">
                <span className="text-slate-500">{symbol}</span>
                <span className="font-mono tabular-nums">
                  {Number.isFinite(amount) ? amount.toFixed(2) : "—"}
                </span>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">BNB (gas)</span>
              <span
                className={
                  // Roughly a hundred transfers' worth. Below this, payouts are
                  // days from failing and nothing else says so.
                  Number.isFinite(float.bnb) && float.bnb < 0.01
                    ? "font-mono tabular-nums text-rose-600 dark:text-rose-400"
                    : "font-mono tabular-nums"
                }
              >
                {Number.isFinite(float.bnb) ? float.bnb.toFixed(4) : "—"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Chessa -------------------------------------------------------- */}
      <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">Chessa off-ramp</span>
          <button
            type="button"
            onClick={runChessaCheck}
            disabled={chessaBusy}
            className="text-sm text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
          >
            {chessaBusy ? "Checking…" : "Check"}
          </button>
        </div>
        {chessa && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Reachable</span>
              <span
                className={
                  chessa.ok
                    ? "font-medium text-emerald-600 dark:text-emerald-400"
                    : "font-medium text-rose-600 dark:text-rose-400"
                }
              >
                {chessa.ok ? "yes" : "no"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Bridge secret</span>
              <span className="font-medium">
                {chessa.secretConfigured ? "set" : "missing"}
              </span>
            </div>
            {chessa.convexUrl && (
              <div className="truncate font-mono text-xs text-slate-500">
                {chessa.convexUrl}
              </div>
            )}
            {chessa.error && (
              <p className="text-sm text-rose-600">{chessa.error}</p>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500">
          Asks Chessa for a rate. Read-only — it books nothing.
        </p>
      </div>
    </section>
  );
}
