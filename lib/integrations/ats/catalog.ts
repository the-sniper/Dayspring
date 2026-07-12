// Curated cross-industry catalog of company ATS boards to watch. This is the
// breadth engine: startups and mid-size firms overwhelmingly post on the same
// three providers we already support (Greenhouse / Lever / Ashby), so seeding a
// wide slice of their board tokens turns a 3-company feed into a realistic,
// LinkedIn/Tsenta-style stream spanning many industries.
//
// Tokens are the provider board slug (usually the company's short name).
// scripts/seed-catalog.ts upserts these into `companies` idempotently. A wrong
// or stale token simply 404s at pull time and is isolated per-company — it can
// never break a run — so this list favors breadth and is safe to extend.
import type { AtsType, RoleType } from "@/lib/types";

export type CatalogCompany = {
  name: string;
  domain?: string;
  atsType: Exclude<AtsType, "workday">;
  atsSlug: string;
  industry: string;
  // Optional hint; left undefined for most so role typing stays data-driven.
  roleTypes?: RoleType[];
};

// Grouped by industry for maintainability; exported flat below. Board tokens
// were verified live against each provider's public API. Companies on Workday
// / iCIMS / custom ATSes (Chewy, Wayfair, Zillow, DigitalOcean, etc.) are
// intentionally omitted — add those via the Companies UI with Workday fields.
const GROUPS: Record<string, CatalogCompany[]> = {
  "Developer Tools & Infrastructure": [
    { name: "Vercel", domain: "vercel.com", atsType: "greenhouse", atsSlug: "vercel", industry: "Developer Tools & Infrastructure" },
    { name: "GitLab", domain: "gitlab.com", atsType: "greenhouse", atsSlug: "gitlab", industry: "Developer Tools & Infrastructure" },
    { name: "Cloudflare", domain: "cloudflare.com", atsType: "greenhouse", atsSlug: "cloudflare", industry: "Developer Tools & Infrastructure" },
    { name: "Elastic", domain: "elastic.co", atsType: "greenhouse", atsSlug: "elastic", industry: "Developer Tools & Infrastructure" },
    { name: "Datadog", domain: "datadoghq.com", atsType: "greenhouse", atsSlug: "datadog", industry: "Developer Tools & Infrastructure" },
    { name: "MongoDB", domain: "mongodb.com", atsType: "greenhouse", atsSlug: "mongodb", industry: "Developer Tools & Infrastructure" },
    { name: "Postman", domain: "postman.com", atsType: "greenhouse", atsSlug: "postman", industry: "Developer Tools & Infrastructure" },
    { name: "Airbyte", domain: "airbyte.com", atsType: "ashby", atsSlug: "airbyte", industry: "Developer Tools & Infrastructure" },
    { name: "PostHog", domain: "posthog.com", atsType: "ashby", atsSlug: "posthog", industry: "Developer Tools & Infrastructure" },
    { name: "Linear", domain: "linear.app", atsType: "ashby", atsSlug: "linear", industry: "Developer Tools & Infrastructure" },
    { name: "Sourcegraph", domain: "sourcegraph.com", atsType: "greenhouse", atsSlug: "sourcegraph91", industry: "Developer Tools & Infrastructure" },
    { name: "Render", domain: "render.com", atsType: "ashby", atsSlug: "render", industry: "Developer Tools & Infrastructure" },
    { name: "Supabase", domain: "supabase.com", atsType: "ashby", atsSlug: "supabase", industry: "Developer Tools & Infrastructure" },
  ],
  "Artificial Intelligence": [
    { name: "OpenAI", domain: "openai.com", atsType: "greenhouse", atsSlug: "openai", industry: "Artificial Intelligence" },
    { name: "Anthropic", domain: "anthropic.com", atsType: "greenhouse", atsSlug: "anthropic", industry: "Artificial Intelligence" },
    { name: "Mistral", domain: "mistral.ai", atsType: "lever", atsSlug: "mistral", industry: "Artificial Intelligence" },
    { name: "Scale AI", domain: "scale.com", atsType: "greenhouse", atsSlug: "scaleai", industry: "Artificial Intelligence" },
    { name: "Runway", domain: "runwayml.com", atsType: "ashby", atsSlug: "runway", industry: "Artificial Intelligence" },
    { name: "Cohere", domain: "cohere.com", atsType: "lever", atsSlug: "cohere", industry: "Artificial Intelligence" },
    { name: "Perplexity", domain: "perplexity.ai", atsType: "ashby", atsSlug: "perplexity", industry: "Artificial Intelligence" },
    { name: "Databricks", domain: "databricks.com", atsType: "greenhouse", atsSlug: "databricks", industry: "Artificial Intelligence" },
  ],
  "SaaS & Enterprise Software": [
    { name: "Asana", domain: "asana.com", atsType: "greenhouse", atsSlug: "asana", industry: "SaaS & Enterprise Software" },
    { name: "Notion", domain: "notion.so", atsType: "greenhouse", atsSlug: "notion", industry: "SaaS & Enterprise Software" },
    { name: "Airtable", domain: "airtable.com", atsType: "greenhouse", atsSlug: "airtable", industry: "SaaS & Enterprise Software" },
    { name: "Calendly", domain: "calendly.com", atsType: "greenhouse", atsSlug: "calendly", industry: "SaaS & Enterprise Software" },
    { name: "Gong", domain: "gong.io", atsType: "greenhouse", atsSlug: "gongio", industry: "SaaS & Enterprise Software" },
    { name: "Twilio", domain: "twilio.com", atsType: "greenhouse", atsSlug: "twilio", industry: "SaaS & Enterprise Software" },
    { name: "Lattice", domain: "lattice.com", atsType: "greenhouse", atsSlug: "lattice", industry: "SaaS & Enterprise Software" },
    { name: "Vanta", domain: "vanta.com", atsType: "ashby", atsSlug: "vanta", industry: "SaaS & Enterprise Software" },
    { name: "Ramp", domain: "ramp.com", atsType: "ashby", atsSlug: "ramp", industry: "SaaS & Enterprise Software" },
    { name: "Deel", domain: "deel.com", atsType: "ashby", atsSlug: "deel", industry: "SaaS & Enterprise Software" },
    { name: "Zapier", domain: "zapier.com", atsType: "ashby", atsSlug: "zapier", industry: "SaaS & Enterprise Software" },
    { name: "Verkada", domain: "verkada.com", atsType: "greenhouse", atsSlug: "verkada", industry: "SaaS & Enterprise Software" },
    { name: "Samsara", domain: "samsara.com", atsType: "greenhouse", atsSlug: "samsara", industry: "SaaS & Enterprise Software" },
  ],
  "Fintech": [
    { name: "Stripe", domain: "stripe.com", atsType: "greenhouse", atsSlug: "stripe", industry: "Fintech" },
    { name: "Robinhood", domain: "robinhood.com", atsType: "greenhouse", atsSlug: "robinhood", industry: "Fintech" },
    { name: "Coinbase", domain: "coinbase.com", atsType: "greenhouse", atsSlug: "coinbase", industry: "Fintech" },
    { name: "Brex", domain: "brex.com", atsType: "greenhouse", atsSlug: "brex", industry: "Fintech" },
    { name: "Plaid", domain: "plaid.com", atsType: "lever", atsSlug: "plaid", industry: "Fintech" },
    { name: "Affirm", domain: "affirm.com", atsType: "greenhouse", atsSlug: "affirm", industry: "Fintech" },
    { name: "Chime", domain: "chime.com", atsType: "greenhouse", atsSlug: "chime", industry: "Fintech" },
    { name: "SoFi", domain: "sofi.com", atsType: "greenhouse", atsSlug: "sofi", industry: "Fintech" },
    { name: "Gusto", domain: "gusto.com", atsType: "greenhouse", atsSlug: "gusto", industry: "Fintech" },
    { name: "Marqeta", domain: "marqeta.com", atsType: "greenhouse", atsSlug: "marqeta", industry: "Fintech" },
    { name: "Mercury", domain: "mercury.com", atsType: "greenhouse", atsSlug: "mercury", industry: "Fintech" },
    { name: "Betterment", domain: "betterment.com", atsType: "greenhouse", atsSlug: "betterment", industry: "Fintech" },
    { name: "Nubank", domain: "nubank.com.br", atsType: "greenhouse", atsSlug: "nubank", industry: "Fintech" },
  ],
  "Commerce & Retail": [
    { name: "DoorDash", domain: "doordash.com", atsType: "greenhouse", atsSlug: "doordashusa", industry: "Commerce & Retail" },
    { name: "Instacart", domain: "instacart.com", atsType: "greenhouse", atsSlug: "instacart", industry: "Commerce & Retail" },
    { name: "Faire", domain: "faire.com", atsType: "greenhouse", atsSlug: "faire", industry: "Commerce & Retail" },
    { name: "Gopuff", domain: "gopuff.com", atsType: "lever", atsSlug: "gopuff", industry: "Commerce & Retail" },
    { name: "Sweetgreen", domain: "sweetgreen.com", atsType: "greenhouse", atsSlug: "sweetgreen", industry: "Commerce & Retail" },
    { name: "Toast", domain: "toasttab.com", atsType: "greenhouse", atsSlug: "toast", industry: "Commerce & Retail" },
  ],
  "Consumer & Social": [
    { name: "Pinterest", domain: "pinterest.com", atsType: "greenhouse", atsSlug: "pinterest", industry: "Consumer & Social" },
    { name: "Lyft", domain: "lyft.com", atsType: "greenhouse", atsSlug: "lyft", industry: "Consumer & Social" },
    { name: "Reddit", domain: "reddit.com", atsType: "greenhouse", atsSlug: "reddit", industry: "Consumer & Social" },
    { name: "Discord", domain: "discord.com", atsType: "greenhouse", atsSlug: "discord", industry: "Consumer & Social" },
    { name: "Airbnb", domain: "airbnb.com", atsType: "greenhouse", atsSlug: "airbnb", industry: "Consumer & Social" },
    { name: "Dropbox", domain: "dropbox.com", atsType: "greenhouse", atsSlug: "dropbox", industry: "Consumer & Social" },
    { name: "SeatGeek", domain: "seatgeek.com", atsType: "greenhouse", atsSlug: "seatgeek", industry: "Consumer & Social" },
    { name: "Eventbrite", domain: "eventbrite.com", atsType: "greenhouse", atsSlug: "eventbriteinc", industry: "Consumer & Social" },
    { name: "Peloton", domain: "onepeloton.com", atsType: "greenhouse", atsSlug: "peloton", industry: "Consumer & Social" },
    { name: "Calm", domain: "calm.com", atsType: "greenhouse", atsSlug: "calm", industry: "Consumer & Social" },
  ],
  "Healthcare & Biotech": [
    { name: "Ro", domain: "ro.co", atsType: "lever", atsSlug: "ro", industry: "Healthcare & Biotech" },
    { name: "Oscar Health", domain: "hioscar.com", atsType: "greenhouse", atsSlug: "oscar", industry: "Healthcare & Biotech" },
    { name: "Cedar", domain: "cedar.com", atsType: "ashby", atsSlug: "cedar", industry: "Healthcare & Biotech" },
    { name: "Cityblock Health", domain: "cityblock.com", atsType: "ashby", atsSlug: "cityblock", industry: "Healthcare & Biotech" },
    { name: "Benchling", domain: "benchling.com", atsType: "ashby", atsSlug: "benchling", industry: "Healthcare & Biotech" },
    { name: "Ginkgo Bioworks", domain: "ginkgobioworks.com", atsType: "greenhouse", atsSlug: "ginkgobioworks", industry: "Healthcare & Biotech" },
    { name: "Recursion", domain: "recursion.com", atsType: "greenhouse", atsSlug: "recursionpharmaceuticals", industry: "Healthcare & Biotech" },
  ],
  "Mobility, Logistics & Hardware": [
    { name: "Flexport", domain: "flexport.com", atsType: "greenhouse", atsSlug: "flexport", industry: "Mobility, Logistics & Hardware" },
    { name: "Nuro", domain: "nuro.ai", atsType: "greenhouse", atsSlug: "nuro", industry: "Mobility, Logistics & Hardware" },
    { name: "Anduril", domain: "anduril.com", atsType: "greenhouse", atsSlug: "andurilindustries", industry: "Mobility, Logistics & Hardware" },
    { name: "Motive", domain: "gomotive.com", atsType: "greenhouse", atsSlug: "motive", industry: "Mobility, Logistics & Hardware" },
  ],
  "Media & Gaming": [
    { name: "Roblox", domain: "roblox.com", atsType: "greenhouse", atsSlug: "roblox", industry: "Media & Gaming" },
    { name: "Riot Games", domain: "riotgames.com", atsType: "greenhouse", atsSlug: "riotgames", industry: "Media & Gaming" },
    { name: "Netflix", domain: "netflix.com", atsType: "lever", atsSlug: "netflix", industry: "Media & Gaming" },
    { name: "Squarespace", domain: "squarespace.com", atsType: "greenhouse", atsSlug: "squarespace", industry: "Media & Gaming" },
  ],
  "Climate & Energy": [
    { name: "Watershed", domain: "watershed.com", atsType: "ashby", atsSlug: "watershed", industry: "Climate & Energy" },
    { name: "Arcadia", domain: "arcadia.com", atsType: "lever", atsSlug: "arcadia", industry: "Climate & Energy" },
    { name: "Form Energy", domain: "formenergy.com", atsType: "ashby", atsSlug: "formenergy", industry: "Climate & Energy" },
  ],
};

// Flat, deduped-by-(atsType, atsSlug) catalog consumed by the seed script.
export const COMPANY_CATALOG: CatalogCompany[] = (() => {
  const seen = new Set<string>();
  const flat: CatalogCompany[] = [];
  for (const list of Object.values(GROUPS)) {
    for (const c of list) {
      const key = `${c.atsType}:${c.atsSlug.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flat.push(c);
    }
  }
  return flat;
})();

export const CATALOG_INDUSTRIES = Object.keys(GROUPS);
