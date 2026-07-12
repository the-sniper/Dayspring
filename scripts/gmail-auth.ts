// One-time Gmail OAuth: loopback flow for a Desktop-app client.
// Usage: npm run gmail:auth
export {}; // module scope

const PORT = 8765;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

async function main() {
  const { loadLocalEnv } = await import("../lib/env");
  loadLocalEnv();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local.\n" +
        "Google Cloud Console → enable Gmail API → OAuth consent screen\n" +
        "(External, testing mode, add yourself as test user) → create a\n" +
        "'Desktop app' OAuth client → paste both values into .env.local.",
    );
    process.exit(1);
  }

  const { buildConsentUrl, exchangeCode } = await import(
    "../lib/integrations/gmail/oauth"
  );
  const { createServer } = await import("node:http");
  const { exec } = await import("node:child_process");

  const consentUrl = buildConsentUrl(clientId, REDIRECT_URI);
  console.log("\nOpen this URL to authorize Dayspring (opening browser…):\n");
  console.log(consentUrl + "\n");
  exec(`open "${consentUrl}"`); // macOS; harmless no-op elsewhere

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<body style="font-family:sans-serif;padding:2rem">${
          err ? `Authorization failed: ${err}` : "Dayspring is connected — you can close this tab."
        }</body>`,
      );
      server.close();
      if (err || !code) reject(new Error(err ?? "no code returned"));
      else resolve(code);
    });
    server.listen(PORT, "127.0.0.1");
    // Don't hang forever if the user abandons the consent screen.
    setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for authorization (5 min)."));
    }, 300_000).unref();
  });

  const tokens = await exchangeCode({
    clientId,
    clientSecret,
    code,
    redirectUri: REDIRECT_URI,
  });
  if (!tokens.refreshToken) {
    throw new Error(
      "Google returned no refresh token. Remove Dayspring's access at " +
        "myaccount.google.com/permissions and run this again.",
    );
  }

  // Who did we just connect? (direct call — settings row not written yet)
  const profileRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: { authorization: `Bearer ${tokens.accessToken}` } },
  );
  const profile = (await profileRes.json()) as { emailAddress?: string };

  const { setSetting } = await import("../lib/settings/store");
  setSetting("gmailRefreshToken", tokens.refreshToken);
  setSetting("gmailEmail", profile.emailAddress ?? "");

  console.log(`\nConnected as ${profile.emailAddress} ✓`);
  console.log("Gmail send + reply detection + emailed digest are now live.");
}

main().catch((err) => {
  console.error("gmail:auth failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
