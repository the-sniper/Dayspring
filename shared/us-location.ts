// Is this hiring post about US openings?
//
// The LinkedIn post source is keyword search, so it pulls in every "we're
// hiring" post on earth. A large share are offshore staffing posts listing
// fifteen roles across engineering, sales, marketing and HR with the location
// given as a bare "Remote" — which, for a US-based job seeker, is pure noise.
//
// This module is the deterministic half of the filter. The model (see
// lib/linkedin/extract.ts) makes the real judgment about whether the OPENINGS
// are in the US; this provides two things the model can't be trusted for on its
// own at cheap-tier: an unambiguous affirmative when it missed one, and a veto
// when the post is plainly somewhere else.
//
// Pure and dependency-free so it can be unit-checked without the app.

export type UsVerdict = "us" | "non_us" | "unknown";

// Full state names. Two-letter codes are handled separately because they are
// far too collision-prone bare ("IN" is India and Indiana, "DE" is Delaware and
// Germany, "OR" is Oregon and the English word).
const US_STATES =
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming";

// Only ever matched as ", XX" — i.e. the "Austin, TX" shape. A bare "CA" in
// prose is not evidence of anything.
const STATE_CODE_RX =
  /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;

const US_CITIES =
  "new york city|nyc|san francisco|bay area|silicon valley|los angeles|seattle|boston|chicago|austin|denver|atlanta|philadelphia|philly|san diego|san jose|dallas|houston|miami|portland|phoenix|minneapolis|pittsburgh|nashville|charlotte|raleigh|salt lake city|washington d\\.?c\\.?|palo alto|mountain view|menlo park|sunnyvale|cupertino|redmond|bellevue|brooklyn|manhattan";

const US_RULES: RegExp[] = [
  /\b(united states|u\.?s\.?a\.?)\b/i,
  // "US" as its own token, plus the phrasings that carry it.
  /\b(us|u\.s\.)[-\s](based|only|remote|citizens?|residents?|eastern|west coast|east coast)\b/i,
  /\b(remote|hybrid|onsite|on-site)\b[^.\n]{0,20}\(?\s*(us|u\.s\.|usa|united states)\s*\)?/i,
  /\bin the (us|u\.s\.|usa|united states)\b/i,
  /\bauthoriz(?:ed|ation) to work in the (us|u\.s\.|usa|united states)\b/i,
  /\b(h-?1b|opt|cpt|green card|tn visa|ead)\b/i,
  /\b(est|edt|pst|pdt|cst|cdt|mst|mdt)\b(?:\s*(?:time ?zone|hours|overlap))?/i,
  new RegExp(`\\b(${US_STATES})\\b`, "i"),
  new RegExp(`\\b(${US_CITIES})\\b`, "i"),
  STATE_CODE_RX,
];

// Places and idioms that mark a post as somewhere other than the US. The
// recruiting idioms matter as much as the place names: "immediate joiners",
// "notice period" as a screening question, "CTC" and "LPA" are near-universal
// in Indian job posts and near-absent from US ones.
const NON_US_RULES: RegExp[] = [
  /\b(india|bangalore|bengaluru|hyderabad|pune|noida|gurgaon|gurugram|chennai|mumbai|kolkata|ahmedabad|delhi|ncr|kochi|coimbatore|indore|jaipur)\b/i,
  /\b(united kingdom|london|manchester|birmingham|edinburgh|glasgow|leeds|bristol)\b/i,
  /\b(canada|toronto|vancouver|montreal|ottawa|calgary)\b/i,
  /\b(australia|sydney|melbourne|brisbane|perth)\b/i,
  /\b(singapore|hong kong|japan|tokyo|korea|seoul|shanghai|beijing|shenzhen)\b/i,
  /\b(dubai|abu dhabi|uae|united arab emirates|saudi|riyadh|qatar|doha)\b/i,
  /\b(germany|berlin|munich|france|paris|spain|madrid|barcelona|netherlands|amsterdam|ireland|dublin|poland|warsaw|krakow|portugal|lisbon|sweden|stockholm|switzerland|zurich)\b/i,
  /\b(pakistan|lahore|karachi|islamabad|bangladesh|dhaka|sri lanka|colombo|nepal|kathmandu)\b/i,
  /\b(philippines|manila|cebu|vietnam|hanoi|ho chi minh|indonesia|jakarta|malaysia|kuala lumpur|thailand|bangkok)\b/i,
  /\b(nigeria|lagos|kenya|nairobi|south africa|johannesburg|cape town|egypt|cairo|ghana|accra)\b/i,
  /\b(brazil|sao paulo|são paulo|argentina|buenos aires|colombia|bogota|bogotá|chile|santiago|peru|lima|mexico city|guadalajara)\b/i,
  /\b(emea|apac|latam|anz)\b/i,
  // Currency and comp idioms.
  /[₹£€]/,
  /\b(lpa|ctc|inr|gbp|eur|aed|sgd|cad|aud)\b/i,
  /\b(lakhs?|crores?)\b/i,
  // Recruiting idioms that are essentially never used in US postings.
  /\bimmediate joiner|\bnotice period\b|\bwfo\b|\bfresher/i,
  /\b(work from office|relieving letter|aadhaar|pan card)\b/i,
];

const anyMatch = (rules: RegExp[], text: string) => rules.some((rx) => rx.test(text));

// Location string is weighted the same as body text — a post whose location
// field says "Bengaluru" and whose body says "United States" is genuinely
// mixed, and mixed resolves to "us" below (it does mention US openings).
export function usLocationVerdict(
  text: string | null | undefined,
  location?: string | null,
): UsVerdict {
  const haystack = `${location ?? ""}\n${text ?? ""}`.trim();
  if (!haystack) return "unknown";
  const us = anyMatch(US_RULES, haystack);
  const nonUs = anyMatch(NON_US_RULES, haystack);
  // A post that names both is hiring in multiple regions, and one of them is
  // the US — that qualifies. Only an exclusively non-US post is vetoed.
  if (us) return "us";
  if (nonUs) return "non_us";
  // The important default: a bare "Remote" with no country anywhere is NOT
  // treated as US. Requiring an affirmative signal is the whole point.
  return "unknown";
}

// Final call, combining the model's judgment with the deterministic verdict.
//   - a plainly non-US post is excluded even if the model said otherwise
//   - either source can supply the affirmative
//   - no signal at all means excluded, not included
export function isUsOpening(
  modelSaysUs: boolean | null | undefined,
  verdict: UsVerdict,
): boolean {
  if (verdict === "non_us") return false;
  return modelSaysUs === true || verdict === "us";
}
