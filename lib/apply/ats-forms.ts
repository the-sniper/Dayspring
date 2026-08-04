import type { Frame, Locator, Page } from "playwright";
import type { ApplyContext } from "@/lib/apply/core";

// Best-effort autofill for accountless ATS forms (Greenhouse / Lever / Ashby).
// Selectors are intentionally broad + tolerant — the human reviews everything
// before submit, so a missed field is a manual fill, never a wrong submission.

// Locators don't pierce iframes, and plenty of career pages embed the ATS
// form in one (e.g. Greenhouse's grnhse_iframe). Everything here works on a
// "scope": the frame that actually holds the application form.
export type FormScope = Page | Frame;

export const visibleFieldCount = (scope: FormScope): Promise<number> =>
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
// Site chrome is not the application. A career site's header carries
// input[name="location"] for its job search, which `location` selectors match
// before they ever reach the form — that is how "Philadelphia, PA 19104"
// landed in Mastercard's "Search location" box instead of the address block.
// Nothing inside a banner/nav/search landmark is fillable.
const CHROME_SELECTOR =
  "header, nav, footer, [role=banner], [role=navigation], [role=search], [role=contentinfo]";

async function isSiteChrome(el: Locator): Promise<boolean> {
  return el
    .evaluate(
      (node: HTMLElement, sel: string) => !!node.closest(sel),
      CHROME_SELECTOR,
    )
    .catch(() => false);
}

