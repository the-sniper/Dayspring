export const SETTINGS_API_KEYS = "Settings → API Keys";

export const keyMessages = {
  anthropic: `Add your Anthropic API key in ${SETTINGS_API_KEYS} to enable.`,
  apollo: `Add your Apollo API key in ${SETTINGS_API_KEYS} to enable.`,
  apolloAndAnthropic: `Add your Apollo and Anthropic API keys in ${SETTINGS_API_KEYS} to enable.`,
  happenstance: `Add your Happenstance API key in ${SETTINGS_API_KEYS} to enable.`,
  apify: `Add your Apify API token in ${SETTINGS_API_KEYS} to pull LinkedIn hiring posts.`,
  contactSearch: `Contact search needs your Apollo API key — add one in ${SETTINGS_API_KEYS}.`,
  contactParse: `Parsing your search needs your Anthropic API key — add one in ${SETTINGS_API_KEYS}.`,
  apolloRejected: `Apollo rejected your API key — check it in ${SETTINGS_API_KEYS}.`,
  aiSearch: `AI search needs your Anthropic API key — add one in ${SETTINGS_API_KEYS}.`,
  drafting: `Drafting needs your Anthropic API key — add one in ${SETTINGS_API_KEYS}.`,
  reach: `Reach needs your Apollo key plus Anthropic or OpenAI — add them in ${SETTINGS_API_KEYS}.`,
  scoring: `Scoring needs your Anthropic API key — add one in ${SETTINGS_API_KEYS}.`,
  research: `Research needs your Anthropic API key — add one in ${SETTINGS_API_KEYS}.`,
  pasteParse: `Paste parsing needs your Anthropic API key — add one in ${SETTINGS_API_KEYS}.`,
  resumeMatch: `Resume Match needs your Anthropic API key — add one in ${SETTINGS_API_KEYS}.`,
  tailoring: `Tailoring needs your Anthropic API key — add one in ${SETTINGS_API_KEYS}.`,
  needsAnthropicShort: `Add your Anthropic API key in ${SETTINGS_API_KEYS}.`,
  needsApolloAnthropicShort: `Add your Apollo and Anthropic API keys in ${SETTINGS_API_KEYS}.`,
  vaultOff:
    "Vault encryption isn't configured on this deployment — saved keys and job-site passwords can't be stored until the host sets DAYSPRING_VAULT_KEY.",
};

export function keyNotSet(name: string): string {
  return `${name} is not set — add it in ${SETTINGS_API_KEYS}.`;
}
