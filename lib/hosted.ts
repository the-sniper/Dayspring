// Are we running on a hosted/serverless deployment (Vercel etc.) rather than
// someone's own machine? Machine-bound features (apply-assist's headed
// browser, the launchd daily agent) are gated off when hosted.
export function isHosted(): boolean {
  return !!process.env.VERCEL || process.env.DAYSPRING_HOSTED === "1";
}
