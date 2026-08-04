// Getting from the link we stored to a form we can actually fill.
//
// Two things sit in between, and a run that ignores either one parks the human
// in front of a page with nothing to autofill:
//
//  1. AGGREGATOR HOPS. Adzuna's API only ever hands out a tracking link
//     (adzuna.com/land/ad/<id>?se=…) — their terms require it. That link is not
//     an application form: it bounces to an Adzuna *details* page whose "Apply
//     for this job" link is a SECOND tracking hop that finally lands on the
//     employer's ATS. Stopping at hop one is what produced sessions logging
//     "review capture: 0 answered fields".
//  2. LISTING PAGES. Most employer postings render the description first and
//     only mount the form after an "Apply" click.
//
// Both are resolved here, before the fill pass runs — and if neither gets us to
// a form, the caller fails the entry with a reason instead of asking the human
// to review a page that has no form on it.
import type { Page } from "playwright";
import { formScope, visibleFieldCount } from "@/lib/apply/ats-forms";

const AGGREGATORS = [
  "adzuna.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "simplyhired.com",
  "talent.com",
  "jobs2careers.com",
  "linkup.com",
  // Click trackers the aggregators bounce through. Treating these as a
  // destination is how a run ends up "resolved" to click.appcast.io while the
  // browser is still mid-chain.
  "appcast.io",
  "jobs2web.com",
  "trackerrd.com",
];

export function isAggregatorHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return AGGREGATORS.some((a) => h === a || h.endsWith(`.${a}`));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

// A tracking hop is several redirects deep and the last ones are client-side,
// so "domcontentloaded" fires long before the browser is done moving. Wait for
// the URL to hold still before deciding where we ended up.
async function settle(page: Page, quietMs = 2000, maxMs = 20_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  let last = page.url();
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const now = page.url();
    if (now !== last) {
      last = now;
      quietSince = Date.now();
      continue;
    }
    if (Date.now() - quietSince >= quietMs) return;
  }
}

// The aggregator's click-through to the employer. "ApplyIQ" is Adzuna's own
// résumé product, not this job — matching it sends the session sideways.
const APPLY_TEXT = /apply (for this job|now|on|externally|here)|^\s*apply\s*$/i;
const NOT_APPLY = /applyiq|apply-iq|apply with (indeed|linkedin)|save|alert/i;

async function applyHref(page: Page): Promise<string | null> {
  return page
    .evaluate(
      ({ apply, not }) => {
        const re = new RegExp(apply, "i");
        const skip = new RegExp(not, "i");
        for (const a of Array.from(document.querySelectorAll("a[href]"))) {
          const text = (a.textContent || "").trim();
          const href = (a as HTMLAnchorElement).href;
          if (!text || !href || skip.test(text) || skip.test(href)) continue;
          if (!re.test(text)) continue;
          if ((a as HTMLElement).offsetParent === null) continue; // hidden
          return href;
        }
        return null;
      },
      { apply: APPLY_TEXT.source, not: NOT_APPLY.source },
    )
    .catch(() => null);
}

// Bot walls say so in the body text. Worth naming precisely: a headed browser
// gets a 200 where headless gets a 403, so hitting this usually means
// something forced the session headless rather than the site being hostile.
const BLOCKED = /suspicious behaviour|suspicious behavior|unusual (behaviour|behavior|traffic)|access denied|are you a (robot|human)|verify you are human/i;

async function looksBlocked(page: Page): Promise<boolean> {
  const body = await page.innerText("body").catch(() => "");
  return BLOCKED.test(body.slice(0, 3000));
}

// Consent banners and email-capture modals sit ON TOP of the apply link — a
// OneTrust banner covering "Apply Now" is exactly why a click here times out
// and the human ends up clicking through by hand. Only ever DECLINE: reject-all
// handlers and plain dismissals, never an "Accept".
const REJECT_SELECTORS = [
  "#onetrust-reject-all-handler",
  ".ot-pc-refuse-all-handler",
  "#truste-consent-required",
  '[data-testid="reject-all"]',
  "button#CybotCookiebotDialogBodyButtonDecline",
];
const DISMISS_TEXT =
  /^\s*(reject all|reject|decline( all)?|necessary( cookies)? only|only essential|no,?\s*thanks|not now|dismiss|close)\s*$/i;

