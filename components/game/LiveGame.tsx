"use client";

/**
 * The live table.
 *
 * Replaces the old `TradingChart`, which was a demo wearing the live page's
 * clothes: it invented its own price with `Math.random()` in each browser,
 * populated the book with fabricated "players", and settled against numbers no
 * chart had drawn. Two people sitting side by side saw two different games.
 *
 * Here the chart *is* the round. The curve is `priceSeries(round.seed)` from
 * `convex/gameLib`, the same pure function the settlement mutation calls, so
 * what the line does on screen is what decides the payout — and everyone's
 * screen draws the identical line.
 *
 * The database is read once per round, not once per frame. One subscription
 * (`liveRound`) carries the round, the book and this player's position; the
 * animation runs entirely off `seed` and a local clock corrected against the
 * server's. Nothing is written or polled while the price moves.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  BETTING_MS,
  PROCESSING_MS,
  ROUND_MS,
  TICK_MS,
  priceFromSeries,
  priceSeries,
} from "@/convex/gameLib";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

type BetAmount = 1 | 2;
type Direction = "up" | "down";

const CHART_W = 1000;
const CHART_H = 340;
/** Vertical half-range around the axis, in price units. Clamped, never rescaled
 * mid-round: an auto-fitting axis makes a flat round look dramatic and a wild
 * one look calm, which is the opposite of what a player needs to read. */
const CHART_SPAN = 6;

