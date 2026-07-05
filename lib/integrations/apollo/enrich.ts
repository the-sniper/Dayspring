import { apolloFetch } from "./client";

type MatchResponse = {
  person?: {
    email?: string | null;
    email_status?: string | null;
  } | null;
};

// CONSUMES AN APOLLO CREDIT per enriched record — only called from the
// explicit "Reveal email" button, never automatically. Work emails only.
export async function enrichPerson({
  apolloId,
}: {
  apolloId: string;
}): Promise<{ email: string | null; emailStatus: string | null }> {
  const data = await apolloFetch<MatchResponse>("people/match", {
    id: apolloId,
    reveal_personal_emails: false,
  });
  const email = data.person?.email ?? null;
  return {
    // Apollo returns a placeholder like email_not_unlocked@… when it can't
    // reveal — treat that as no email.
    email: email && !email.includes("email_not_unlocked") ? email : null,
    emailStatus: data.person?.email_status ?? null,
  };
}
