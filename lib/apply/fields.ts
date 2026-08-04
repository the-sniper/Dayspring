// Extract application-form fields from the free-text profile. Never-fabricate:
// only returns what the profile actually states; leaves EEO/demographics blank
// rather than guessing.

export type ApplicantFields = {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  location: string | null;
};

const EMAIL = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const LINKEDIN = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i;
const GITHUB = /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i;
const URL_ANY = /https?:\/\/[^\s)]+/gi;

// A labeled line like "Name: Jane Doe" or "Phone — +1 555…".
function labeled(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:\\-–]\\s*(.+)`, "i");
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

export function extractFields(profile: string): ApplicantFields {
  const email =
    labeled(profile, ["email", "e-mail"])?.match(EMAIL)?.[1] ??
    profile.match(EMAIL)?.[1] ??
    null;
  const phone =
    labeled(profile, ["phone", "mobile", "tel", "cell"])?.match(PHONE)?.[1]?.trim() ??
    profile.match(PHONE)?.[1]?.trim() ??
    null;
  const linkedin = profile.match(LINKEDIN)?.[0] ?? null;
  const github = profile.match(GITHUB)?.[0] ?? null;

  // Portfolio = first non-linkedin/github http URL.
  const portfolio =
    (profile.match(URL_ANY) ?? []).find(
      (u) => !LINKEDIN.test(u) && !GITHUB.test(u),
    ) ?? null;

  // Name: prefer a labeled "Name:" line; else the first non-empty line if it
  // looks like a person's name (2–4 capitalized words, no digits/@).
  let fullName = labeled(profile, ["name", "full name"]);
  if (!fullName) {
    const first = profile
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (
      first &&
      /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(first) &&
      !EMAIL.test(first)
    ) {
      fullName = first;
    }
  }
  const parts = fullName ? fullName.split(/\s+/) : [];
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts[parts.length - 1] : null;

  // Résumés rarely label their location — it sits in the header block under
  // the name ("Philadelphia, PA 19104"). Without this fallback the whole
  // City/State/Postal group on an application form stays empty. Scoped to the
  // first few lines and to a real 2-letter state so prose ("Interested in
  // Fullstack, Frontend") can't match.
  const location =
    labeled(profile, ["location", "based in", "city"]) ??
    profile
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)
      .map((l) => l.match(/^([A-Z][A-Za-z.'\- ]{1,30}),\s*([A-Z]{2})(?:\s+(\d{5}))?\b/))
      .find(Boolean)
      ?.slice(1, 4)
      .filter(Boolean)
      .join(", ")
      .replace(/, (\d{5})$/, " $1") ??
    null;

  return {
    firstName,
    lastName,
    fullName,
    email,
    phone,
    linkedin,
    github,
    portfolio,
    location,
  };
}