async function dismissOverlays(page: Page): Promise<void> {
  await page.keyboard.press("Escape").catch(() => {});
  for (const sel of REJECT_SELECTORS) {
    const el = page.locator(sel).first();
    if ((await el.count().catch(() => 0)) > 0 && (await el.isVisible().catch(() => false))) {
      await el.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(400);
      return;
    }
  }
  const dismiss = page
    .locator("button:visible, a:visible")
    .filter({ hasText: DISMISS_TEXT })
    .first();
  if ((await dismiss.count().catch(() => 0)) > 0) {
    await dismiss.click({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

// Career sites are full of inputs that are not the application: job search,
// "save this job", email-alert signup, support chat. Counting those is how a
// listing page passes for a form — so they don't count.
const NOISE =
  /search|typehead|typeahead|keyword|save ?job|job ?alert|notified|newsletter|subscribe|ask anything|chat|cookie/i;

export async function applicationFieldCount(page: Page): Promise<number> {
  const scope = await formScope(page);
  return scope
    .evaluate((noiseSrc: string) => {
      const noise = new RegExp(noiseSrc, "i");
      let n = 0;
      for (const el of Array.from(
        document.querySelectorAll("input:not([type=hidden]), textarea, select"),
      )) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const label = [
          el.getAttribute("name"),
          el.getAttribute("id"),
          el.getAttribute("aria-label"),
          el.getAttribute("placeholder"),
        ]
          .filter(Boolean)
          .join(" ");
        if (noise.test(label)) continue;
        n++;
      }
      return n;
    }, NOISE.source)
    .catch(() => 0);
}

export type UnwrapResult =
  | { ok: true; url: string; hops: number }
  | { ok: false; reason: string };

// Walk the aggregator's hops until the browser is on someone else's domain.
export async function unwrapAggregator(
  page: Page,
  opts: { timeoutMs?: number; onProgress?: (msg: string) => void } = {},
): Promise<UnwrapResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
  let hops = 0;
  await settle(page);
  while (Date.now() < deadline && hops < 4) {
    const host = hostOf(page.url());
    if (!isAggregatorHost(host)) return { ok: true, url: page.url(), hops };
    if (await looksBlocked(page)) {
      return {
        ok: false,
        reason: `${host} served a bot-check page instead of the job link — it blocks headless browsers, so this run couldn't reach the employer's site`,
      };
    }
    await dismissOverlays(page);
    const href = await applyHref(page);
    if (href) {
      hops++;
      opts.onProgress?.(`Following ${host} through to the employer's site…`);
      await page
        .goto(href, { waitUntil: "domcontentloaded", timeout: 45_000 })
        .catch(() => {});
      await settle(page);
      continue;
    }
    // No link yet — land pages often redirect themselves a beat later.
    await page.waitForTimeout(1500);
  }
  const host = hostOf(page.url());
  if (!isAggregatorHost(host)) return { ok: true, url: page.url(), hops };
  return {
    ok: false,
    reason: `couldn't get past ${host} to the employer's application page`,
  };
}

// Employer postings usually show the description with an "Apply" button and
// mount the form only after it's clicked. Returns the page holding the form —
// which may be a NEW TAB, since plenty of boards open the ATS with target=_blank.
export async function revealApplyForm(
  page: Page,
  opts: { timeoutMs?: number; onProgress?: (msg: string) => void } = {},
): Promise<Page> {
  await settle(page);
  await dismissOverlays(page);
  if ((await applicationFieldCount(page)) >= 3) return page;

  const before = page.context().pages().length;
  const apply = page
    .locator("a:visible, button:visible")
    .filter({ hasText: APPLY_TEXT })
    .filter({ hasNotText: NOT_APPLY })
    .first();
  if ((await apply.count().catch(() => 0)) === 0) return page;

  opts.onProgress?.("Opening the application form…");
  // Prefer the href over the click. "Apply Now" is usually a plain anchor, and
  // navigating to it steps around whatever banner is sitting on top of it —
  // the click path is a timeout waiting to happen on consent-heavy sites.
  const href = await apply
    .getAttribute("href")
    .catch(() => null);
  if (href && /^https?:/i.test(href)) {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => {});
    await settle(page);
    await dismissOverlays(page);
  } else {
    await apply.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await apply.click({ timeout: 8000 }).catch(async () => {
      // Still covered — dispatch the click on the element itself.
      await apply.evaluate((el: HTMLElement) => el.click()).catch(() => {});
    });
  }

  // Either a new tab opened, or this page navigated / mounted the form.
  const deadline = Date.now() + (opts.timeoutMs ?? 20_000);
  while (Date.now() < deadline) {
    const pages = page.context().pages();
    const target = pages.length > before ? pages[pages.length - 1] : page;
    if ((await applicationFieldCount(target).catch(() => 0)) >= 3) return target;
    await page.waitForTimeout(1000);
  }
  return page.context().pages().length > before
    ? page.context().pages().slice(-1)[0]
    : page;
}

// ── Is this still the job that was queued? ──────────────────────────────────
// An aggregator link can resolve to a different requisition than the one it was
// listed under, and a stray navigation mid-run can swap the posting underneath
// the fill pass. Either way the human ends up applying to a job they never
// picked, so the destination gets checked before anything is typed into it.
//
// Deliberately narrow: only COUNTRY conflicts and a title with nothing in
// common count as a mismatch. Cities legitimately differ between an
// aggregator's listing and the employer's page (Weldon Spring vs O'Fallon for
// the same req), and a false mismatch costs a real application.
const COUNTRIES =
  /\b(India|Pakistan|Philippines|Singapore|Australia|Canada|Germany|Ireland|Poland|Romania|Brazil|Mexico|Japan|China|United Kingdom|Netherlands|Spain|France|Italy|Sweden|Costa Rica|Argentina|Colombia|South Africa|Kenya|Nigeria|Israel|Türkiye|Turkey|Thailand|Vietnam|Malaysia|Indonesia|Korea|Taiwan|Hong Kong|New Zealand|Switzerland|Austria|Belgium|Denmark|Norway|Finland|Portugal|Greece|Czech|Hungary|Bulgaria|Ukraine|Egypt|Morocco|Chile|Peru|Uruguay)\b/;
const US_MARKERS = /United States|USA|U\.S\.A?\b|\bUS\b/i;

const STOP_WORDS = new Set([
  "senior", "staff", "principal", "lead", "junior", "mid", "level", "i", "ii", "iii", "iv",
  "the", "of", "and", "a", "an", "for", "to", "in", "at", "remote", "hybrid", "onsite",
]);

function titleTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

export type PostingCheck = { ok: true } | { ok: false; detail: string };

export async function checkPostingMatches(
  page: Page,
  job: { title: string; location: string | null; isUs: boolean | null },
): Promise<PostingCheck> {
  const seen = await page
    .evaluate(() => ({
      docTitle: document.title.slice(0, 200),
      heading: (document.querySelector("h1")?.textContent ?? "").trim().slice(0, 160),
      head: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 600),
    }))
    .catch(() => null);
  if (!seen) return { ok: true }; // can't read it — don't block on that

  // Career pages put the location in the <title> ("… in Pune, India | R-211833"),
  // so the country check reads the title and heading ONLY — body copy mentions
  // countries for all sorts of innocent reasons.
  //
  // The comparison is against the queued job's own location rather than an
  // isUs flag, which is frequently unset on aggregator rows: a destination
  // country that the queued listing never mentions is the mismatch.
  const where = `${seen.docTitle} ${seen.heading}`;
  const foreign = where.match(COUNTRIES)?.[0] ?? null;
  const queuedPlace = `${job.location ?? ""} ${job.isUs ? "United States" : ""}`;
  if (foreign && !new RegExp(foreign, "i").test(queuedPlace)) {
    const queuedWhere = job.location ?? (job.isUs ? "the US" : "elsewhere");
    return {
      ok: false,
      detail: `the page is the ${foreign} posting of "${(seen.heading || seen.docTitle.split("|")[0]).trim().slice(0, 60)}", but the job queued is in ${queuedWhere}`,
    };
  }

  const want = titleTokens(job.title);
  const got = titleTokens(`${seen.heading} ${seen.docTitle}`);
  if (want.size > 0 && got.size > 0) {
    const shared = [...want].filter((w) => got.has(w));
    if (shared.length === 0) {
      return {
        ok: false,
        detail: `the page is "${(seen.heading || seen.docTitle).slice(0, 70)}", which doesn't match the queued role "${job.title}"`,
      };
    }
  }
  return { ok: true };
}

// "Is there an application on this page?" — the check that decides whether a
// session is worth handing to the human for review. Deliberately generous
// (3 real fields, search/alert widgets excluded): the human reviews everything
// anyway, so a false pass costs a glance and a false fail costs an application.
export async function hasFormFields(page: Page): Promise<boolean> {
  if ((await applicationFieldCount(page).catch(() => 0)) >= 3) return true;
  // Some forms are a single résumé drop-zone plus a button.
  const scope = await formScope(page);
  return (await scope.locator('input[type="file"]').count().catch(() => 0)) > 0;
}
