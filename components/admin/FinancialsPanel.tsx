"use client";

/**
 * The money, for the admin page.
 *
 * Ordered the way the questions actually get asked: what do we owe, what came
 * in and went out, what the table earned, and what the house kept. Liability
 * leads deliberately — volume figures look healthy right up until the float
 * cannot cover the balances they produced.
 *
 * Every figure is derived from the ledger and the rounds, not from a stored
 * counter, so a missed increment cannot silently flatter the numbers. The cost
 * of that is a scan cap: when the ledger is longer than the cap the totals are
 * partial, and the panel says so rather than showing a confident wrong number.
 */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function Line(props: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-slate-500">
        {props.label}
        {props.hint ? (
          <span className="ml-1 text-[11px] text-slate-400">{props.hint}</span>
        ) : null}
      </span>
      <span
        className={
          props.strong
            ? "font-semibold tabular-nums"
            : "font-medium tabular-nums"
        }
      >
        {props.value}
      </span>
    </div>
  );
}

function Group(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 border-t border-slate-200 pt-4 text-sm dark:border-gray-800">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {props.title}
      </p>
      {props.children}
    </div>
  );
}

export default function FinancialsPanel() {
  const o = useQuery(api.adminDashboard.overview);

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Financials</h2>
        {o ? (
          <span className="text-[11px] text-slate-500 tabular-nums">
            1 USDT = ${o.usdPerUsdt.toFixed(4)}
          </span>
        ) : null}
      </div>

      {o === undefined ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div>
            <p className="text-sm text-slate-500">Owed to players</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {usd(o.owedUsd)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {o.owedUsdt.toFixed(2)} USDT the float must cover ·{" "}
              {o.holders} holder{o.holders === 1 ? "" : "s"}
            </p>
          </div>

          <Group title="Liability">
            <Line label="Withdrawable now" value={usd(o.withdrawableUsd)} />
            <Line
              label="Locked winnings"
              value={usd(o.lockedWinningsUsd)}
              hint="not yet payable"
            />
          </Group>

          <Group title="Flow">
            <Line label="Deposited, all time" value={usd(o.depositedAllTime)} />
            <Line label="Withdrawn, all time" value={usd(o.withdrawnAllTime)} />
            <Line label="Net inflow" value={usd(o.netInflow)} strong />
          </Group>

          <Group title="Play">
            <Line
              label="Total staked"
              value={usd(o.staked)}
              hint={`${o.betCount.toLocaleString()} bets`}
            />
            <Line label="Paid to winners" value={usd(o.won)} />
            <Line label="Refunded (void rounds)" value={usd(o.refunded)} />
            <Line
              label="Gross gaming revenue"
              value={usd(o.grossGamingRevenue)}
              hint="staked − won"
              strong
            />
          </Group>

          <Group title="House">
            <Line
              label="Rake on settled rounds"
              value={usd(o.houseRake)}
              hint={`${o.roundsSettled} rounds`}
            />
            <Line label="Rail fees earned" value={usd(o.feesEarned)} />
          </Group>

          {o.ledgerTruncated ? (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              The ledger is longer than this query reads, so every all-time
              figure above is a floor, not a total. Move these to running
              counters before they are used for anything that matters.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