export default function LiveGame() {
  const live = useQuery(api.gameEngine.liveRound);
  const results = useQuery(api.gameEngine.recentResults, { limit: 10 });
  const placeBet = useMutation(api.gameEngine.placeBet);
  const startIfIdle = useMutation(api.gameEngine.startIfIdle);

  const [betAmount, setBetAmount] = useState<BetAmount>(1);
  const [submitting, setSubmitting] = useState<Direction | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const round = live?.round ?? null;
  const myBet = live?.myBet ?? null;

  /*
   * Clock skew, pinned by observation rather than asked for.
   *
   * A browser a few seconds off draws the price in the wrong phase and — worse
   * — shows the betting window open after the server has closed it. The obvious
   * fix is to have the query return a server timestamp, but `Date.now()` inside
   * a Convex query is cached and only invalidated by a write, so that number can
   * be a minute stale: confidently wrong is worse than absent.
   *
   * So the offset is taken the one moment it can be measured honestly — when a
   * round id we have not seen before arrives while this component is mounted.
   * That push happens within network latency of the server writing
   * `startTime`, so `startTime - Date.now()` is the offset to within a few
   * hundred milliseconds.
   *
   * Joining mid-round there is nothing to measure, so the offset stays zero
   * until the next boundary and then corrects itself. Timing is enforced by
   * `placeBet` regardless; this only decides what the chart looks like.
   */
  const skewRef = useRef(0);
  const lastRoundIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!round) return;
    if (lastRoundIdRef.current === null) {
      // First round we have seen — we may have joined it halfway through, so
      // there is nothing to learn from it. Remember it and wait for the next.
      lastRoundIdRef.current = round.id;
      return;
    }
    if (lastRoundIdRef.current !== round.id) {
      lastRoundIdRef.current = round.id;
      skewRef.current = round.startTime - Date.now();
    }
  }, [round]);
  const skew = skewRef.current;

  /** Wake the engine if nobody has played for long enough that it went idle. */
  useEffect(() => {
    if (live && live.round === null) {
      void startIfIdle({}).catch(() => {});
    }
  }, [live, startIfIdle]);

  /*
   * One timer for the whole component, at the sample rate of the curve itself.
   * Anything faster redraws points that have not changed; anything slower makes
   * the line visibly step.
   */
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS / 2);
    return () => window.clearInterval(id);
  }, []);

  // Recomputed only when the round changes — 241 samples, once.
  const series = useMemo(
    () => (round ? priceSeries(round.seed) : null),
    [round?.seed], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const serverNow = now + skew;
  const elapsed = round ? serverNow - round.startTime : 0;
  const bettingOpen =
    round !== null && round.status === "open" && elapsed < BETTING_MS;
  const secondsLeft = round
    ? Math.max(
        0,
        Math.ceil(
          ((bettingOpen ? round.endTime : round.processingEndTime) - serverNow) /
            1000,
        ),
      )
    : 0;

  const price =
    series && round ? priceFromSeries(series, Math.min(elapsed, ROUND_MS)) : 0;
  const axis = round?.neutralAxis ?? 0;
  // Before betting closes the axis has not been crossed yet, so there is no
  // "winning side" to colour — showing one would be inventing a result.
  const delta = round && elapsed >= BETTING_MS ? price - axis : 0;

  const submit = useCallback(
    async (direction: Direction) => {
      if (!round || !bettingOpen || myBet || submitting) return;
      setSubmitting(direction);
      try {
        await placeBet({
          sessionId: round.id,
          amount: betAmount,
          direction,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not place that bet";
        // Convex wraps thrown errors; the useful sentence is the last line.
        toast.error(msg.split("\n").pop() ?? msg);
      } finally {
        setSubmitting(null);
      }
    },
    [round, bettingOpen, myBet, submitting, placeBet, betAmount],
  );

  if (live === undefined) {
    return (
      <div className="flex h-[440px] items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!round || !series) {
    return (
      <div className="flex h-[440px] flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-center dark:border-gray-800 dark:bg-gray-900">
        <p className="font-medium text-slate-700 dark:text-slate-200">
          Opening the next round…
        </p>
        <p className="text-sm text-slate-500">
          The table starts as soon as someone sits down.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <Header
          price={price}
          axis={axis}
          delta={delta}
          bettingOpen={bettingOpen}
          secondsLeft={secondsLeft}
          buyVolume={round.totalBuyVolume}
          sellVolume={round.totalSellVolume}
          buyCount={round.buyCount}
          sellCount={round.sellCount}
        />

        <Chart
          series={series}
          axis={axis}
          elapsed={elapsed}
          bettingOpen={bettingOpen}
          myDirection={myBet?.direction ?? null}
        />

        <Controls
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          bettingOpen={bettingOpen}
          myBet={myBet}
          submitting={submitting}
          onSubmit={submit}
          secondsLeft={secondsLeft}
          delta={delta}
        />
      </div>

      <Results results={results ?? []} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Header(props: {
  price: number;
  axis: number;
  delta: number;
  bettingOpen: boolean;
  secondsLeft: number;
  buyVolume: number;
  sellVolume: number;
  buyCount: number;
  sellCount: number;
}) {
  const up = props.delta > 0;
  const moved = Math.abs(props.delta) > 0.001;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-gray-800">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-3xl font-semibold tabular-nums text-slate-900 dark:text-white">
          {props.price.toFixed(3)}
        </span>
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            !moved
              ? "text-slate-400"
              : up
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400",
          )}
        >
          {moved ? `${up ? "+" : ""}${props.delta.toFixed(3)}` : "—"}
        </span>
      </div>

      <div className="flex items-center gap-5">
        <Book
          label="Up"
          volume={props.buyVolume}
          count={props.buyCount}
          tone="up"
        />
        <Book
          label="Down"
          volume={props.sellVolume}
          count={props.sellCount}
          tone="down"
        />
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            {props.bettingOpen ? "Betting closes" : "Result in"}
          </div>
          <div
            className={cn(
              "font-mono text-xl font-semibold tabular-nums",
              props.bettingOpen
                ? "text-slate-900 dark:text-white"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            {props.secondsLeft}s
          </div>
        </div>
      </div>
    </div>
  );
}

function Book(props: {
  label: string;
  volume: number;
  count: number;
  tone: "up" | "down";
}) {
  return (
    <div className="text-right">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {props.label}
      </div>
      <div
        className={cn(
          "font-mono text-sm tabular-nums",
          props.tone === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400",
        )}
      >
        ${props.volume} · {props.count}
      </div>
    </div>
  );
}

function Chart(props: {
  series: number[];
  axis: number;
  elapsed: number;
  bettingOpen: boolean;
  myDirection: "up" | "down" | null;
}) {
  const { series, axis, elapsed } = props;

  const toY = useCallback(
    (price: number) => {
      const t = (price - (axis - CHART_SPAN)) / (CHART_SPAN * 2);
      // Clamp rather than let a runaway walk draw outside the box.
      return CHART_H - Math.min(Math.max(t, 0), 1) * CHART_H;
    },
    [axis],
  );

  const drawnCount = Math.min(
    series.length,
    Math.max(2, Math.floor(elapsed / TICK_MS) + 1),
  );

  const { path, headX, headY, closeX } = useMemo(() => {
    const step = CHART_W / (series.length - 1);
    let d = "";
    for (let i = 0; i < drawnCount; i++) {
      d += `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${toY(series[i]).toFixed(2)}`;
    }
    const lastIndex = drawnCount - 1;
    return {
      path: d,
      headX: lastIndex * step,
      headY: toY(series[lastIndex]),
      closeX: (BETTING_MS / TICK_MS) * step,
    };
  }, [series, drawnCount, toY]);

  const above = series[drawnCount - 1] > axis;

  return (
    <div className="relative bg-slate-50 dark:bg-gray-950">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="block h-[300px] w-full sm:h-[340px]"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="aurum-fill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={above ? "#10b981" : "#f43f5e"}
              stopOpacity="0.18"
            />
            <stop
              offset="100%"
              stopColor={above ? "#10b981" : "#f43f5e"}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {/* The line the round is judged against. */}
        <line
          x1="0"
          y1={toY(axis)}
          x2={CHART_W}
          y2={toY(axis)}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 6"
          className="text-slate-400/60"
        />

        {/* Where betting closed — everything right of it is what you are paid on. */}
        <line
          x1={closeX}
          y1="0"
          x2={closeX}
          y2={CHART_H}
          stroke="currentColor"
          strokeWidth="1"
          className="text-slate-300 dark:text-gray-700"
        />
        <rect
          x="0"
          y="0"
          width={closeX}
          height={CHART_H}
          className="fill-slate-900/[0.03] dark:fill-white/[0.02]"
        />

        {path && (
          <>
            <path
              d={`${path}L${headX.toFixed(2)},${toY(axis).toFixed(2)}L0,${toY(axis).toFixed(2)}Z`}
              fill="url(#aurum-fill)"
            />
            <path
              d={path}
              fill="none"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
              stroke={above ? "#10b981" : "#f43f5e"}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={headX}
              cy={headY}
              r="5"
              fill={above ? "#10b981" : "#f43f5e"}
            />
          </>
        )}
      </svg>

      {props.myDirection && (
        <div
          className={cn(
            "pointer-events-none absolute left-4 top-4 rounded-md px-2.5 py-1 text-xs font-medium",
            props.myDirection === "up"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
          )}
        >
          Your position: {props.myDirection === "up" ? "UP" : "DOWN"}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-4 text-[11px] uppercase tracking-wide text-slate-400">
        {props.bettingOpen ? "Betting open" : "Settling"}
      </div>
    </div>
  );
}

function Controls(props: {
  betAmount: BetAmount;
  setBetAmount: (a: BetAmount) => void;
  bettingOpen: boolean;
  myBet: { amount: number; direction: string; status: string } | null;
  submitting: "up" | "down" | null;
  onSubmit: (d: Direction) => void;
  secondsLeft: number;
  delta: number;
}) {
  const { myBet, bettingOpen } = props;

  if (myBet) {
    const winningNow =
      (myBet.direction === "up" && props.delta > 0) ||
      (myBet.direction === "down" && props.delta < 0);
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="text-sm text-slate-500">Your position this round</div>
          <div className="font-mono text-lg font-semibold text-slate-900 dark:text-white">
            ${myBet.amount} {myBet.direction === "up" ? "UP" : "DOWN"}
          </div>
        </div>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium",
            bettingOpen
              ? "bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-slate-300"
              : winningNow
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
          )}
        >
          {bettingOpen
            ? "Locked in — waiting for the close"
            : winningNow
              ? "Ahead"
              : "Behind"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">Stake</span>
        {([1, 2] as BetAmount[]).map((a) => (
          <button
            key={a}
            onClick={() => props.setBetAmount(a)}
            className={cn(
              "rounded-md border px-3 py-1.5 font-mono text-sm transition-colors",
              props.betAmount === a
                ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-gray-700 dark:text-slate-300",
            )}
          >
            ${a}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SideButton
          direction="up"
          disabled={!bettingOpen}
          busy={props.submitting === "up"}
          onClick={() => props.onSubmit("up")}
        />
        <SideButton
          direction="down"
          disabled={!bettingOpen}
          busy={props.submitting === "down"}
          onClick={() => props.onSubmit("down")}
        />
      </div>

      {!bettingOpen && (
        <p className="text-center text-sm text-slate-500">
          Betting is closed — next round in {props.secondsLeft}s
        </p>
      )}
    </div>
  );
}

function SideButton(props: {
  direction: Direction;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const up = props.direction === "up";
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled || props.busy}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg py-3.5 text-base font-semibold text-white transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        up
          ? "bg-emerald-600 hover:bg-emerald-500"
          : "bg-rose-600 hover:bg-rose-500",
      )}
    >
      {props.busy ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Icon className="h-5 w-5" />
      )}
      {up ? "UP" : "DOWN"}
    </button>
  );
}

function Results(props: {
  results: Array<{ id: string; winner: string; finalPrice: number | null }>;
}) {
  if (props.results.length === 0) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-400">
        Last rounds
      </span>
      {props.results.map((r) => (
        <span
          key={r.id}
          title={r.finalPrice !== null ? r.finalPrice.toFixed(3) : undefined}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            r.winner === "buyers"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : r.winner === "sellers"
                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                : "bg-slate-200 text-slate-500 dark:bg-gray-800 dark:text-slate-400",
          )}
        >
          {r.winner === "buyers" ? "U" : r.winner === "sellers" ? "D" : "–"}
        </span>
      ))}
    </div>
  );
}

/** Round length, re-exported so the page can talk about it without importing twice. */
export const ROUND_SECONDS = (BETTING_MS + PROCESSING_MS) / 1000;
