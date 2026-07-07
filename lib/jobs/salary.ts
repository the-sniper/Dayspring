// Best-effort salary extraction from a job description. ATS APIs almost never
// expose structured comp, so we mine the text. Deliberately conservative:
// USD only, and we ignore figures that look like equity, headcount, or years.
// A miss just leaves the salary columns null (filter shows "no data").

export type ParsedSalary = {
  min: number | null;
  max: number | null;
  currency: string | null; // only "USD" for now
};

const EMPTY: ParsedSalary = { min: null, max: null, currency: null };

// $120,000 / $120k / $120K / 120,000 (when preceded by $ within the phrase)
const AMOUNT = "\\$\\s?(\\d{1,3}(?:,\\d{3})+|\\d{2,7})(?:\\.\\d+)?\\s?([kK])?";
// A range: "$120,000 - $150,000", "$120k–150k", "$120,000 to $150,000"
const RANGE_RE = new RegExp(
  `${AMOUNT}\\s*(?:-|–|—|to|\\bthrough\\b)\\s*${AMOUNT}`,
);
const SINGLE_RE = new RegExp(AMOUNT);

// Hints that an amount near the phrase is an annual salary vs. something else.
const HOURLY_RE = /\/\s?(hour|hr)\b|per hour|hourly|an hour/i;
const ANNUAL_HINT_RE =
  /salary|compensation|comp\b|base pay|base salary|pay range|\/\s?year|per year|per annum|annually|annual|\bofr\b|\brange\b|usd/i;

function toNumber(digits: string, k: string | undefined): number {
  const n = Number(digits.replace(/,/g, ""));
  return k ? n * 1000 : n;
}

/** Annualize an hourly rate at 2080 hrs/yr (40h * 52w). */
function annualizeIfHourly(value: number, hourly: boolean): number {
  if (!hourly) return value;
  return Math.round(value * 2080);
}

// Plausible annual USD tech-salary window; filters out prices, equity, counts.
function plausible(n: number): boolean {
  return n >= 20_000 && n <= 2_000_000;
}

export function parseSalary(text: string | null | undefined): ParsedSalary {
  if (!text) return EMPTY;

  // Look at windows around comp keywords first for precision, then fall back to
  // the first dollar range/figure anywhere in the text.
  const candidates: string[] = [];
  const kw = /(salary|compensation|comp\b|base pay|pay range|pay:|\$)/gi;
  let m: RegExpExecArray | null;
  while ((m = kw.exec(text)) && candidates.length < 8) {
    candidates.push(text.slice(m.index, m.index + 120));
  }
  candidates.push(text);

  for (const window of candidates) {
    const hourly = HOURLY_RE.test(window);

    const range = RANGE_RE.exec(window);
    if (range) {
      let lo = annualizeIfHourly(toNumber(range[1], range[2]), hourly);
      let hi = annualizeIfHourly(toNumber(range[3], range[4]), hourly);
      if (lo > hi) [lo, hi] = [hi, lo];
      if (plausible(lo) && plausible(hi)) {
        return { min: lo, max: hi, currency: "USD" };
      }
    }

    // Single figure only when an annual/hourly hint sits nearby, to avoid
    // grabbing "$50 gift card" or "$1B raised".
    if (ANNUAL_HINT_RE.test(window) || hourly) {
      const single = SINGLE_RE.exec(window);
      if (single) {
        const v = annualizeIfHourly(toNumber(single[1], single[2]), hourly);
        if (plausible(v)) return { min: v, max: v, currency: "USD" };
      }
    }
  }

  return EMPTY;
}

/** "$120k – $150k" / "$120k+" / "$150k" for compact table display. */
export function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  if (min == null && max == null) return null;
  const sym = currency === "USD" || currency == null ? "$" : `${currency} `;
  const k = (n: number) =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
  if (min != null && max != null && min !== max) {
    return `${sym}${k(min)}–${sym}${k(max)}`;
  }
  const v = (max ?? min) as number;
  return `${sym}${k(v)}`;
}