async function tryFill(
  page: FormScope,
  selectors: string[],
  value: string | null,
): Promise<boolean> {
  if (!value) return false;
  for (const sel of selectors) {
    // .first() would keep picking the header's copy of the field; walk the
    // matches and take the first one that is actually in the form.
    const all = page.locator(sel);
    let n = 0;
    try {
      n = Math.min(await all.count(), 5);
    } catch {
      continue;
    }
    for (let i = 0; i < n; i++) {
      const el = all.nth(i);
      try {
        if (!(await el.isVisible())) continue;
        if (await isSiteChrome(el)) continue;
        if (await fillSticky(el, value)) return true;
      } catch {
        // try the next match / selector
      }
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

// ── US address block ────────────────────────────────────────────────────────
// A profile location of "Philadelphia, PA 19104" carries everything the
// City/State/Postal group needs. Filling it deterministically means the group
// no longer depends on the model, or on the board parsing an uploaded résumé.
const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export function parseUsLocation(
  location: string | null,
): { city: string; state: string; stateName: string; postal: string | null } | null {
  if (!location) return null;
  const m = location.match(/^\s*([A-Za-z.'\- ]{2,40}),\s*([A-Za-z]{2})\b\s*(\d{5})?/);
  if (!m) return null;
  const abbr = m[2].toUpperCase();
  const stateName = US_STATES[abbr];
  if (!stateName) return null;
  return { city: m[1].trim(), state: abbr, stateName, postal: m[3] ?? null };
}

// State is nearly always a <select>, and boards disagree on whether the option
// is "PA" or "Pennsylvania" — try both, by label and by value.
async function trySelectState(scope: FormScope, abbr: string, name: string): Promise<boolean> {
  const candidates: Locator[] = [
    ...['select[name*="state" i]', 'select[id*="state" i]', 'select[aria-label*="state" i]',
      'select[name*="province" i]', 'select[name*="region" i]', 'select[id*="province" i]',
      'select[id*="region" i]'].map((sel) => scope.locator(sel).first()),
  ];
  // Attribute names are a lottery — Mastercard's is id="cntryFields.region"
  // with no name and no aria-label. Its <label for> says "State", which is the
  // one thing every accessible form gets right, so match on that too.
  const byLabel = await scope
    .evaluate(() => {
      const selects = Array.from(document.querySelectorAll("select"));
      return selects.findIndex((s) => {
        const text = s.id
          ? document.querySelector(`label[for="${CSS.escape(s.id)}"]`)?.textContent ?? ""
          : "";
        return /^\s*\*?\s*(state|province|region)\b/i.test(text.trim());
      });
    })
    .catch(() => -1);
  if (byLabel >= 0) candidates.push(scope.locator("select").nth(byLabel));

  for (const el of candidates) {
    try {
      if ((await el.count()) === 0 || !(await el.isVisible())) continue;
      if (await isSiteChrome(el)) continue;
      // Option VALUES are board-specific ("USA-PA"); the visible label is not.
      for (const attempt of [{ label: name }, { label: abbr }, { value: abbr }]) {
        try {
          await el.selectOption(attempt, { timeout: 2000 });
          return true;
        } catch {
          // next shape
        }
      }
    } catch {
      // next candidate
    }
  }
  return false;
}

// ── Mechanical selects ──────────────────────────────────────────────────────
// Questions that are about the APPLICATION, not the applicant: what kind of
// phone number this is, where the posting was found. They have a factually
// correct answer we already know, so they never need a model or the human —
// and left blank they block submit just as hard as a missing name.
const PHONE_TYPE_RX = /phone.*(device|type)|type.*phone/i;
const REFERRAL_RX = /how did you (hear|find)|referral source|where did you|^\s*\*?\s*source/i;

// "How did you hear about us?" has a true answer and we know it: the run
// arrived through a specific aggregator, and the landing URL still carries the
// utm_source that delivered it. Match the board's own option list against that
// rather than picking a plausible-looking one — "LinkedIn" would be a lie.
export function referralTerms(pageUrl: string, jobSource: string | null): string[] {
  const terms: string[] = [];
  try {
    const p = new URL(pageUrl).searchParams;
    for (const key of ["utm_source", "source", "src"]) {
      const v = p.get(key);
      if (v) terms.push(v.toLowerCase());
    }
  } catch {
    // not a URL we can read — fall through to the generic terms
  }
  if (jobSource) terms.push(jobSource.toLowerCase());
  // Generic, still true: it came from a job board, and no specific board here.
  terms.push("job board", "online job", "other job board", "other");
  return [...new Set(terms)];
}

async function fillMechanicalSelects(scope: FormScope, terms: string[]): Promise<string[]> {
  const done: string[] = [];
  const selects = scope.locator("select");
  const n = Math.min(await selects.count().catch(() => 0), 25);
  for (let i = 0; i < n; i++) {
    const el = selects.nth(i);
    try {
      if (!(await el.isVisible())) continue;
      if (await isSiteChrome(el)) continue;
      const info = await el.evaluate((s: HTMLSelectElement) => ({
        label:
          (s.id ? document.querySelector(`label[for="${CSS.escape(s.id)}"]`)?.textContent : "") ||
          s.getAttribute("aria-label") ||
          s.getAttribute("name") ||
          "",
        value: s.value,
        options: Array.from(s.options).map((o) => o.text.trim()),
      }));
      if (info.value) continue; // already answered
      let choice: string | undefined;
      if (PHONE_TYPE_RX.test(info.label)) {
        choice = [/^mobile$/i, /^cell/i, /^personal/i]
          .map((p) => info.options.find((o) => p.test(o)))
          .find(Boolean);
      } else if (REFERRAL_RX.test(info.label)) {
        // First term that the board actually offers wins — most specific
        // (appcast, adzuna) before the generic fallbacks.
        for (const t of terms) {
          choice = info.options.find((o) => o.toLowerCase().includes(t));
          if (choice) break;
        }
      }
      if (!choice) continue;
      await el.selectOption({ label: choice }, { timeout: 2500 });
      done.push(`${info.label.replace(/\s+/g, " ").replace(/\*/g, "").trim().slice(0, 32)} → ${choice}`);
    } catch {
      // next select
    }
  }
  return done;
}

// Required fields the form still needs. Distinct from fieldProblems(), which
// only reports what the board has already flagged red — this is what will go
// red the moment the human hits submit, named up front.
export async function requiredStillEmpty(target: Page): Promise<string[]> {
  const scope = await formScope(target);
  return scope
    .evaluate(() => {
      const out: string[] = [];
      const seenGroup = new Set<string>();
      for (const el of Array.from(
        document.querySelectorAll("input:not([type=hidden]), textarea, select"),
      )) {
        const e = el as HTMLInputElement;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (e.type === "checkbox") continue; // consent boxes are never "missing"
        // Radio groups carry their asterisk in the QUESTION, not on the input,
        // so they need their own required-check — climb to the ancestor that
        // holds the whole group and read the text around it.
        if (e.type === "radio") {
          const name = e.name;
          if (!name || seenGroup.has(name)) continue;
          seenGroup.add(name);
          const group = Array.from(
            document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(name)}"]`),
          );
          if (group.some((g) => g.checked)) continue;
          let question = "";
          let up: HTMLElement | null = el.parentElement;
          for (let i = 0; i < 6 && up; i++, up = up.parentElement) {
            if (!group.every((g) => up!.contains(g))) continue;
            let text = (up.innerText || "").replace(/\s+/g, " ").trim();
            for (const g of group) {
              const t = (g.closest("label")?.textContent || g.value || "").trim();
              if (t) text = text.split(t).join(" ");
            }
            text = text.replace(/\s+/g, " ").trim();
            if (text.length >= 15) {
              question = text;
              break;
            }
          }
          const isRequired =
            /\*/.test(question) ||
            el.closest("[aria-required=true], fieldset[required]") !== null;
          // EEO is the human's alone — never listed as something to go fill.
          const isEeo =
            /gender|race|ethnic|veteran|disab|sexual orientation|pronoun|self[- ]?identif/i.test(question);
          if (question && isRequired && !isEeo) {
            out.push(question.replace(/\*/g, "").trim().slice(0, 90));
          }
          continue;
        }
        const label =
          (e.id ? document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent : "") ||
          e.getAttribute("aria-label") ||
          e.getAttribute("placeholder") ||
          e.name ||
          "";
        const container = el.closest("fieldset, [class*=field], [class*=form-group], div");
        const required =
          e.required ||
          e.getAttribute("aria-required") === "true" ||
          /\*/.test(label) ||
          /\*/.test(container?.querySelector("label")?.textContent ?? "");
        if (!required) continue;
        if (!e.value) out.push(label.replace(/\s+/g, " ").replace(/\*/g, "").trim().slice(0, 60));
      }
      return out.filter(Boolean).slice(0, 10);
    })
    .catch(() => []);
}

// ── Safe defaults for unanswered questions ──────────────────────────────────
// A single unanswered question stalls the whole wizard, so rather than stop,
// pick the conservative answer and let the human correct it at the review gate
// (every one of these is listed there before anything is submitted, and tagged
// "(safe default)" so it stands out).
//
// Two hard exclusions, because a wrong answer here is not a typo:
//   - legal attestations (convictions, background/drug-test consent) — never
//     answered by anything but the human;
//   - free text (desired salary, "tell us about…") — there is nothing
//     conservative to say, so it stays empty and gets surfaced.
const NEVER_AUTO =
  /convicted|conviction|criminal|felony|misdemeanor|arrest|background (check|investigation)|drug (test|screen)|consent to|i certify|i attest|acknowledge that/i;

const SAFE_ANSWERS: { match: RegExp; answers: string[]; label: string }[] = [
  // Assertions about status: the answer that keeps an application alive.
  { match: /now legally authorized|currently authorized|authorized to work/i, answers: ["Yes"], label: "work authorization" },
  { match: /require sponsorship|need sponsorship|sponsorship for an employment visa|visa sponsorship/i, answers: ["No"], label: "sponsorship" },
  // Assertions about obligations that would restrict the role.
  { match: /restrictive covenant|non-?compete|non-?disclosure agreement|non-?solicit/i, answers: ["No"], label: "restrictive covenant" },
  { match: /ever worked for|previously employed|former employee|currently employed by/i, answers: ["No"], label: "worked here before" },
  { match: /related to|family member|relative who works/i, answers: ["No"], label: "relatives at company" },
  { match: /require .*(accommodation)/i, answers: ["No"], label: "accommodations" },
  { match: /security clearance|government clearance/i, answers: ["No"], label: "security clearance" },
];

// Voluntary self-ID always offers a decline option, and declining is both the
// privacy-preserving answer and the one no one can be wrong about.
const SELF_ID_RX =
  /gender|race|ethnic|veteran|disab|sexual orientation|lgbt|pronoun|transgender|self[- ]?identif|demographic/i;
const DECLINE_RX =
  /prefer not|decline|do not wish|don'?t wish|not to (answer|disclose|identify)|choose not|i don'?t want/i;

export type SafeAnswer = { question: string; answer: string };

export async function answerRemainingSafely(
  target: Page,
  opts: { expectedSalary?: string | null } = {},
): Promise<SafeAnswer[]> {
  const scope = await formScope(target);
  return scope
    .evaluate(
      ({ rules, neverSrc, selfIdSrc, declineSrc, salary }: {
        rules: { match: string; answers: string[]; label: string }[];
        neverSrc: string;
        selfIdSrc: string;
        declineSrc: string;
        salary: string;
      }) => {
        const never = new RegExp(neverSrc, "i");
        const selfId = new RegExp(selfIdSrc, "i");
        const decline = new RegExp(declineSrc, "i");
        const applied: { question: string; answer: string }[] = [];

        // --- selects -------------------------------------------------------
        for (const s of Array.from(document.querySelectorAll("select"))) {
          const r = s.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || s.value) continue;
          if (s.closest("header, nav, footer, [role=banner], [role=search]")) continue;
          const question = (
            (s.id ? document.querySelector(`label[for="${CSS.escape(s.id)}"]`)?.textContent : "") ||
            s.getAttribute("aria-label") ||
            s.getAttribute("name") ||
            ""
          ).replace(/\s+/g, " ").trim();
          if (!question || never.test(question)) continue;
          const options = Array.from(s.options).map((o) => o.text.trim()).filter(Boolean);
          let wanted: string[] = [];
          if (selfId.test(question)) {
            const d = options.find((o) => decline.test(o));
            if (d) wanted = [d];
          } else {
            for (const rule of rules) {
              if (new RegExp(rule.match, "i").test(question)) {
                wanted = rule.answers;
                break;
              }
            }
          }
          if (wanted.length === 0) continue;
          let chosen = "";
          for (const w of wanted) {
            const hit =
              options.find((o) => o.toLowerCase() === w.toLowerCase()) ??
              options.find((o) => o.toLowerCase().startsWith(w.toLowerCase()));
            if (hit) {
              chosen = hit;
              break;
            }
          }
          if (!chosen) continue;
          s.value = Array.from(s.options).find((o) => o.text.trim() === chosen)?.value ?? "";
          s.dispatchEvent(new Event("input", { bubbles: true }));
          s.dispatchEvent(new Event("change", { bubbles: true }));
          applied.push({ question: question.replace(/\*/g, "").slice(0, 80), answer: chosen });
        }

        // --- radio groups --------------------------------------------------
        const seen = new Set<string>();
        for (const el of Array.from(document.querySelectorAll<HTMLInputElement>("input[type=radio]"))) {
          const name = el.name;
          if (!name || seen.has(name)) continue;
          seen.add(name);
          const group = Array.from(
            document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(name)}"]`),
          );
          if (group.some((g) => g.checked)) continue;
          let question = "";
          let node: HTMLElement | null = el.parentElement;
          for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
            if (!group.every((g) => node!.contains(g))) continue;
            let text = (node.innerText || "").replace(/\s+/g, " ").trim();
            for (const g of group) {
              const t = (g.closest("label")?.textContent || g.value || "").trim();
              if (t) text = text.split(t).join(" ");
            }
            if (text.trim().length >= 10) {
              question = text.trim();
              break;
            }
          }
          if (!question || never.test(question)) continue;
          const labels = group.map((g) => {
            const viaFor = g.id
              ? document.querySelector(`label[for="${CSS.escape(g.id)}"]`)?.textContent ?? ""
              : "";
            return (viaFor || g.closest("label")?.textContent || g.value || "").trim();
          });
          let wanted: string[] = [];
          if (selfId.test(question)) {
            const d = labels.find((l) => decline.test(l));
            if (d) wanted = [d];
          } else {
            for (const rule of rules) {
              if (new RegExp(rule.match, "i").test(question)) {
                wanted = rule.answers;
                break;
              }
            }
          }
          if (wanted.length === 0) continue;
          for (const w of wanted) {
            const idx = labels.findIndex((l) => l.toLowerCase() === w.toLowerCase());
            if (idx >= 0) {
              group[idx].click();
              applied.push({ question: question.replace(/\*/g, "").slice(0, 80), answer: labels[idx] });
              break;
            }
          }
        }
        // --- salary free-text ----------------------------------------------
        // The one free-text question with a safe, standard answer. A number is
        // a negotiating position and stays the human's; "Negotiable" is not.
        // Skipped for numeric inputs, which would just fail validation.
        for (const el of Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"),
        )) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || el.value) continue;
          if ((el as HTMLInputElement).type === "number") continue;
          const question = (
            (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : "") ||
            el.getAttribute("aria-label") ||
            el.getAttribute("placeholder") ||
            ""
          ).replace(/\s+/g, " ").trim();
          if (!question || never.test(question)) continue;
          if (!/desired salary|salary expectation|expected (salary|compensation)|compensation expectation/i.test(question)) {
            continue;
          }
          el.value = salary;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          applied.push({ question: question.replace(/\*/g, "").slice(0, 80), answer: salary });
        }

        return applied;
      },
      {
        rules: SAFE_ANSWERS.map((r) => ({ match: r.match.source, answers: r.answers, label: r.label })),
        neverSrc: NEVER_AUTO.source,
        selfIdSrc: SELF_ID_RX.source,
        declineSrc: DECLINE_RX.source,
        salary: opts.expectedSalary?.trim() || "Negotiable",
      },
    )
    .catch(() => []);
}

