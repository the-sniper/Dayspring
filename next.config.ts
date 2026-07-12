import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright ships its own browser launcher and is used by the resume-PDF
  // renderer inside server actions — keep it out of the bundle.
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
