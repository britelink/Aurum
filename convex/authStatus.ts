import { query } from "./_generated/server";

/**
 * Which sign-in methods this deployment can actually complete.
 *
 * The sign-in page used to offer Google unconditionally. On a deployment
 * without `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` the provider throws, the click
 * handler logged the error to the console, and the button simply did nothing —
 * which reads to a visitor as a broken site, not as a missing credential. And
 * because the email form next to it was commented out, that dead button was the
 * *only* way in.
 *
 * So the page asks first. A method that cannot work is not shown, rather than
 * shown and silently failing.
 *
 * Returns booleans only — never the credentials, never a reason. Whether an
 * OAuth client exists is not sensitive; its id is.
 */
export const providers = query({
  args: {},
  handler: async () => {
    const google = Boolean(
      process.env.AUTH_GOOGLE_ID?.trim() &&
        process.env.AUTH_GOOGLE_SECRET?.trim(),
    );
    return {
      /** Always available: Convex Auth's Password provider needs no third party. */
      password: true as const,
      google,
    };
  },
});