// ── Multi-step applications ─────────────────────────────────────────────────
// Plenty of boards (Phenom, Workday, SmartRecruiters) split an application over
// several pages behind a "Next". Filling page one and stopping looks identical
// to being stuck — the form is complete and nothing happens.
//
// "Next" is NOT "Submit": advancing a page is reversible and sends nothing,
// which is why the stepper may run unattended while the final submit stays
// behind the human's approval. It refuses to advance past a page with required
// answers missing, since that only walks into a validation wall.
const NEXT_RX = /^\s*(next|continue|save (and|&) continue|proceed|save (and|&) next)\s*$/i;
const FINAL_RX = /submit|finish|send application|complete application/i;

export async function nextStepButton(target: Page): Promise<Locator | null> {
  const scope = await formScope(target);
  const buttons = scope.locator('button:visible, input[type="button"]:visible, a[role="button"]:visible');
  const n = Math.min(await buttons.count().catch(() => 0), 40);
  for (let i = 0; i < n; i++) {
    const el = buttons.nth(i);
    try {
      const text = ((await el.innerText().catch(() => "")) || (await el.getAttribute("value")) || "").trim();
      if (!text || !NEXT_RX.test(text)) continue;
      if (FINAL_RX.test(text)) continue; // a final submit, not a step
      if (await isSiteChrome(el)) continue;
      if (!(await el.isEnabled().catch(() => false))) continue;
      return el;
    } catch {
      // next candidate
    }
  }
  return null;
}

