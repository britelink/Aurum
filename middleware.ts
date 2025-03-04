import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/signin"]);
const isProtectedRoute = createRouteMatcher(["/", "/server"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuthenticated = await convexAuth.isAuthenticated();
  console.log("Middleware - isAuthenticated:", isAuthenticated);
  console.log("Middleware - current path:", request.nextUrl.pathname);

  if (isSignInPage(request) && isAuthenticated) {
    console.log("User is authenticated but on signin page - redirecting to /");
    return nextjsMiddlewareRedirect(request, "/");
  }

  if (isProtectedRoute(request) && !isAuthenticated) {
    console.log(
      "User is not authenticated on protected route - redirecting to /signin",
    );
    return nextjsMiddlewareRedirect(request, "/signin");
  }

  console.log("Middleware - allowing request to proceed");
});

export const config = {
  // The following matcher runs middleware on all routes
  // except static assets.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
