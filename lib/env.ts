import fs from "node:fs";
import path from "node:path";

// Minimal .env.local loader for CLI scripts (`scripts/*.ts`). Next.js loads
// .env.local itself — never call this from app code. Call before importing any
// module that reads env at load time (Convex URL, settings path) so the values
// are honored (use dynamic import in scripts).
export function loadLocalEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(["'])(.*)\1$/, "$2");
  }
}
