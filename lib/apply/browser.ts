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
import fs from "node:fs";
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

// Embedded (live-view) mode used to launch HEADLESS, and headless is the single
// loudest tell a bot-detector has: from this machine, this profile and this IP,
// Adzuna's land page answers a headless Chrome with 403 + "suspicious behaviour"
// and a headed one with 200. So embedded launches a real window too.
//
// It is a REAL, VISIBLE window, and it has to be: CDP screencast only produces
// frames while the window is composited. Minimizing it (or parking it
// off-screen, which macOS clamps back anyway) stops the stream dead — measured
// both ways. So the live view mirrors a window that is genuinely on screen;
// the human can use either one.
const WINDOW_SIZE = ["--window-size=1280,1400"];

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

function isProfileLocked(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ProcessSingleton|profile.*in use|SingletonLock|existing browser session/i.test(msg);
}

// Chrome processes started against OUR profile directory. Helper processes
// carry the same --user-data-dir, so only the browser process (no --type=)
// is reported — killing that one takes its helpers with it.
async function profileHolders(dir: string): Promise<number[]> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { stdout } = await promisify(execFile)("/bin/ps", ["-eo", "pid=,command="], {
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout
      .split("\n")
      .filter((l) => l.includes(`--user-data-dir=${dir}`) && !l.includes("--type="))
      .map((l) => Number(l.trim().split(/\s+/)[0]))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

// Free a profile that nothing is legitimately using.
//
// Two things strand it, both routinely: on macOS, closing Chrome's last WINDOW
// does not quit Chrome — the process lives on holding the lock with nothing
// visible to close — and a dev-server restart drops our handle to a browser
// that is still running. By the time we get here the session layer has already
// established that no live session owns a browser, so a holder is an orphan.
// If nothing holds it, the lock files themselves are stale leftovers.
async function reclaimProfile(dir: string): Promise<string> {
  const holders = await profileHolders(dir);
  for (const pid of holders) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  if (holders.length > 0) {
    await new Promise((r) => setTimeout(r, 1500));
    return `terminated orphaned Chrome (pid ${holders.join(", ")})`;
  }
  let removed = 0;
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try {
      fs.unlinkSync(path.join(dir, name));
      removed++;
    } catch {
      // not there — fine
    }
  }
  return removed > 0 ? "cleared stale profile lock files" : "";
}

async function launchPersistent(embedded: boolean): Promise<ApplyBrowser> {
  const { chromium } = await import("playwright");
  const dir = profileDir();
  const opts = {
    headless: false,
    ...ANTI_DETECTION,
    args: [...ANTI_DETECTION.args, ...(embedded ? WINDOW_SIZE : [])],
    ...contextOptions(embedded),
  };
  // Real Chrome first (better fingerprint, real profile); bundled Chromium is
  // the fallback when Chrome isn't installed. A locked profile is NOT a
  // fallback case — it fails the same way on both.
  const launch = async () => {
    try {
      return await chromium.launchPersistentContext(dir, { ...opts, channel: "chrome" });
    } catch (err) {
      if (isProfileLocked(err)) throw err;
      return await chromium.launchPersistentContext(dir, opts);
    }
  };

  let context: BrowserContext;
  let recovery = "";
  try {
    context = await launch();
  } catch (err) {
    if (!isProfileLocked(err)) throw err;
    recovery = await reclaimProfile(dir);
    try {
      context = await launch();
    } catch {
      const holders = await profileHolders(dir);
      throw new Error(
        holders.length > 0
          ? `Chrome is still holding the Dayspring browser profile (pid ${holders.join(", ")}) and wouldn't release it. Quit Chrome (⌘Q — note that closing its window is not enough on macOS) and retry.`
          : "The Dayspring browser profile is locked and couldn't be reclaimed. Quit any Chrome running on it and retry.",
      );
    }
  }
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    context,
    page,
    attached: false,
    describe: `persistent profile at ${dir} (headed${embedded ? ", live view streams" : ""})${recovery ? ` — ${recovery}` : ""}`,
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
