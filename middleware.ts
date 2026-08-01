import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/signin"]);
// The Gmail OAuth callback must stay reachable mid-flow; Convex Auth's own
// /api/auth routes are handled by the middleware itself. Cron routes carry no
// session cookie — they authenticate with CRON_SECRET in the route handler.
const isPublicRoute = createRouteMatcher([
  "/signin",
  "/api/auth(.*)",
  "/api/cron(.*)",
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
