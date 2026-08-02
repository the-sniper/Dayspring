// Where the apply-assist browser comes from.
//
// The point of this module: apply-assist used to call chromium.launch(), which
// starts real Chrome with a BRAND NEW EMPTY PROFILE. Real binary, zero cookies.
// That single fact is why Workday could never be autofilled (every tenant is
// account-based, and we always arrived signed out) and why the credential vault
// + Gmail OTP reader had to exist at all.
//
// Now there are two ways in, both of which arrive already logged in:
//
//   1. PERSISTENT PROFILE (default) — a Chrome profile directory owned by
//      Dayspring. You sign into a Workday tenant once, by hand, and it sticks
//      for every future application to that tenant.
//   2. ATTACH OVER CDP (opt-in, DAYSPRING_CDP_URL) — drive the Chrome you are
//      already using. Maximum session reuse, but automation shares the window
//      with you, so a stray click during a fill pass lands in the form.
//
// Both keep the Playwright API, which means lib/apply/ats-forms.ts keeps
// working unchanged — the fillSticky retype workaround, formScope iframe
// resolution and tryComboSelect are all preserved.
import path from "node:path";
import type { BrowserContext, Page } from "playwright";

// Lives under data/, which is already gitignored alongside the SQLite file.
export function profileDir(): string {
  return (
    process.env.DAYSPRING_BROWSER_PROFILE ||
    path.join(process.cwd(), "data", "browser-profile")
  );
}

export type ApplyBrowser = {
  context: BrowserContext;
  page: Page;
  // True when we attached to a Chrome that was already running. Closing the
  // session must NOT kill it — that is the user's own browser.
  attached: boolean;
  // Human-readable, surfaced in the session message so it is never a mystery
  // which browser is being driven.
  describe: string;
};

const ANTI_DETECTION = {
  // Real Chrome kills the headless-shell fingerprint; the flags kill
  // navigator.webdriver. Heavy stealth forks stay overkill for low-volume
  // attended use on a residential IP.
  args: ["--disable-blink-features=AutomationControlled"],
  ignoreDefaultArgs: ["--enable-automation"],
};

function contextOptions(embedded: boolean) {
  return {
    locale: "en-US",
    timezoneId:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    ...(embedded ? { viewport: { width: 1280, height: 1400 } } : {}),
  };
}

// Attach to an already-running Chrome started with --remote-debugging-port.
async function attachOverCdp(url: string): Promise<ApplyBrowser> {
  const { chromium } = await import("playwright");
  const browser = await chromium.connectOverCDP(url, { timeout: 10_000 });
  const context = browser.contexts()[0];
  if (!context) {
    await browser.close().catch(() => {});
    throw new Error(
      `Attached to Chrome at ${url} but it has no open window — open a tab and retry.`,
    );
  }
  // Always open our OWN tab. Reusing whatever tab happens to be focused would
  // navigate the user away from what they were doing.
  const page = await context.newPage();
  return { context, page, attached: true, describe: `attached to Chrome at ${url}` };
}

async function launchPersistent(embedded: boolean): Promise<ApplyBrowser> {
  const { chromium } = await import("playwright");
  const dir = profileDir();
  const opts = {
    headless: embedded,
    ...ANTI_DETECTION,
    ...contextOptions(embedded),
  };
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(dir, {
      ...opts,
      channel: "chrome",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A persistent profile is single-writer. The usual cause is a previous
    // apply session (or a hand-opened window on this profile) still running.
    if (/ProcessSingleton|profile.*in use|SingletonLock/i.test(msg)) {
      throw new Error(
        "The Dayspring browser profile is already open in another window. Close it and retry.",
      );
    }
    // No real Chrome installed — bundled Chromium still gets the persistence,
    // which is the part that matters here.
    context = await chromium.launchPersistentContext(dir, opts);
  }
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    context,
    page,
    attached: false,
    describe: `persistent profile at ${dir}`,
  };
}

export async function openApplyBrowser(opts: {
  embedded: boolean;
}): Promise<ApplyBrowser> {
  const cdp = process.env.DAYSPRING_CDP_URL?.trim();
  if (cdp) {
    try {
      return await attachOverCdp(cdp);
    } catch (err) {
      // Falling back is better than failing the session outright: the
      // persistent profile still has whatever logins it has accumulated.
      console.warn(
        `[apply] CDP attach to ${cdp} failed (${err instanceof Error ? err.message : err}) — falling back to the persistent profile.`,
      );
    }
  }
  return launchPersistent(opts.embedded);
}

// Close what we opened, and nothing more. When attached to the user's own
// Chrome we close only our tab; the browser keeps running.
export async function closeApplyBrowser(b: {
  context: BrowserContext | null;
  page: Page | null;
  attached: boolean;
}): Promise<void> {
  try {
    if (b.attached) {
      await b.page?.close();
      // connectOverCDP holds a socket to the user's Chrome — release it
      // without terminating the browser itself.
      await b.context?.browser()?.close();
      return;
    }
    await b.context?.close();
  } catch {
    // Already gone — the human may have closed the window.
  }
}
