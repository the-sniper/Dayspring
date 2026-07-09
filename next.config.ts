import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — it must be required at runtime,
  // never bundled by webpack/turbopack. playwright ships its own browser
  // launcher and is used by the resume-PDF renderer inside server actions.
  serverExternalPackages: ["better-sqlite3", "playwright"],
};

export default nextConfig;
