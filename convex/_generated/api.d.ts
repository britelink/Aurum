/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aurum from "../aurum.js";
import type * as auth from "../auth.js";
import type * as authStatus from "../authStatus.js";
import type * as britelinkSgx from "../britelinkSgx.js";
import type * as buyCrypto from "../buyCrypto.js";
import type * as buyCryptoInternal from "../buyCryptoInternal.js";
import type * as chessaBridge from "../chessaBridge.js";
import type * as crons from "../crons.js";
import type * as cryptoPayoutNode from "../cryptoPayoutNode.js";
import type * as cryptoWithdrawals from "../cryptoWithdrawals.js";
import type * as depositWatcherNode from "../depositWatcherNode.js";
import type * as deposits from "../deposits.js";
import type * as gameEngine from "../gameEngine.js";
import type * as gameLib from "../gameLib.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as onChainBalances from "../onChainBalances.js";
import type * as railLib from "../railLib.js";
import type * as railsSandbox from "../railsSandbox.js";
import type * as session from "../session.js";
import type * as sessionManager from "../sessionManager.js";
import type * as sgxCallbackHttp from "../sgxCallbackHttp.js";
import type * as treasuryBep20 from "../treasuryBep20.js";
import type * as treasuryPayout from "../treasuryPayout.js";
import type * as treasuryTron from "../treasuryTron.js";
import type * as withdrawTest from "../withdrawTest.js";
import type * as withdrawals from "../withdrawals.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aurum: typeof aurum;
  auth: typeof auth;
  authStatus: typeof authStatus;
  britelinkSgx: typeof britelinkSgx;
  buyCrypto: typeof buyCrypto;
  buyCryptoInternal: typeof buyCryptoInternal;
  chessaBridge: typeof chessaBridge;
  crons: typeof crons;
  cryptoPayoutNode: typeof cryptoPayoutNode;
  cryptoWithdrawals: typeof cryptoWithdrawals;
  depositWatcherNode: typeof depositWatcherNode;
  deposits: typeof deposits;
  gameEngine: typeof gameEngine;
  gameLib: typeof gameLib;
  helpers: typeof helpers;
  http: typeof http;
  onChainBalances: typeof onChainBalances;
  railLib: typeof railLib;
  railsSandbox: typeof railsSandbox;
  session: typeof session;
  sessionManager: typeof sessionManager;
  sgxCallbackHttp: typeof sgxCallbackHttp;
  treasuryBep20: typeof treasuryBep20;
  treasuryPayout: typeof treasuryPayout;
  treasuryTron: typeof treasuryTron;
  withdrawTest: typeof withdrawTest;
  withdrawals: typeof withdrawals;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
