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
import type * as aurum from "../aurum.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as session from "../session.js";
import type * as sessionManager from "../sessionManager.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  aurum: typeof aurum;
  auth: typeof auth;
  crons: typeof crons;
  helpers: typeof helpers;
  http: typeof http;
  session: typeof session;
  sessionManager: typeof sessionManager;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
