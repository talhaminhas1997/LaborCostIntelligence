import { buildPortfolio } from "./engine";
import type { Job, Learning } from "./types";

/**
 * Cost Agent runs on this seeded, deterministic portfolio. The engine turns
 * raw cost-code actuals into projections, scores them, and decides which few
 * jobs clear the surfacing threshold — nothing here depends on a live API.
 */
const { jobs, learnings } = buildPortfolio();

export const PORTFOLIO: Job[] = jobs;
export const SEED_LEARNINGS: Learning[] = learnings;

export const flaggedJobs = (): Job[] =>
  PORTFOLIO.filter((j) => j.status === "flagged").sort(
    (a, b) => a.flag!.rank - b.flag!.rank
  );

export const monitoringJobs = (): Job[] =>
  PORTFOLIO.filter((j) => j.status === "monitoring");

export const calmJobs = (): Job[] =>
  PORTFOLIO.filter((j) => j.status === "calm");

export const PORTFOLIO_STATS = {
  jobsMonitored: PORTFOLIO.length,
  flaggedCount: PORTFOLIO.filter((j) => j.status === "flagged").length,
  monitoringCount: PORTFOLIO.filter((j) => j.status === "monitoring").length,
  // Margin already protected this quarter (seed baseline); grows as plans approve.
  marginProtectedBase: 214000,
};
