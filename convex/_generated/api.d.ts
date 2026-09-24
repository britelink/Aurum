/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as adminDashboard from "../adminDashboard.js";
import type * as aurum from "../aurum.js";
import type * as auth from "../auth.js";
import type * as authStatus from "../authStatus.js";
import type * as britelinkSgx from "../britelinkSgx.js";
import type * as buyCrypto from "../buyCrypto.js";
import type * as buyCryptoInternal from "../buyCryptoInternal.js";
import type * as chessaBridge from "../chessaBridge.js";
import type * as chessaClient from "../chessaClient.js";
import type * as chessaReconcile from "../chessaReconcile.js";
import type * as crons from "../crons.js";
import type * as cryptoPayoutNode from "../cryptoPayoutNode.js";
import type * as cryptoWithdrawals from "../cryptoWithdrawals.js";
import type * as deposits from "../deposits.js";
import type * as depositWatcherNode from "../depositWatcherNode.js";
import type * as ecocashDeposit from "../ecocashDeposit.js";
import type * as ecocashStatusPoll from "../ecocashStatusPoll.js";
import type * as fees from "../fees.js";
import type * as feeSweepNode from "../feeSweepNode.js";
import type * as floatGate from "../floatGate.js";
import type * as gameEngine from "../gameEngine.js";
import type * as gameLib from "../gameLib.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as onChainBalances from "../onChainBalances.js";
import type * as pesepayDeposit from "../pesepayDeposit.js";
import type * as pesepayDepositInternal from "../pesepayDepositInternal.js";
import type * as railLib from "../railLib.js";
import type * as railsSandbox from "../railsSandbox.js";
import type * as reserveReleaseNode from "../reserveReleaseNode.js";
import type * as sendLock from "../sendLock.js";
import type * as sgxCallbackHttp from "../sgxCallbackHttp.js";
import type * as treasury from "../treasury.js";
import type * as treasuryBep20 from "../treasuryBep20.js";
import type * as treasuryFloatNode from "../treasuryFloatNode.js";
import type * as treasuryPayout from "../treasuryPayout.js";
import type * as treasuryTron from "../treasuryTron.js";
import type * as withdrawable from "../withdrawable.js";
import type * as withdrawals from "../withdrawals.js";
import type * as zbDeposit from "../zbDeposit.js";
import type * as zbLib from "../zbLib.js";
import type * as zbWebhookHttp from "../zbWebhookHttp.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  adminDashboard: typeof adminDashboard;
  aurum: typeof aurum;
  auth: typeof auth;
  authStatus: typeof authStatus;
  britelinkSgx: typeof britelinkSgx;
  buyCrypto: typeof buyCrypto;
  buyCryptoInternal: typeof buyCryptoInternal;
  chessaBridge: typeof chessaBridge;
  chessaClient: typeof chessaClient;
  chessaReconcile: typeof chessaReconcile;
  crons: typeof crons;
  cryptoPayoutNode: typeof cryptoPayoutNode;
  cryptoWithdrawals: typeof cryptoWithdrawals;
  deposits: typeof deposits;
  depositWatcherNode: typeof depositWatcherNode;
  ecocashDeposit: typeof ecocashDeposit;
  ecocashStatusPoll: typeof ecocashStatusPoll;
  fees: typeof fees;
  feeSweepNode: typeof feeSweepNode;
  floatGate: typeof floatGate;
  gameEngine: typeof gameEngine;
  gameLib: typeof gameLib;
  http: typeof http;
  migrations: typeof migrations;
  onChainBalances: typeof onChainBalances;
  pesepayDeposit: typeof pesepayDeposit;
  pesepayDepositInternal: typeof pesepayDepositInternal;
  railLib: typeof railLib;
  railsSandbox: typeof railsSandbox;
  reserveReleaseNode: typeof reserveReleaseNode;
  sendLock: typeof sendLock;
  sgxCallbackHttp: typeof sgxCallbackHttp;
  treasury: typeof treasury;
  treasuryBep20: typeof treasuryBep20;
  treasuryFloatNode: typeof treasuryFloatNode;
  treasuryPayout: typeof treasuryPayout;
  treasuryTron: typeof treasuryTron;
  withdrawable: typeof withdrawable;
  withdrawals: typeof withdrawals;
  zbDeposit: typeof zbDeposit;
  zbLib: typeof zbLib;
  zbWebhookHttp: typeof zbWebhookHttp;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
