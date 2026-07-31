import type { Frame, Locator, Page } from "playwright";
import type { ApplyContext } from "@/lib/apply/core";

// Best-effort autofill for accountless ATS forms (Greenhouse / Lever / Ashby).
// Selectors are intentionally broad + tolerant — the human reviews everything
// before submit, so a missed field is a manual fill, never a wrong submission.

// Locators don't pierce iframes, and plenty of career pages embed the ATS
// form in one (e.g. Greenhouse's grnhse_iframe). Everything here works on a
// "scope": the frame that actually holds the application form.
export type FormScope = Page | Frame;

const visibleFieldCount = (scope: FormScope): Promise<number> =>
  scope
    .evaluate(() => {
      let n = 0;
      for (const el of Array.from(
        document.querySelectorAll("input:not([type=hidden]), textarea, select"),
      )) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) n++;
      }
      return n;
    })
    .catch(() => 0);

// The frame most likely to hold the application form: an ATS-hosted frame
// with fields beats the main frame, which beats whichever frame has the most
// fields. Resolved fresh at each use — frames navigate.
export async function formScope(page: Page): Promise<FormScope> {
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  for (const f of frames) {
    if (/greenhouse|lever\.co|ashbyhq/i.test(f.url()) && (await visibleFieldCount(f)) >= 3) {
      return f;
    }
  }
  const mainCount = await visibleFieldCount(page);
  if (mainCount >= 3) return page;
  let best: Frame | null = null;
  let bestN = mainCount;
  for (const f of frames) {
    const n = await visibleFieldCount(f);
    if (n > bestN) {
      best = f;
      bestN = n;
    }
  }
  return best ?? page;
}

type FillResult = { filled: string[]; skipped: string[] };

// Callbacks so the session can surface progress ("Filling: email…") and cut
// the pass short (user skip / deadline) — a stuck field must never wedge the
// whole session.
export type FillOptions = {
  isAborted?: () => boolean;
  onProgress?: (label: string) => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Some React boards (e.g. Greenhouse's new job-boards app) silently discard
// locator.fill()'s programmatic value on a later render — fill() "works",
// then the field is empty again. So: fill fast, verify it stuck after a blur,
// and fall back to real keystrokes, which controlled inputs always accept.
// (fillCommonForm additionally re-verifies every fill after the page settles,
// because the reset can land seconds later, when the form store initializes.)
export async function fillSticky(
  el: Locator,
  value: string,
  forceType = false,
): Promise<boolean> {
  try {
    if (!forceType) {
      await el.fill(value, { timeout: 3000 });
      await el.blur().catch(() => {});
      await sleep(150);
      if ((await el.inputValue()) === value) return true;
    }
    await el.click({ timeout: 2000 });
    await el.press("ControlOrMeta+a").catch(() => {});
    await el.press("Backspace").catch(() => {});
    await el.pressSequentially(value, { delay: 15, timeout: 10_000 });
    await el.blur().catch(() => {});
    await sleep(150);
    return (await el.inputValue()) === value;
  } catch {
    return false;
  }
}

// Try a list of selectors; fill the first that exists and is editable.
async function tryFill(
  page: FormScope,
  selectors: string[],
  value: string | null,
): Promise<boolean> {
  if (!value) return false;
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    try {
      if ((await el.count()) > 0 && (await el.isVisible())) {
        return await fillSticky(el, value);
      }
    } catch {
      // try the next selector
    }
  }
  return false;
}

// Client-rendered boards can mount the form after domcontentloaded — filling
// too early sees an empty DOM. Wait (bounded) for fields to exist first.
export async function waitForFormReady(page: Page, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await visibleFieldCount(await formScope(page))) >= 3) return;
    await page.waitForTimeout(500);
  }
}

