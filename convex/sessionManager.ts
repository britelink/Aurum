import { internalAction } from "./_generated/server";
import { api } from "./_generated/api";

const BETTING_PERIOD = 5000;
const PROCESSING_PERIOD = 10000;

export const manageSession = internalAction({
  handler: async (ctx) => {
    const now = Date.now();
    let currentSession = await ctx.runQuery(api.session.getCurrentSession);

    if (currentSession) {
      if (currentSession.status === "open" && now > currentSession.endTime) {
        // Close session and process results
        await ctx.runMutation(api.session.closeSession, {
          sessionId: currentSession._id,
        });

        await ctx.runAction(api.session.processResults, {
          sessionId: currentSession._id,
          finalPrice: Math.random() * 100,
        });
      } else if (
        currentSession.status === "closed" &&
        now > currentSession.startTime + BETTING_PERIOD + PROCESSING_PERIOD
      ) {
        // Create new session
        await ctx.runMutation(api.session.createSession);
      }
    } else {
      // Create first session
      await ctx.runMutation(api.session.createSession);
    }
  },
});
