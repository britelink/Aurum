import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Three jobs, deliberately.
 *
 * The round engine is *not* on a cron: it schedules itself at the two instants
 * a round actually has (`scheduler.runAt`), so it costs two mutations a minute
 * while people are playing and nothing at all when they are not. The old build
 * woke every second whether or not the table was occupied.
 *
 * `game heartbeat` is the recovery path for that, not the driver. A deploy or a
 * transient error can drop a scheduled job, and without a heartbeat the table
 * would simply stop forever. Five minutes is the worst case a player waits
 * after such a failure — and the client calls `startIfIdle` when it finds no
 * live round, so in practice the first person through the door restarts it.
 */
const crons = cronJobs();

// Inbound rail: read Transfer logs into the agent wallet and credit deposits.
// One minute is the shortest interval worth running — BSC needs ~18s for the
// six confirmations a deposit waits on, so a tighter loop would spend RPC calls
// re-reading blocks that cannot have changed the answer.
crons.interval(
  "watch inbound deposits",
  { minutes: 1 },
  internal.depositWatcherNode.watchInboundDeposits,
  {},
);

// Retire quotes nobody paid, so their tags return to the pool. Expiry does not
// refuse late money: a transfer inside LATE_MATCH_WINDOW_MS still matches.
crons.interval(
  "expire stale deposit quotes",
  { minutes: 10 },
  internal.deposits.expireStale,
  {},
);

/*
 * Ask Chessa what happened to payouts it has an order for.
 *
 * Polling rather than waiting for a callback: the callback route exists but
 * needs a shared secret configured on Chessa's side, and that turns our own
 * status display into a dependency on someone else's deployment. The order id
 * is already in our row, so we can simply read the answer. Two minutes is well
 * inside the time an EcoCash settlement takes.
 */
crons.interval(
  "poll ecocash payout status",
  { minutes: 2 },
  internal.ecocashStatusPoll.pollEcocashPayouts,
  {},
);

// Chessa's payout floor is theirs to change; follow it rather than shipping a
// copy that goes stale. Six hours is far more often than a limit moves.
// A dollar is not a USDT, and the rate moves. Hourly is far more often than it
// meaningfully drifts, and it keeps queries able to convert without fetching.
crons.interval(
  "refresh usdt rate",
  { hours: 1 },
  internal.chessaBridge.refreshUsdtRate,
  {},
);

crons.interval(
  "refresh chessa ecocash limits",
  { hours: 6 },
  internal.chessaBridge.refreshEcocashLimits,
  {},
);

/*
 * Close the books on orders we opened at Chessa and did not complete.
 *
 * Mostly this marks expired orders as expired. It exists for the rarer case:
 * an order we funded short, which Chessa will not release and will not hold —
 * real money stopped between two companies, which nothing else would notice.
 */
crons.interval(
  "reconcile chessa orphan orders",
  { hours: 1 },
  internal.chessaReconcile.reconcileOrphanOrders,
  {},
);

crons.interval("game heartbeat", { minutes: 5 }, internal.gameEngine.ensureRound, {});

export default crons;