export async function finalSubmitButton(target: Page): Promise<Locator | null> {
  const scope = await formScope(target);
  const byRole = scope.getByRole("button", { name: FINAL_RX }).first();
  if ((await byRole.count().catch(() => 0)) > 0 && (await byRole.isVisible().catch(() => false))) {
    return byRole;
  }
  return null;
}

export type StepOutcome = { steps: number; blockedBy: string[] };

// Walk the wizard as far as the answers allow.
export async function advanceSteps(
  page: Page,
  fillPage: () => Promise<void>,
  opts: { maxSteps?: number; onProgress?: (msg: string) => void } = {},
): Promise<StepOutcome> {
  const maxSteps = opts.maxSteps ?? 6;
  let steps = 0;
  for (let i = 0; i < maxSteps; i++) {
    const blockedBy = await requiredStillEmpty(page);
    if (blockedBy.length > 0) return { steps, blockedBy };
    const next = await nextStepButton(page);
    if (!next) return { steps, blockedBy: [] }; // last page of the wizard
    const before = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
    opts.onProgress?.(`Moving to the next step of the application (${steps + 2})…`);
    await next.click({ timeout: 8000 }).catch(() => {});
    // Wizards swap the step in place as often as they navigate.
    for (let w = 0; w < 12; w++) {
      await page.waitForTimeout(700);
      const now = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
      if (Math.abs(now - before) > 40) break;
    }
    steps++;
    await fillPage();
  }
  return { steps, blockedBy: await requiredStillEmpty(page) };
}