// Type-ahead combobox (react-select style — Greenhouse's new board renders
// EVERY dropdown this way: role="combobox" + aria-autocomplete="list").
// Click, type the answer, then pick the best VISIBLE option — the ":visible"
// matters because hidden widgets (e.g. the phone country list) also expose
// [role=option] nodes.
export async function tryComboSelect(
  scope: FormScope,
  input: Locator,
  value: string,
): Promise<boolean> {
  try {
    await input.click({ timeout: 2500 });
    await input
      .pressSequentially(value.slice(0, 40), { delay: 20, timeout: 6000 })
      .catch(() => {});
    await sleep(700);
    const options = scope.locator('[role="option"]:visible');
    let texts = await options.allInnerTexts().catch(() => [] as string[]);
    if (texts.length === 0) {
      // Some widgets only open on a second click / after clearing the filter.
      await input.press("ControlOrMeta+a").catch(() => {});
      await input.press("Backspace").catch(() => {});
      await input.click({ timeout: 2000 }).catch(() => {});
      await sleep(600);
      texts = await options.allInnerTexts().catch(() => [] as string[]);
      if (texts.length === 0) {
        await input.press("Escape").catch(() => {});
        return false;
      }
    }
    const v = value.trim().toLowerCase();
    const norm = (t: string) => t.trim().toLowerCase();
    let idx = texts.findIndex((t) => norm(t) === v);
    if (idx < 0) idx = texts.findIndex((t) => norm(t).startsWith(v));
    if (idx < 0) idx = texts.findIndex((t) => norm(t).includes(v));
    if (idx < 0) {
      await input.press("Escape").catch(() => {});
      return false;
    }
    await options.nth(idx).click({ timeout: 3000 });
    await sleep(300);
    return true;
  } catch {
    return false;
  }
}

const isComboAttrs = (role: string | null, ariaAuto: string | null) =>
  role === "combobox" || ariaAuto === "list" || ariaAuto === "both";

// Find a combobox input whose <label> matches one of the keywords, then pick
// the first option label that resolves. Covers screening questions on boards
// that render selects as comboboxes (Greenhouse new board).
async function tryComboByLabel(
  scope: FormScope,
  keywords: string[],
  optionLabels: string[] | null,
): Promise<boolean> {
  if (!optionLabels?.length) return false;
  const combos = await scope
    .evaluate(() => {
      const out: { id: string; label: string }[] = [];
      for (const el of Array.from(document.querySelectorAll("input"))) {
        const role = el.getAttribute("role");
        const auto = el.getAttribute("aria-autocomplete");
        if (role !== "combobox" && auto !== "list" && auto !== "both") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const label = el.id
          ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() ?? ""
          : "";
        if (el.id && label) out.push({ id: el.id, label });
      }
      return out;
    })
    .catch(() => [] as { id: string; label: string }[]);
  for (const kw of keywords) {
    const hit = combos.find((c) => c.label.toLowerCase().includes(kw.toLowerCase()));
    if (!hit) continue;
    const input = scope.locator(`[id="${hit.id}"]`).first();
    for (const label of optionLabels) {
      if (await tryComboSelect(scope, input, label)) return true;
    }
    return false; // right question found, no option matched — don't try other keywords
  }
  return false;
}

// Snapshot of every labeled, answered field on the form — powers the review
// summary ("here is exactly what will be submitted") and the answer bank.
// Combobox values live in a sibling .select__single-value node, not on the
// input itself.
export async function captureFormAnswers(
  target: Page,
): Promise<{ label: string; value: string }[]> {
  const scope = await formScope(target);
  return scope
    .evaluate(() => {
      const out: { label: string; value: string }[] = [];
      for (const el of Array.from(document.querySelectorAll("input, textarea, select"))) {
        const e = el as HTMLInputElement;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const type = (e.type || el.tagName).toLowerCase();
        if (["hidden", "submit", "button", "checkbox", "radio", "password", "search"].includes(type)) continue;
        let label = "";
        if (e.id) label = document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent?.trim() ?? "";
        if (!label) label = e.getAttribute("aria-label") ?? "";
        if (!label) continue;
        let value = (e.value ?? "").trim();
        if (type === "file") {
          value = e.files?.[0]?.name ?? "";
        } else if (!value) {
          // react-select renders the chosen value in a SIBLING of the input's
          // container — closest must target the value-container specifically.
          const container =
            el.closest('[class*="select__value-container"]') ??
            el.parentElement?.parentElement ?? null;
          const single = container?.querySelector('[class*="single-value"]');
          value = single?.textContent?.trim() ?? "";
        }
        if (!value) continue;
        out.push({ label: label.replace(/\s+/g, " ").slice(0, 200), value: value.slice(0, 500) });
      }
      return out;
    })
    .catch(() => []);
}

async function uploadResume(
  page: FormScope,
  resumePath: string | null,
): Promise<boolean> {
  if (!resumePath) return false;
  const input = page.locator('input[type="file"]').first();
  try {
    if ((await input.count()) > 0) {
      await input.setInputFiles(resumePath, { timeout: 5000 });
      return true;
    }
  } catch {
    // some ATSes hide the input behind a button — the human can attach manually
  }
  return false;
}

