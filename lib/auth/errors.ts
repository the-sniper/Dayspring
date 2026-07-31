type AuthStep = "signIn" | "signUp";

// Convex Auth throws internal codes (InvalidSecret, etc.) that must never reach
// the UI verbatim — map them to short, user-safe copy.
export function formatAuthError(err: unknown, step: AuthStep): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";

  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  const code =
    firstLine.match(/Uncaught Error: (\S+)/)?.[1] ??
    firstLine.match(/Error: (\S+)/)?.[1] ??
    firstLine;

  const messages: Record<string, string> = {
    InvalidSecret: "Incorrect email or password.",
    InvalidAccountId: "Incorrect email or password.",
    InvalidCredentials: "Incorrect email or password.",
    "Invalid credentials": "Incorrect email or password.",
    TooManyFailedAttempts:
      "Too many failed sign-in attempts. Wait a few minutes and try again.",
  };

  if (messages[code]) return messages[code];
  if (messages[firstLine]) return messages[firstLine];

  if (/already exists/i.test(raw)) {
    return "An account with that email already exists — sign in instead.";
  }
  if (/missing.*password/i.test(raw)) {
    return "Enter your password.";
  }
  if (/AUTH_GOOGLE|oauth|google/i.test(raw)) {
    return "Google sign-in isn't available right now. Try email and password.";
  }

  return step === "signUp"
    ? "Couldn't create your account. Try a different email or sign in instead."
    : "Couldn't sign in. Check your email and password.";
}