// ── The form's own validation ───────────────────────────────────────────────
// Filling a field is not the same as the field being ACCEPTED. Mastercard's
// number box sits next to a "+1" country-code select, so "+1 215-452-8651"
// comes back "Not a valid phone number" — filled, red, and blocking submit.
// Reading the board's error nodes is what makes a retry possible.
const ERROR_RX = /not a valid|isn'?t valid|invalid|please (enter|select|provide|choose)|must be|required/i;

export type FieldProblem = { label: string; message: string };

export async function fieldProblems(target: Page): Promise<FieldProblem[]> {
  const scope = await formScope(target);
  return scope
    .evaluate((errSrc: string) => {
      const rx = new RegExp(errSrc, "i");
      // Only real error nodes — a static "* Required" hint next to every
      // labelled field would otherwise report the whole form as broken.
      const ERROR_NODE = '[role=alert], [aria-live], [class*="error" i], [class*="invalid" i], [id*="error" i]';
      const out: { label: string; message: string }[] = [];
      for (const el of Array.from(
        document.querySelectorAll("input:not([type=hidden]), textarea, select"),
      )) {
        const e = el as HTMLInputElement;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        let label = "";
        if (e.id) label = document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent?.trim() ?? "";
        if (!label) label = e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.name || "";

        let message = "";
        const described = e.getAttribute("aria-describedby");
        if (described) {
          for (const id of described.split(/\s+/)) {
            const t = document.getElementById(id)?.textContent?.trim() ?? "";
            if (rx.test(t)) message = t;
          }
        }
        if (!message) {
          let node: HTMLElement | null = el.parentElement;
          for (let i = 0; i < 3 && node && !message; i++, node = node.parentElement) {
            for (const cand of Array.from(node.querySelectorAll(ERROR_NODE))) {
              const t = (cand.textContent || "").trim();
              if (t && rx.test(t) && t.length < 160) {
                message = t;
                break;
              }
            }
          }
        }
        if (!message && e.getAttribute("aria-invalid") === "true") message = "marked invalid";
        if (message) out.push({ label: label.replace(/\s+/g, " ").slice(0, 60), message: message.slice(0, 120) });
      }
      return out;
    }, ERROR_RX.source)
    .catch(() => []);
}