export async function fillCommonForm(
  target: Page,
  ctx: ApplyContext,
  opts: FillOptions = {},
): Promise<FillResult> {
  const page = await formScope(target);
  // Let the board's client app finish initializing — early fills get reset.
  await sleep(1500);
  const f = ctx.fields;
  const filled: string[] = [];
  const skipped: string[] = [];
  // Text fills that succeeded, for the post-settle verification pass.
  const applied: { label: string; selectors: string[]; value: string }[] = [];
  const track = async (label: string, ok: () => Promise<boolean> | boolean) => {
    if (opts.isAborted?.()) {
      skipped.push(label);
      return;
    }
    opts.onProgress?.(label);
    (await ok()) ? filled.push(label) : skipped.push(label);
  };
  const trackFill = async (label: string, selectors: string[], value: string | null) => {
    if (opts.isAborted?.()) {
      skipped.push(label);
      return;
    }
    opts.onProgress?.(label);
    if (await tryFill(page, selectors, value)) {
      filled.push(label);
      applied.push({ label, selectors, value: value! });
    } else {
      skipped.push(label);
    }
  };

  // Names — handle both split and combined name fields.
  await trackFill("first name", [
    'input[name="first_name"]', 'input[autocomplete="given-name"]',
    'input[name*="first" i]', 'input[id*="first" i]', 'input[aria-label*="first name" i]',
    'input[placeholder*="first name" i]',
  ], f.firstName);
  await trackFill("last name", [
    'input[name="last_name"]', 'input[autocomplete="family-name"]',
    'input[name*="last" i]', 'input[id*="last" i]', 'input[aria-label*="last name" i]',
    'input[placeholder*="last name" i]',
  ], f.lastName);
  await trackFill("full name", [
    'input[name="name"]', 'input[id="name"]', 'input[autocomplete="name"]',
    'input[aria-label="Full name" i]', 'input[placeholder*="full name" i]',
  ], f.fullName);

  await trackFill("email", [
    'input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]',
    'input[name*="email" i]', 'input[id*="email" i]', 'input[placeholder*="email" i]',
  ], f.email);
  await trackFill("phone", [
    'input[type="tel"]', 'input[name="phone"]', 'input[autocomplete="tel"]',
    'input[name*="phone" i]', 'input[id*="phone" i]', 'input[placeholder*="phone" i]',
  ], f.phone);

  await trackFill("linkedin", [
    'input[name*="linkedin" i]', 'input[aria-label*="linkedin" i]', 'input[id*="linkedin" i]',
  ], f.linkedin);
  await trackFill("github", [
    'input[name*="github" i]', 'input[aria-label*="github" i]', 'input[id*="github" i]',
  ], f.github);
  await trackFill("portfolio/website", [
    'input[name*="website" i]', 'input[name*="portfolio" i]', 'input[aria-label*="website" i]',
  ], f.portfolio);
  await trackFill("location", [
    'input[name*="location" i]', 'input[aria-label*="location" i]', 'input[id*="location" i]',
  ], f.location);

  await track("resume upload", () => uploadResume(page, ctx.resumePath));

  // Cover letter — paste into a cover-letter textarea if present.
  if (ctx.job.coverLetter) {
    await trackFill("cover letter", [
      'textarea[name*="cover" i]', 'textarea[aria-label*="cover letter" i]',
      'textarea[id*="cover" i]',
    ], ctx.job.coverLetter);
  }

  // Application defaults (M27): fill ONLY the answers the user explicitly set
  // on their profile — a null means "the human decides on the page". This is
  // executing the user's own standing decision, not guessing; the review gate
  // still shows everything before submit.
  if (ctx.defaults) {
    const d = ctx.defaults;
    const yesNo = (v: boolean) => (v ? ["Yes", "yes"] : ["No", "no"]);
    const bool = (v: boolean | null) => (v === null ? null : yesNo(v));
    // Work authorization
    await track("work authorization", () => trySelectByContext(page, ["authorized to work", "legally authorized", "work authorization"], bool(d.authorizedToWork)));
    await track("sponsorship", () => trySelectByContext(page, ["sponsorship", "require sponsorship", "visa sponsorship"], bool(d.needsSponsorship)));
    await track("visa type", () => trySelectByContext(page, ["visa status", "visa type", "work authorization status", "immigration status"], d.visaType ? [d.visaType] : null));
    // Work preferences
    await track("relocation", () => trySelectByContext(page, ["relocate", "relocation", "willing to relocate"], bool(d.canRelocate)));
    await track("start immediately", () => trySelectByContext(page, ["start immediately", "immediately available", "available to start", "immediate start"], bool(d.startImmediately)));
    await track("reliable transportation", () => trySelectByContext(page, ["reliable transportation", "own transportation", "transportation"], bool(d.hasReliableTransportation)));
    await track("worked here before", () => trySelectByContext(page, ["previously employed", "former employee", "worked for", "worked here"], bool(d.workedForCompanyBefore)));
    await track("security clearance", () => trySelectByContext(page, ["security clearance", "government clearance", "clearance"], bool(d.hasGovClearance)));
    await trackFill("expected salary", [
      'input[name*="salary" i]', 'input[aria-label*="salary" i]', 'input[id*="salary" i]',
      'input[name*="compensation" i]', 'input[aria-label*="expected pay" i]',
    ], d.expectedSalary);
    await trackFill("expected hourly rate", [
      'input[name*="hourly" i]', 'input[aria-label*="hourly" i]', 'input[id*="hourly" i]',
      'input[name*="rate" i]',
    ], d.expectedHourlyRate);
    // Self-ID (voluntary)
    await track("gender", () => trySelectByContext(page, ["gender"], d.gender ? [d.gender] : null));
    await track("ethnicity", () => trySelectByContext(page, ["race", "ethnicity"], d.ethnicity ? [d.ethnicity] : null));
    await track("veteran status", () => trySelectByContext(page, ["veteran"], d.veteran === null ? null : d.veteran ? ["I am a veteran", "Veteran", "Yes"] : ["I am not a protected veteran", "not a veteran", "No"]));
    await track("disability status", () => trySelectByContext(page, ["disability"], d.disability === null ? null : d.disability ? ["Yes, I have a disability", "Yes"] : ["No, I do not have a disability", "No"]));
    // Free-text catch-all for "additional information" prompts.
    await trackFill("additional info", [
      'textarea[name*="additional" i]', 'textarea[aria-label*="additional information" i]',
      'textarea[name*="anything else" i]', 'textarea[aria-label*="anything else" i]',
    ], d.additionalInfo);
  }

  // Verification pass: some boards reset programmatic fills when their form
  // store finishes initializing (observed on Greenhouse's new job-boards app,
  // seconds after the fill). Re-check every text fill and re-TYPE any the
  // page threw away.
  if (applied.length > 0 && !opts.isAborted?.()) {
    await sleep(1500);
    for (const a of applied) {
      if (opts.isAborted?.()) break;
      for (const sel of a.selectors) {
        const el = page.locator(sel).first();
        try {
          if ((await el.count()) === 0 || !(await el.isVisible())) continue;
          if ((await el.inputValue()) !== a.value) {
            opts.onProgress?.(`${a.label} (re-typing)`);
            await fillSticky(el, a.value, true);
          }
          break;
        } catch {
          // next selector
        }
      }
    }
  }

  return { filled, skipped };
}

