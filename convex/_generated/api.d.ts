/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as affiliations from "../affiliations.js";
import type * as applications from "../applications.js";
import type * as applyAnswers from "../applyAnswers.js";
import type * as applyQueue from "../applyQueue.js";
import type * as auth from "../auth.js";
import type * as campaigns from "../campaigns.js";
import type * as catalog from "../catalog.js";
import type * as companies from "../companies.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as lib from "../lib.js";
import type * as linkedinPosts from "../linkedinPosts.js";
import type * as maintenance from "../maintenance.js";
import type * as onboarding from "../onboarding.js";
import type * as orchestra from "../orchestra.js";
import type * as outreach from "../outreach.js";
import type * as profiles from "../profiles.js";
import type * as pull from "../pull.js";
import type * as research from "../research.js";
import type * as resumeAssets from "../resumeAssets.js";
import type * as resumes from "../resumes.js";
import type * as retention from "../retention.js";
import type * as settings from "../settings.js";
import type * as stageEvents from "../stageEvents.js";
import type * as targeting from "../targeting.js";
import type * as users from "../users.js";
import type * as vault from "../vault.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  affiliations: typeof affiliations;
  applications: typeof applications;
  applyAnswers: typeof applyAnswers;
  applyQueue: typeof applyQueue;
  auth: typeof auth;
  campaigns: typeof campaigns;
  catalog: typeof catalog;
  companies: typeof companies;
  contacts: typeof contacts;
  crons: typeof crons;
  http: typeof http;
  jobs: typeof jobs;
  lib: typeof lib;
  linkedinPosts: typeof linkedinPosts;
  maintenance: typeof maintenance;
  onboarding: typeof onboarding;
  orchestra: typeof orchestra;
  outreach: typeof outreach;
  profiles: typeof profiles;
  pull: typeof pull;
  research: typeof research;
  resumeAssets: typeof resumeAssets;
  resumes: typeof resumes;
  retention: typeof retention;
  settings: typeof settings;
  stageEvents: typeof stageEvents;
  targeting: typeof targeting;
  users: typeof users;
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
