import path from "node:path";

// Where generated resume PDFs live (gitignored, not under public/).
// PDF rendering itself moved to lib/resumes/pdf.ts (@react-pdf/renderer) —
// the old Playwright/Chromium HTML pipeline is gone.
export const RESUMES_DIR = path.join(process.cwd(), "data", "resumes");
