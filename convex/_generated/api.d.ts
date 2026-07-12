/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applications from "../applications.js";
import type * as companies from "../companies.js";
import type * as contacts from "../contacts.js";
import type * as jobs from "../jobs.js";
import type * as outreach from "../outreach.js";
import type * as profiles from "../profiles.js";
import type * as research from "../research.js";
import type * as resumes from "../resumes.js";
import type * as settings from "../settings.js";
import type * as stageEvents from "../stageEvents.js";
import type * as vault from "../vault.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  applications: typeof applications;
  companies: typeof companies;
  contacts: typeof contacts;
  jobs: typeof jobs;
  outreach: typeof outreach;
  profiles: typeof profiles;
  research: typeof research;
  resumes: typeof resumes;
  settings: typeof settings;
  stageEvents: typeof stageEvents;
  vault: typeof vault;
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