// Best-effort <select> answer near a matching label/name. Misses are fine —
// the human reviews the whole form before anything submits.
async function trySelectByContext(
  page: FormScope,
  keywords: string[],
  optionLabels: string[] | null,
): Promise<boolean> {
  if (!optionLabels?.length) return false;
  for (const kw of keywords) {
    const candidates = [
      page.locator(`select[name*="${kw.split(" ")[0]}" i]`).first(),
      page.locator(`select[id*="${kw.split(" ")[0]}" i]`).first(),
      page.locator(`label:has-text("${kw}")`).locator("xpath=following::select[1]").first(),
    ];
    for (const sel of candidates) {
      try {
        if ((await sel.count()) === 0 || !(await sel.isVisible())) continue;
        // Try exact labels first, then substring matches against the options.
        for (const label of optionLabels) {
          try {
            await sel.selectOption({ label }, { timeout: 1500 });
            return true;
          } catch {
            // try substring match below
          }
        }
        const options = await sel.locator("option").allInnerTexts();
        for (const label of optionLabels) {
          const hit = options.find((o) => o.toLowerCase().includes(label.toLowerCase()));
          if (hit) {
            await sel.selectOption({ label: hit }, { timeout: 1500 });
            return true;
          }
        }
      } catch {
        // next candidate
      }
    }
  }
  // No native <select> — boards like Greenhouse's render dropdowns as
  // type-ahead comboboxes instead.
  return tryComboByLabel(page, keywords, optionLabels);
}

export function detectAts(url: string): "greenhouse" | "lever" | "ashby" | "workday" | "unknown" {
  const h = url.toLowerCase();
  if (h.includes("greenhouse.io") || h.includes("boards.greenhouse")) return "greenhouse";
  if (h.includes("lever.co")) return "lever";
  if (h.includes("ashbyhq.com")) return "ashby";
  if (h.includes("myworkdayjobs.com") || h.includes("myworkdaysite.com")) return "workday";
  return "unknown";
}
