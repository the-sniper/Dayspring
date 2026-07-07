// Heuristics over the free-text ATS `location` string. Two jobs of the same
// title from the same board can carry wildly different location formats
// ("Remote - US", "San Francisco, CA", "London, UK", "Hybrid - Sydney"), so we
// derive two structured signals: workplace type and whether the role is
// US-based. Kept dependency-free and pure so the pull core, manual create, and
// the backfill script can all share it.
import type { WorkplaceType } from "@/lib/types";

// Comma + 2-letter uppercase state code (e.g. "San Francisco, CA"). Matched
// case-sensitively to avoid colliding with lowercase words like "or", "in".
const US_STATE_CODES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const STATE_CODE_RE = new RegExp(`,\\s*(${US_STATE_CODES})\\b`);

// Unambiguously-US tokens: full country names, unambiguous state names, and
// major US metros. Deliberately omits names that also exist abroad (Cambridge,
// Birmingham, Manchester, Georgia, Washington-the-country-no, San Jose CR…).
const US_TOKENS = [
  "united states",
  "usa",
  "u.s.a",
  "u.s.",
  "us based",
  "us-based",
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","hawaii","idaho","illinois","indiana","iowa","kansas",
  "kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota",
  "mississippi","missouri","montana","nebraska","nevada","new hampshire",
  "new jersey","new mexico","new york","north carolina","north dakota","ohio",
  "oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota",
  "tennessee","texas","utah","vermont","virginia","west virginia","wisconsin","wyoming",
  "san francisco","new york city","nyc","los angeles","seattle","austin","boston",
  "chicago","denver","atlanta","dallas","houston","san diego","san jose","palo alto",
  "mountain view","sunnyvale","menlo park","philadelphia","phoenix","las vegas",
  "nashville","charlotte","raleigh","durham","minneapolis","detroit","pittsburgh",
  "salt lake city","san antonio","columbus","kansas city","indianapolis","cincinnati",
  "brooklyn","oakland","bellevue","redmond","arlington","reston","santa clara",
  "santa monica","irvine","san mateo","boulder","tampa","orlando","miami",
  "washington, dc","washington dc","d.c.",
];

// Clearly-non-US tokens: countries, regional acronyms, and major foreign metros
// that don't collide with US place names.
const NON_US_TOKENS = [
  "united kingdom","england","scotland","wales","northern ireland","ireland",
  "canada","germany","france","spain","portugal","italy","netherlands","belgium",
  "luxembourg","sweden","norway","denmark","finland","iceland","switzerland",
  "austria","poland","czech","czechia","slovakia","romania","hungary","bulgaria",
  "greece","croatia","serbia","ukraine","russia","estonia","latvia","lithuania",
  "australia","new zealand","india","singapore","japan","china","hong kong",
  "south korea","taiwan","brazil","mexico","argentina","chile","colombia","peru",
  "uruguay","costa rica","israel","united arab emirates","saudi arabia","qatar",
  "south africa","nigeria","kenya","egypt","morocco","turkey","pakistan",
  "bangladesh","sri lanka","philippines","indonesia","thailand","vietnam","malaysia",
  // regions / continents (excludes "north america", which may include the US)
  "europe","european union","asia","asia pacific","africa","oceania",
  "middle east","south america","central america","caribbean","scandinavia",
  "latin america","southeast asia","sub-saharan",
  // regional acronyms
  "emea","apac","latam","anz","mena","emeaa","benelux","dach","nordics",
  // metros (foreign-only)
  "london","manchester","edinburgh","glasgow","dublin","cork","berlin","munich",
  "hamburg","frankfurt","cologne","paris","lyon","marseille","madrid","barcelona",
  "valencia","lisbon","porto","milan","rome","turin","amsterdam","rotterdam",
  "the hague","brussels","antwerp","zurich","zürich","geneva","vienna","warsaw",
  "krakow","kraków","prague","budapest","bucharest","sofia","athens","stockholm",
  "gothenburg","oslo","copenhagen","helsinki","tallinn","riga","vilnius","sydney",
  "melbourne","brisbane","perth","adelaide","canberra","auckland","wellington",
  "toronto","vancouver","montreal","montréal","ottawa","calgary","edmonton",
  "winnipeg","bangalore","bengaluru","mumbai","new delhi","hyderabad","pune",
  "chennai","kolkata","gurgaon","gurugram","noida","ahmedabad","tokyo","osaka",
  "kyoto","yokohama","shanghai","beijing","shenzhen","guangzhou","hangzhou","seoul",
  "busan","taipei","tel aviv","jerusalem","haifa","dubai","abu dhabi","doha",
  "riyadh","são paulo","sao paulo","rio de janeiro","buenos aires","santiago",
  "bogota","bogotá","lima","mexico city","guadalajara","cape town","johannesburg",
  "pretoria","lagos","nairobi","cairo","casablanca","istanbul","ankara","karachi",
  "lahore","dhaka","colombo","manila","cebu","jakarta","bangkok","hanoi",
  "ho chi minh","kuala lumpur",
  // country codes commonly appended
  "u.k.","uk","gbr","deu","fra","ind","can","aus","nzl","sgp","jpn","chn","bra","zaf",
];

function buildTokenMatcher(tokens: string[]): RegExp {
  const escaped = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length); // longest-first so phrases win
  return new RegExp(`(^|[^a-z])(${escaped.join("|")})([^a-z]|$)`, "i");
}

const US_TOKEN_RE = buildTokenMatcher(US_TOKENS);
const NON_US_TOKEN_RE = buildTokenMatcher(NON_US_TOKENS);

/**
 * Best-effort classification of whether a location is in the United States.
 * Returns `true` (US), `false` (non-US), or `null` (unknown — e.g. a bare
 * "Remote" with no country). Callers decide how to treat `null`; the feed keeps
 * unknowns visible while dropping confirmed non-US roles.
 */
export function isUsLocation(raw: string | null | undefined): boolean | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (!s) return null;

  const hasUs = STATE_CODE_RE.test(raw) || US_TOKEN_RE.test(s);
  const hasNonUs = NON_US_TOKEN_RE.test(s);

  if (hasUs) return true; // a US option present ⇒ within reach for a US search
  if (hasNonUs) return false;
  return null; // e.g. "Remote", "Global", or an unrecognized city
}

// Turns the messy raw ATS location strings ("Hybrid - San Francisco, New York
// City, Austin") into a clean, deduped, sorted list of individual place tokens
// ("Austin", "New York City", "San Francisco") for the location dropdown. The
// feed filter still does a substring match, so any token matches its rows.
export function toLocationOptions(raw: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const value of raw) {
    if (!value) continue;
    // Drop a leading workplace label ("Hybrid - ", "Remote — ", "On-site: ").
    const body = value.replace(
      /^\s*(remote|hybrid|on-?site|in[- ]office)\s*[-–—:]\s*/i,
      "",
    );
    for (const part of body.split(/[,/;]/)) {
      const token = part.trim().replace(/\s+/g, " ");
      if (token && token.length <= 40 && !/^(remote|hybrid|on-?site)$/i.test(token)) {
        set.add(token);
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function detectWorkplaceType(
  raw: string | null | undefined,
): WorkplaceType | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/\bhybrid\b/.test(s)) return "hybrid";
  if (/\bremote\b|work from home|\bwfh\b|distributed|anywhere/.test(s)) {
    return "remote";
  }
  if (/\bon-?site\b|\bin[- ]office\b|\bin person\b/.test(s)) return "onsite";
  // A concrete place with no remote/hybrid marker reads as on-site.
  return s.trim() ? "onsite" : null;
}
