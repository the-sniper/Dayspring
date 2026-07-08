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

  // NOTE: EEO / demographic / veteran / disability questions are intentionally
  // NEVER auto-answered — the human decides those.
  return { filled, skipped };
}

export function detectAts(url: string): "greenhouse" | "lever" | "ashby" | "workday" | "unknown" {
  const h = url.toLowerCase();
  if (h.includes("greenhouse.io") || h.includes("boards.greenhouse")) return "greenhouse";
  if (h.includes("lever.co")) return "lever";
  if (h.includes("ashbyhq.com")) return "ashby";
  if (h.includes("myworkdayjobs.com") || h.includes("myworkdaysite.com")) return "workday";
  return "unknown";
}
