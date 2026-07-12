import type { Page } from "playwright";
import type { ApplyContext } from "@/lib/apply/core";

// Best-effort autofill for accountless ATS forms (Greenhouse / Lever / Ashby).
// Selectors are intentionally broad + tolerant — the human reviews everything
// before submit, so a missed field is a manual fill, never a wrong submission.

type FillResult = { filled: string[]; skipped: string[] };

// Try a list of selectors; fill the first that exists and is editable.
async function tryFill(
  page: Page,
  selectors: string[],
  value: string | null,
): Promise<boolean> {
  if (!value) return false;
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    try {
      if ((await el.count()) > 0 && (await el.isVisible())) {
        await el.fill(value, { timeout: 3000 });
        return true;
      }
    } catch {
      // try the next selector
    }
  }
  return false;
}

async function uploadResume(
  page: Page,
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
  page: Page,
  ctx: ApplyContext,
): Promise<FillResult> {
  const f = ctx.fields;
  const filled: string[] = [];
  const skipped: string[] = [];
  const track = async (label: string, ok: Promise<boolean> | boolean) => {
    (await ok) ? filled.push(label) : skipped.push(label);
  };

  // Names — handle both split and combined name fields.
  await track("first name", tryFill(page, [
    'input[name="first_name"]', 'input[autocomplete="given-name"]',
    'input[id*="first" i]', 'input[aria-label*="first name" i]',
  ], f.firstName));
  await track("last name", tryFill(page, [
    'input[name="last_name"]', 'input[autocomplete="family-name"]',
    'input[id*="last" i]', 'input[aria-label*="last name" i]',
  ], f.lastName));
  await track("full name", tryFill(page, [
    'input[name="name"]', 'input[id="name"]', 'input[aria-label="Full name" i]',
  ], f.fullName));

  await track("email", tryFill(page, [
    'input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]',
    'input[id*="email" i]',
  ], f.email));
  await track("phone", tryFill(page, [
    'input[type="tel"]', 'input[name="phone"]', 'input[autocomplete="tel"]',
    'input[id*="phone" i]',
  ], f.phone));

  await track("linkedin", tryFill(page, [
    'input[name*="linkedin" i]', 'input[aria-label*="linkedin" i]', 'input[id*="linkedin" i]',
  ], f.linkedin));
  await track("github", tryFill(page, [
    'input[name*="github" i]', 'input[aria-label*="github" i]', 'input[id*="github" i]',
  ], f.github));
  await track("portfolio/website", tryFill(page, [
    'input[name*="website" i]', 'input[name*="portfolio" i]', 'input[aria-label*="website" i]',
  ], f.portfolio));
  await track("location", tryFill(page, [
    'input[name*="location" i]', 'input[aria-label*="location" i]', 'input[id*="location" i]',
  ], f.location));

  await track("resume upload", uploadResume(page, ctx.resumePath));

  // Cover letter — paste into a cover-letter textarea if present.
  if (ctx.job.coverLetter) {
    await track("cover letter", tryFill(page, [
      'textarea[name*="cover" i]', 'textarea[aria-label*="cover letter" i]',
      'textarea[id*="cover" i]',
    ], ctx.job.coverLetter));
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
    await track("work authorization", trySelectByContext(page, ["authorized to work", "legally authorized", "work authorization"], bool(d.authorizedToWork)));
    await track("sponsorship", trySelectByContext(page, ["sponsorship", "require sponsorship", "visa sponsorship"], bool(d.needsSponsorship)));
    await track("visa type", trySelectByContext(page, ["visa status", "visa type", "work authorization status", "immigration status"], d.visaType ? [d.visaType] : null));
    // Work preferences
    await track("relocation", trySelectByContext(page, ["relocate", "relocation", "willing to relocate"], bool(d.canRelocate)));
    await track("start immediately", trySelectByContext(page, ["start immediately", "immediately available", "available to start", "immediate start"], bool(d.startImmediately)));
    await track("reliable transportation", trySelectByContext(page, ["reliable transportation", "own transportation", "transportation"], bool(d.hasReliableTransportation)));
    await track("worked here before", trySelectByContext(page, ["previously employed", "former employee", "worked for", "worked here"], bool(d.workedForCompanyBefore)));
    await track("security clearance", trySelectByContext(page, ["security clearance", "government clearance", "clearance"], bool(d.hasGovClearance)));
    await track("expected salary", tryFill(page, [
      'input[name*="salary" i]', 'input[aria-label*="salary" i]', 'input[id*="salary" i]',
      'input[name*="compensation" i]', 'input[aria-label*="expected pay" i]',
    ], d.expectedSalary));
    await track("expected hourly rate", tryFill(page, [
      'input[name*="hourly" i]', 'input[aria-label*="hourly" i]', 'input[id*="hourly" i]',
      'input[name*="rate" i]',
    ], d.expectedHourlyRate));
    // Self-ID (voluntary)
    await track("gender", trySelectByContext(page, ["gender"], d.gender ? [d.gender] : null));
    await track("ethnicity", trySelectByContext(page, ["race", "ethnicity"], d.ethnicity ? [d.ethnicity] : null));
    await track("veteran status", trySelectByContext(page, ["veteran"], d.veteran === null ? null : d.veteran ? ["I am a veteran", "Veteran", "Yes"] : ["I am not a protected veteran", "not a veteran", "No"]));
    await track("disability status", trySelectByContext(page, ["disability"], d.disability === null ? null : d.disability ? ["Yes, I have a disability", "Yes"] : ["No, I do not have a disability", "No"]));
    // Free-text catch-all for "additional information" prompts.
    await track("additional info", tryFill(page, [
      'textarea[name*="additional" i]', 'textarea[aria-label*="additional information" i]',
      'textarea[name*="anything else" i]', 'textarea[aria-label*="anything else" i]',
    ], d.additionalInfo));
  }

  return { filled, skipped };
}

// Best-effort <select> answer near a matching label/name. Misses are fine —
// the human reviews the whole form before anything submits.
async function trySelectByContext(
  page: Page,
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
  return false;
}

export function detectAts(url: string): "greenhouse" | "lever" | "ashby" | "workday" | "unknown" {
  const h = url.toLowerCase();
  if (h.includes("greenhouse.io") || h.includes("boards.greenhouse")) return "greenhouse";
  if (h.includes("lever.co")) return "lever";
  if (h.includes("ashbyhq.com")) return "ashby";
  if (h.includes("myworkdayjobs.com") || h.includes("myworkdaysite.com")) return "workday";
  return "unknown";
}
