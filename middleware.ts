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
   * Static assets only.
   *
   * `/api` was excluded here for one commit, on the reasoning that the retired
   * routes answer 410 on their own and nothing under `/api` should depend on a
   * cookie. That is true of every route there except the one that matters:
   * `convexAuthNextjsMiddleware` *is* the handler for `POST /api/auth`, the
   * endpoint the browser calls to begin the OAuth handshake. Skipping the
   * middleware there meant the POST fell through to Next's router, returned an
   * empty 200, and Google sign-in failed with nothing in the Convex logs —
   * because the request never reached Convex at all.
   *
   * So: exclude assets, and nothing else.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
