import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/signin"]);

/**
 * Routes that require an account.
 *
 * `/` is deliberately **not** here, though it used to be. The homepage is the
 * marketing page — the thing that explains what this is and persuades someone
 * to sign up — and gating it bounced every first-time visitor straight to a
 * login form for a product they had not yet seen. `/about` and `/demo` are
 * public for the same reason.
 *
 * `/wallet` is here and previously was not, which was the opposite mistake: it
 * renders a balance and can queue a real payout. It defends itself client-side,
 * but a page that moves money should not rely on its own render path for that —
 * the guard belongs in front of it.
 */
const isProtectedRoute = createRouteMatcher(["/play", "/trade", "/wallet", "/admin"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuthenticated = await convexAuth.isAuthenticated();

  if (isSignInPage(request) && isAuthenticated) {
    return nextjsMiddlewareRedirect(request, "/play");
  }

  if (isProtectedRoute(request) && !isAuthenticated) {
    return nextjsMiddlewareRedirect(request, "/signin");
  }
});

export const config = {
  /*
   * Static assets are excluded so the middleware does not run — and, more to
   * the point, does not call `isAuthenticated()` — once per image on every page
   * load. `/api` is excluded as well: the retired routes answer 410 on their
   * own and nothing there should depend on a cookie.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
