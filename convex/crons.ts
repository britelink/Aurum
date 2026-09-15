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

crons.interval("game heartbeat", { minutes: 5 }, internal.gameEngine.ensureRound, {});

export default crons;
