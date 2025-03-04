import { mutation, query, action, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await ctx.auth.getUserIdentity();
  if (!userId) return null;

  const user = await ctx.db.get(userId.subject as Id<"users">);
  return { userId: userId.subject, user };
};
