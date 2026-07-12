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

// Full US state names (plus DC). Shared by US detection and the city filter,
// which drops bare state names from the location dropdown.
const STATE_NAMES = [
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas",
  "kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota",
  "mississippi","missouri","montana","nebraska","nevada","new hampshire",
  "new jersey","new mexico","new york","north carolina","north dakota","ohio",
  "oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota",
  "tennessee","texas","utah","vermont","virginia","west virginia",
  "wisconsin","wyoming","district of columbia",
];

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

// Street-address suffixes: a token ending in one of these is a street line
// ("1007 South Congress Ave", "110 Albany Turnpike"), not a city.
const STREET_SUFFIX_RE =
  /\b(st|street|ave|avenue|blvd|boulevard|rd|road|way|dr|drive|ln|lane|ct|court|pl|place|pkwy|parkway|hwy|highway|sq|square|ste|suite|fl|floor|fwy|freeway|loop|trail|trl|terrace|ter|circle|cir|turnpike|tpke|plaza|plz|expressway|expy|route|rte|crossing|xing|walk|row|alley|path|pike|mall)\.?$/i;

// Case-insensitive so Title-case codes ("Ca", "Tx") are caught too.
const STATE_CODE_ONLY_RE = new RegExp(`^(${US_STATE_CODES})$`, "i");
const STATE_NAME_SET = new Set(STATE_NAMES);
// Building/suite/unit fragments that ride along in an address ("Suite 111").
const UNIT_PREFIX_RE = /^(suite|ste|space|unit|apt|apartment|bldg|building|floor|room|lobby|mailstop|ms)\b/i;

// Country / region / catch-all tokens that are never a city, plus common
// placeholder junk ("N/A", "HQ", "Add ALL locations here") that shows up in
// real ATS postings.
const NON_CITY_TOKENS = new Set([
  "us","u.s.","u.s.a","usa","united states","us based","us-based","america",
  "north america","uk","u.k.","gb","eu","europe","emea","apac","latam","anz",
  "mena","benelux","dach","nordics","asia","asia pacific","africa","oceania",
  "middle east","south america","central america","latin america","global",
  "worldwide","anywhere","various","various locations","multiple locations",
  "remote","hybrid","on-site","onsite",
  // placeholder / junk values
  "n/a","na","n.a.","tbd","tba","hq","headquarters","unknown","none","null",
  "confidential","add all locations here","other","various us locations","chi",
  "location","namer","apjc","greater china","bay area","tri-state area",
  // Canadian provinces / territories (regions, not cities)
  "alberta","ontario","quebec","québec","british columbia","manitoba",
  "saskatchewan","nova scotia","new brunswick","newfoundland and labrador",
  "prince edward island","yukon","nunavut","northwest territories",
]);

// A comma-split token is a "city" if it isn't a street line, ZIP, bare state
// code/name, county, a country/region label, an acronym, or placeholder junk.
// Deliberately permissive otherwise so unrecognized (incl. international) city
// names still surface.
function isCityLike(token: string): boolean {
  if (!token || token.length < 2 || token.length > 40) return false;
  // Real city names are Title/mixed case; an absence of any lowercase letter
  // means an acronym or placeholder ("SF", "NYC", "NAMER", "LOCATION", "D.C").
  if (!/[a-z]/.test(token)) return false;
  const lower = token.toLowerCase();
  if (NON_CITY_TOKENS.has(lower)) return false;
  // Any digit ⇒ street number, ZIP, suite, or office code — not a city name.
  if (/\d/.test(token)) return false;
  if (STATE_CODE_ONLY_RE.test(token)) return false; // "CA", "Ca", "NY"
  if (STATE_NAME_SET.has(lower)) return false;
  if (UNIT_PREFIX_RE.test(token) || token.startsWith("#")) return false;
  if (/\bcounty\b/i.test(token)) return false;
  if (STREET_SUFFIX_RE.test(token)) return false;
  return true;
}

// Turns the messy raw ATS location strings ("Hybrid - San Francisco, New York
// City, Austin" or "1007 South Congress Ave, Austin, TX 78704") into a clean,
// deduped, sorted list of city names for the location dropdown — street lines,
// ZIPs, states, and counties are dropped. The feed filter still does a
// substring match, so any city token matches its rows.
export function toLocationOptions(raw: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const value of raw) {
    if (!value) continue;
    // Drop a leading workplace label ("Hybrid - ", "Remote — ", "On-site: ").
    const body = value.replace(
      /^\s*(remote|hybrid|on-?site|in[- ]office)\s*[-–—:]\s*/i,
      "",
    );
    // Split on separators + " - " office labels ("San Francisco - SF9"), but
    // not intra-word hyphens ("Winston-Salem"), which have no surrounding space.
    for (const part of body.split(/[,/;]|\s[-–—]\s/)) {
      const token = part.trim().replace(/\s+/g, " ");
      if (isCityLike(token)) set.add(token);
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