// A number next to a country-code select wants the NATIONAL number.
export function phoneVariants(phone: string, codeFieldPresent: boolean): string[] {
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const dashed =
    national.length === 10
      ? `${national.slice(0, 3)}-${national.slice(3, 6)}-${national.slice(6)}`
      : national;
  const asGiven = phone.trim();
  return [...new Set(codeFieldPresent ? [national, dashed, asGiven] : [asGiven, national, dashed])];
}

async function hasPhoneCodeField(scope: FormScope): Promise<boolean> {
  return scope
    .evaluate(() => {
      const rx = /phone.?code|country.?code|dial|isd/i;
      return Array.from(document.querySelectorAll("select")).some((s) => {
        const label = [s.getAttribute("name"), s.id, s.getAttribute("aria-label")]
          .filter(Boolean)
          .join(" ");
        return rx.test(label) || Array.from(s.options).slice(0, 40).some((o) => /\(\+\d{1,3}\)/.test(o.text));
      });
    })
    .catch(() => false);
}

const PHONE_SELECTORS = [
  'input[type="tel"]', 'input[name="phone"]', 'input[autocomplete="tel"]',
  'input[name*="phone" i]', 'input[id*="phone" i]', 'input[placeholder*="phone" i]',
];

// Re-fill what the board rejected, in the format it will accept. Only fields
// we can legitimately re-derive are retried — the rest are reported so the
// human sees exactly what is blocking submit instead of hunting for red text.
export async function repairFieldErrors(
  target: Page,
  ctx: ApplyContext,
): Promise<{ fixed: string[]; remaining: FieldProblem[] }> {
  const scope = await formScope(target);
  const fixed: string[] = [];
  const isPhone = (p: FieldProblem) => /phone|mobile|tel\b/i.test(p.label);

  let problems = await fieldProblems(target);
  if (ctx.fields.phone && problems.some(isPhone)) {
    const withCode = await hasPhoneCodeField(scope);
    for (const variant of phoneVariants(ctx.fields.phone, withCode)) {
      if (!(await tryFill(scope, PHONE_SELECTORS, variant))) break;
      await sleep(800);
      problems = await fieldProblems(target);
      if (!problems.some(isPhone)) {
        fixed.push(`phone → ${variant}`);
        break;
      }
    }
  }
  return { fixed, remaining: problems };
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
  // Lead with the format the form is built for: a number box paired with a
  // country-code select rejects "+1 …" outright.
  await trackFill(
    "phone",
    PHONE_SELECTORS,
    f.phone ? phoneVariants(f.phone, await hasPhoneCodeField(page))[0] : null,
  );

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

  // Split address block, when the profile location gives us "City, ST ZIP".
  const addr = parseUsLocation(f.location);
  if (addr) {
    await trackFill("city", [
      'input[name*="city" i]', 'input[id*="city" i]', 'input[aria-label*="city" i]',
      'input[placeholder*="city" i]',
    ], addr.city);
    await trackFill("postal code", [
      'input[name*="postal" i]', 'input[name*="zip" i]', 'input[id*="postal" i]',
      'input[id*="zip" i]', 'input[aria-label*="postal" i]', 'input[aria-label*="zip" i]',
    ], addr.postal);
    await track("state", () => trySelectState(page, addr.state, addr.stateName));
  }

  await track("resume upload", () => uploadResume(page, ctx.resumePath));

  // Application-about-the-application questions, answered from what we know
  // about this run rather than from the applicant. Twice, with a beat between:
  // these selects cascade — answering "How did you hear about us" with a job
  // board reveals a follow-up "Source" asking WHICH one.
  const terms = referralTerms(target.url(), ctx.job.source);
  for (const m of await fillMechanicalSelects(page, terms)) filled.push(m);
  await sleep(1200);
  for (const m of await fillMechanicalSelects(page, terms)) filled.push(m);

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
  // Yes/no questions are as often a RADIO PAIR as a dropdown — Mastercard's
  // "Have you ever worked for Mastercard…" is two radios. Without this, every
  // boolean default (sponsorship, relocation, worked-here-before) silently did
  // nothing on that whole class of form.
  if (await tryRadioByContext(page, keywords, optionLabels)) return true;

  // No native <select> — boards like Greenhouse's render dropdowns as
  // type-ahead comboboxes instead.
  return tryComboByLabel(page, keywords, optionLabels);
}

