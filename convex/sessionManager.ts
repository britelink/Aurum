import { internalAction } from "./_generated/server";
import { api } from "./_generated/api";

export const manageSession = internalAction({
  handler: async (ctx) => {
    const now = Date.now();
    let currentSession = await ctx.runQuery(api.session.getCurrentSession);

    if (currentSession) {
      // Check if session exists and get its full data
      const fullSession = await ctx.runQuery(api.session.getSessionById, {
        sessionId: currentSession._id,
      });

      if (!fullSession) return;

      if (fullSession.status === "open" && now > fullSession.endTime) {
        // Move to processing phase
        await ctx.runMutation(api.session.updateSessionStatus, {
          sessionId: fullSession._id,
          status: "processing",
        });
      } else if (
        fullSession.status === "processing" &&
        now > fullSession.processingEndTime
      ) {
        // Process results and close session
        await ctx.runAction(api.session.processResults, {
          sessionId: fullSession._id,
          finalPrice: Math.random() * 100,
        });
      } else if (
        fullSession.status === "closed" &&
        now > fullSession.processingEndTime
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
