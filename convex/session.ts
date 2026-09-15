/**
 * Retired — replaced by `gameEngine.ts`.
 *
 * This module used to export `updateUserBalance`, `createTransaction`,
 * `updateBetStatus`, `updateSessionStatus` and `createSession` as **public**
 * mutations. Any browser could call
 * `api.session.updateUserBalance({ userId, balance: 1e9 })`. That was merely bad
 * while the balance was play money; with the crypto payout rail live it is a
 * way to withdraw real USDT from the agent wallet, so every one of them is gone
 * rather than deprecated.
 *
 * It also drove rounds from an action that rescheduled itself every second
 * (86,400 invocations a day, playing or not) and settled rounds with three
 * separate mutations per player, so a failure mid-settlement paid some players
 * and not others. `gameEngine.ts` schedules at the two round boundaries and
 * settles in one transaction.
 *
 * Deliberately left as an empty module instead of being deleted, so a client
 * still holding a `api.session.*` reference fails at deploy time with a missing
 * function rather than silently binding to something. Delete the file once
 * nothing imports it.
 */
export {};