// Match a radio GROUP by the text of its question, then pick the option whose
// label is the answer. No named helpers inside the callback — it runs in-page.
async function tryRadioByContext(
  scope: FormScope,
  keywords: string[],
  optionLabels: string[],
): Promise<boolean> {
  return scope
    .evaluate(
      ({ keywords: kws, answers }: { keywords: string[]; answers: string[] }) => {
        const seen = new Set<string>();
        for (const el of Array.from(document.querySelectorAll<HTMLInputElement>("input[type=radio]"))) {
          const name = el.name;
          if (!name || seen.has(name)) continue;
          seen.add(name);
          const group = Array.from(
            document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(name)}"]`),
          );
          if (group.some((g) => g.checked)) continue;
          // The question: nearest ancestor holding the whole group, minus the
          // option labels themselves.
          let question = "";
          let node: HTMLElement | null = el.parentElement;
          for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
            if (!group.every((g) => node!.contains(g))) continue;
            let text = (node.innerText || "").replace(/\s+/g, " ").trim();
            for (const g of group) {
              const t = (g.closest("label")?.textContent || g.value || "").trim();
              if (t) text = text.split(t).join(" ");
            }
            if (text.trim().length >= 10) {
              question = text.toLowerCase();
              break;
            }
          }
          if (!question || !kws.some((k) => question.includes(k.toLowerCase()))) continue;
          for (const want of answers) {
            for (const g of group) {
              const viaFor = g.id
                ? document.querySelector(`label[for="${CSS.escape(g.id)}"]`)?.textContent ?? ""
                : "";
              const label = (viaFor || g.closest("label")?.textContent || g.value || "").trim();
              if (label.toLowerCase() === want.toLowerCase()) {
                g.click();
                return true;
              }
            }
          }
        }
        return false;
      },
      { keywords, answers: optionLabels },
    )
    .catch(() => false);
}

// Is this Workday tenant already signed in for the current browser profile?
// A signed-out tenant shows a sign-in / create-account form; a signed-in one
// drops you straight onto the application. A password field or a sign-in button
// means signed out, and the window goes to the human. Anything else with a real
// form takes the normal autofill path.
export async function workdaySignedIn(page: Page): Promise<boolean> {
  const scope = await formScope(page);
  try {
    if ((await scope.locator('input[type="password"]:visible').count()) > 0) return false;
    const signIn = scope.getByRole("button", {
      name: /sign in|create account|log in/i,
    });
    if ((await signIn.count()) > 0 && (await signIn.first().isVisible())) return false;
  } catch {
    // An unreadable page counts as signed out — manual is the safe default.
    return false;
  }
  return (await visibleFieldCount(scope)) >= 3;
}

export function detectAts(url: string): "greenhouse" | "lever" | "ashby" | "workday" | "unknown" {
  const h = url.toLowerCase();
  if (h.includes("greenhouse.io") || h.includes("boards.greenhouse")) return "greenhouse";
  if (h.includes("lever.co")) return "lever";
  if (h.includes("ashbyhq.com")) return "ashby";
  if (h.includes("myworkdayjobs.com") || h.includes("myworkdaysite.com")) return "workday";
  return "unknown";
}
