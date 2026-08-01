// Hosts that host job postings but are never the employer domain.

const JOB_BOARD_HOST_RE =
  /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|linkedin\.com|indeed\.com|glassdoor\.com|wellfound\.com|angel\.co|algora\.io|otta\.com|levels\.fyi|hired\.com|dice\.com|ziprecruiter\.com|simplyhired\.com|monster\.com|careerbuilder\.com|applytojob\.com|jobvite\.com|smartrecruiters\.com|breezy\.hr|recruitee\.com|gem\.com|workable\.com|dover\.io|ashby\.com|jobs\.ashbyhq\.com)(\.|$)/i;

const JOB_BOARD_PATH_HINT =
  /\/(jobs?|careers?|positions?|openings?|postings?)(\/|$)/i;

export function isJobBoardHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  if (!h) return false;
  if (JOB_BOARD_HOST_RE.test(h)) return true;
  // Generic ATS-style hosts: boards.*, jobs.*, careers.*
  if (/^(boards|jobs|careers|apply)\./i.test(h)) return true;
  return false;
}

export function isJobBoardUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (isJobBoardHost(u.hostname)) return true;
    // Company sites sometimes host careers; path alone isn't enough to reject
    // a domain extracted from page content — only reject the URL host itself
    // when the host is a known board OR the site is clearly a multi-tenant
    // job marketplace (path like /company-slug/job/id).
    if (
      JOB_BOARD_PATH_HINT.test(u.pathname) &&
      /\/[a-z0-9-]+\/job\//i.test(u.pathname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function cleanEmployerDomain(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? d;
  if (!d.includes(".") || /\s/.test(d)) return null;
  if (isJobBoardHost(d)) return null;
  return d;
}
