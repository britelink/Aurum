"use client";

/**
 * The treasury, live.
 *
 * Answers one question in one glance: **can players cash out right now, and if
 * not, what is missing?** Everything else on this panel exists to make that
 * answer actionable rather than merely true.
 *
 * It is a `useQuery`, not a button. The old float check told you what was true
 * at the moment you pressed it, which is the wrong shape for the number that
 * decides whether withdrawals work — you end up trusting a figure from whenever
 * you last looked. This re-renders by itself every time the cron writes a new
 * reading.
 *
 * Addresses are shown next to their balances, always. This project has had five
 * wallets in play across SGX and Penny, and a balance with no address beside it
 * is how somebody funds the wrong one.
 */

import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCallback, useEffect, useState } from "react";

function Row({
  label,
  value,
  hint,
  bad,
}: {
  label: string;
  value: string;
  hint?: string;
  bad?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right">
        <span
          className={`font-mono text-sm ${
            bad
              ? "text-rose-600 dark:text-rose-400"
              : "text-slate-900 dark:text-slate-100"
          }`}
        >
          {value}
        </span>
        {hint && (
          <span className="ml-2 text-xs text-slate-400">{hint}</span>
        )}
      </span>
    </div>
  );
}

/** Why payouts are shut, in the operator's vocabulary rather than the player's. */
const REASON_TEXT: Record<string, string> = {
  kill_switch: "Manually paused — AURUM_WITHDRAWALS_PAUSED is set",
  no_reading: "No balance reading yet — the snapshot cron has not run",
  stale: "The last reading is too old to trust",
  no_gas: "Out of gas — the wallet cannot broadcast a transaction",
  short: "No USDT — there is nothing to pay out",
};

export default function TreasuryPanel() {
  const status = useQuery(api.floatGate.treasuryStatus);
  const refresh = useAction(api.floatGate.refreshTreasury);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doRefresh = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await refresh({});
      if (!r.ok && r.reason) setErr(r.reason);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  /*
   * Take a fresh reading when the panel opens. Someone opening this screen is
   * almost always asking "what is true *now*", and the cached answer can be ten
   * minutes old.
   */
  useEffect(() => {
    void doRefresh();
  }, [doRefresh]);

  if (status === undefined) {
    return (
      <section className="rounded-xl border border-slate-200 p-5 dark:border-slate-800">
        <p className="text-sm text-slate-500">Reading the treasury…</p>
      </section>
    );
  }

  const open = status.available;
  const ageSec = status.ageMs === null ? null : Math.round(status.ageMs / 1000);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">Treasury</h2>
        <button
          onClick={doRefresh}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          {busy ? "Reading…" : "Refresh"}
        </button>
      </div>

      {/* The headline. Everything below explains it. */}
      <div
        className={`rounded-lg px-4 py-3 ${
          open
            ? "bg-emerald-50 dark:bg-emerald-950/40"
            : "bg-amber-50 dark:bg-amber-950/40"
        }`}
      >
        <p
          className={`text-sm font-semibold ${
            open
              ? "text-emerald-800 dark:text-emerald-300"
              : "text-amber-900 dark:text-amber-300"
          }`}
        >
          {open ? "Withdrawals are OPEN" : "Withdrawals are CLOSED"}
        </p>
        {!open && status.reason && (
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-400">
            {REASON_TEXT[status.reason] ?? status.reason}
          </p>
        )}
        {!open && (status.needsGas || status.needsFunds) && (
          /*
           * The actionable line. "Closed" is a state; this is an instruction,
           * and it names the address so the fix cannot land in the wrong wallet.
           */
          <p className="mt-2 text-xs text-amber-900 dark:text-amber-300">
            Send{" "}
            {status.needsGas && status.needsFunds
              ? "BNB and USDT"
              : status.needsGas
                ? "BNB"
                : "USDT"}{" "}
            to{" "}
            <span className="font-mono">{status.payoutAddress ?? "—"}</span>.
            Withdrawals reopen on their own.
          </p>
        )}
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <Row
          label="USDT (payout float)"
          value={status.usdt === null ? "—" : status.usdt.toFixed(6)}
          bad={status.needsFunds === true}
        />
        <Row
          label="BNB (gas)"
          value={status.bnb === null ? "—" : status.bnb.toFixed(8)}
          hint={`min ${status.minGasBnb}`}
          bad={status.needsGas === true}
        />
        <Row
          label="Reading age"
          value={ageSec === null ? "never" : `${ageSec}s`}
          hint={status.stale ? "too old to trust" : undefined}
          bad={status.stale}
        />
      </div>

      <div className="space-y-1 border-t border-slate-100 pt-3 dark:border-slate-800">
        <p className="text-xs text-slate-500">
          Payout wallet{" "}
          <span className="font-mono text-slate-700 dark:text-slate-300">
            {status.payoutAddress ?? "not configured"}
          </span>
        </p>
        <p className="text-xs text-slate-500">
          Fee wallet{" "}
          <span className="font-mono text-slate-700 dark:text-slate-300">
            {status.feeAddress ?? "not configured"}
          </span>{" "}
          <span className="text-slate-400">— receives only, needs no gas</span>
        </p>
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
    </section>
  );
}
