"use client";

/**
 * Who is at the table, for the admin page.
 *
 * Three counts that are routinely confused with one another: everybody who has
 * ever signed up, everybody who has staked in the last few minutes, and the
 * people with money on the round running right now. Signups are a vanity
 * figure on their own — the pair beside them is what says whether the platform
 * is actually being played.
 *
 * This is a live Convex query, so it re-renders as bets land. It is the one
 * panel on this page that should move on its own.
 */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function Tile(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-gray-950/50">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {props.label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{props.value}</p>
      {props.hint ? (
        <p className="mt-0.5 text-[11px] text-slate-500">{props.hint}</p>
      ) : null}
    </div>
  );
}

function Row(props: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{props.label}</span>
      <span
        className={
          props.tone === "warn"
            ? "font-medium tabular-nums text-amber-700 dark:text-amber-300"
            : "font-medium tabular-nums"
        }
      >
        {props.value}
      </span>
    </div>
  );
}

export default function LivePanel() {
  const overview = useQuery(api.adminDashboard.overview);
  const live = useQuery(api.adminDashboard.liveSession);

  const loading = overview === undefined || live === undefined;
  const round = live?.round ?? null;

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Table</h2>
        {round ? (
          <span
            className={
              round.phase === "entries"
                ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                : "rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300"
            }
          >
            {round.phase === "entries" ? "entries open" : "settling"} ·{" "}
            {round.secondsLeft}s
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile
          label="Total users"
          value={loading ? "…" : String(overview!.totalUsers)}
          hint={overview?.usersTruncated ? "capped at 5,000" : undefined}
        />
        <Tile
          label="Active"
          value={loading ? "…" : String(live!.activeUsers)}
          hint={
            live ? `staked in last ${live.activeWindowMinutes} min` : undefined
          }
        />
        <Tile
          label="This round"
          value={loading ? "…" : String(round?.players ?? 0)}
          hint={
            round
              ? `${round.bets} entr${round.bets === 1 ? "y" : "ies"}`
              : "no round"
          }
        />
      </div>

      {loading ? null : round === null ? (
        <p className="text-sm text-slate-500">
          No round is running. The engine sleeps when the table is empty — the
          next player through the door, or the heartbeat cron, opens one.
        </p>
      ) : (
        <div className="space-y-1.5 border-t border-slate-200 pt-4 text-sm dark:border-gray-800">
          <Row label="Staked this round" value={`$${round.stakedUsd.toFixed(2)}`} />
          <Row
            label="Up / down"
            value={`${round.upCount} / ${round.downCount}`}
          />
          <Row
            label="Volume up / down"
            value={`$${round.buyVolume.toFixed(2)} / $${round.sellVolume.toFixed(2)}`}
          />
          <Row
            label="Holders with a balance"
            value={String(overview!.holders)}
          />
          {round.willVoid ? (
            <Row
              label="Outcome if it settled now"
              value={round.bets === 0 ? "void — no bets" : "void — one-sided"}
              tone="warn"
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
