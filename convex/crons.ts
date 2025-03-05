import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// This will be our main session manager that runs every second
crons.interval(
  "session-manager",
  { seconds: 1 },
  internal.sessionManager.manageSession,
  {},
);

export default crons;
