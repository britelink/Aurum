import { internalAction } from "./_generated/server";
import { api } from "./_generated/api";

export const manageSession = internalAction({
  handler: async (ctx) => {
    const now = Date.now();
    let currentSession = await ctx.runQuery(api.session.getCurrentSession);

    if (currentSession) {
      if (currentSession.status === "open" && now > currentSession.endTime) {
        // Move to processing phase
        await ctx.runMutation(api.session.updateSessionStatus, {
          sessionId: currentSession._id,
          status: "processing",
        });
      } else if (
        currentSession.status === "processing" &&
        now > currentSession.processingEndTime
      ) {
        // Process results and close session
        await ctx.runAction(api.session.processResults, {
          sessionId: currentSession._id,
          finalPrice: Math.random() * 100,
        });

        // Explicitly close the session after processing
        await ctx.runMutation(api.session.updateSessionStatus, {
          sessionId: currentSession._id,
          status: "closed",
        });
      } else if (
        currentSession.status === "closed" &&
        now > currentSession.processingEndTime
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
