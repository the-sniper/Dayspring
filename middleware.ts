import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/signin"]);
// The Gmail OAuth callback must stay reachable mid-flow; Convex Auth's own
// /api/auth routes are handled by the middleware itself. Cron routes carry no
// session cookie — they authenticate with CRON_SECRET in the route handler.
//
// /api/apply/agent is the same deal for the MCP apply loop: the MCP server is a
// separate process with no cookie, so the route checks DAYSPRING_AGENT_SECRET
// itself and 404s when that secret isn't set. "Public" here means "not behind
// the cookie", not "unauthenticated".
const isPublicRoute = createRouteMatcher([
  "/signin",
  "/api/auth(.*)",
  "/api/cron(.*)",
  "/api/apply/agent(.*)",
]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const authed = await convexAuth.isAuthenticated();
    if (isSignInPage(request) && authed) {
      return nextjsMiddlewareRedirect(request, "/");
    }
    if (!isPublicRoute(request) && !authed) {
      return nextjsMiddlewareRedirect(request, "/signin");
    }
  },
  { cookieConfig: { maxAge: 60 * 60 * 24 * 30 } },
);

export const config = {
  // Run on everything except static files and Next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
