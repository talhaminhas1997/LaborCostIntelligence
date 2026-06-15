import type { JobSeed } from "./engine";
import type { CostCodeLine, Learning } from "./types";

/** Cost-code line shorthand. */
const cc = (
  code: string,
  name: string,
  budgetHours: number,
  actualHours: number,
  committedHours: number,
  pctComplete: number
): CostCodeLine => ({
  code,
  name,
  budgetHours,
  actualHours,
  committedHours,
  pctComplete,
});

/* Calm job: a few cost codes tracking at or under budget. */
const calm = (
  id: string,
  number: string,
  name: string,
  trade: string,
  region: string,
  contractValue: number,
  blendedRate: number,
  baselineMarginPct: number,
  weeksTotal: number,
  pctComplete: number,
  lines: CostCodeLine[]
): JobSeed => ({
  id,
  number,
  name,
  trade,
  region,
  contractValue,
  blendedRate,
  baselineMarginPct,
  weeksTotal,
  lines,
});

export const JOB_SEEDS: JobSeed[] = [
  /* ============================ FLAGGED — the few that matter ============ */

  // #1 — added-scope: out-of-scope rough-in labor, big $, recoverable.
  {
    id: "j412",
    number: "412",
    name: "Meridian Tech Campus — Bldg C TI",
    trade: "Electrical",
    region: "Mountain West",
    contractValue: 3960000,
    blendedRate: 82,
    baselineMarginPct: 12.5,
    weeksTotal: 16,
    driver: { code: "26-100", kind: "added-scope" },
    lines: [
      cc("26-100", "Rough-in", 3600, 2220, 1560, 0.5),
      cc("26-250", "Feeder / distribution", 600, 360, 260, 0.45),
      cc("26-200", "Panel / service", 800, 360, 280, 0.45),
      cc("26-300", "Finish / devices", 2400, 360, 240, 0.15),
      cc("28-310", "Fire alarm", 480, 250, 180, 0.5),
    ],
  },

  // #2 — underbid: ductwork bid ran light; convert to T&M.
  {
    id: "j207",
    number: "207",
    name: "Lakeshore Medical Office",
    trade: "Mechanical/HVAC",
    region: "Pacific Northwest",
    contractValue: 2810000,
    blendedRate: 86,
    baselineMarginPct: 11.4,
    weeksTotal: 15,
    driver: { code: "23-300", kind: "underbid" },
    lines: [
      cc("23-300", "Ductwork fabrication", 1900, 1180, 560, 0.55),
      cc("23-100", "Equipment set", 700, 430, 200, 0.5),
      cc("02-050", "Demolition", 300, 150, 60, 0.5),
    ],
  },

  // #3 — under-recovery: billable T&M labor not captured on tickets.
  {
    id: "j132",
    number: "132",
    name: "Stonebridge Multifamily",
    trade: "Plumbing",
    region: "Mountain West",
    contractValue: 1690000,
    blendedRate: 76,
    baselineMarginPct: 9.6,
    weeksTotal: 14,
    driver: { code: "22-100", kind: "under-recovery" },
    lines: [
      cc("22-100", "Piping", 1500, 1080, 460, 0.58),
      cc("22-300", "Fixtures", 700, 300, 220, 0.4),
      cc("22-050", "Underground", 400, 360, 20, 0.92),
    ],
  },

  /* ============================ MONITORING — drifting, not surfaced ====== */

  // Mostly sunk: late job, small $, low recoverable → watch, don't surface.
  {
    id: "j88",
    number: "088",
    name: "Crossroads Corporate Center",
    trade: "Electrical",
    region: "Mountain West",
    contractValue: 2150000,
    blendedRate: 80,
    baselineMarginPct: 12.2,
    weeksTotal: 12,
    driver: { code: "26-300", kind: "rework" },
    lines: [
      cc("26-300", "Finish / devices", 1400, 1290, 90, 0.85),
      cc("26-100", "Rough-in", 1800, 1760, 20, 0.99),
      cc("28-310", "Fire alarm", 300, 270, 10, 0.95),
    ],
  },

  // Real drift but below the surfacing threshold (small $, early).
  {
    id: "j173",
    number: "173",
    name: "Harbor Freight Distribution",
    trade: "Mechanical/HVAC",
    region: "Southwest",
    contractValue: 2240000,
    blendedRate: 84,
    baselineMarginPct: 10.8,
    weeksTotal: 18,
    driver: { code: "23-300", kind: "added-scope" },
    lines: [
      cc("23-300", "Ductwork fabrication", 1500, 470, 280, 0.28),
      cc("23-100", "Equipment set", 900, 240, 200, 0.27),
    ],
  },

  /* ============================ CALM — the quiet majority ================ */

  calm("j51", "051", "Cedar Point Medical TI", "Electrical", "Mountain West", 1840000, 80, 13.1, 10, 1.0, [
    cc("26-100", "Rough-in", 1100, 1090, 0, 1.0),
    cc("26-300", "Finish / devices", 820, 815, 0, 1.0),
  ]),
  calm("j93", "093", "Riverside Logistics Hub", "Mechanical/HVAC", "Midwest", 3120000, 85, 11.9, 16, 0.62, [
    cc("23-300", "Ductwork fabrication", 2100, 1290, 760, 0.62),
    cc("23-100", "Equipment set", 900, 540, 340, 0.6),
  ]),
  calm("j110", "110", "Foundry Lofts Phase 2", "Electrical", "Mountain West", 2475000, 81, 12.4, 14, 0.48, [
    cc("26-100", "Rough-in", 1600, 760, 820, 0.48),
    cc("26-300", "Finish / devices", 1200, 120, 980, 0.1),
  ]),
  calm("j145", "145", "Summit Office Park B", "Plumbing", "Mountain West", 980000, 75, 10.2, 11, 0.71, [
    cc("22-100", "Piping", 850, 600, 200, 0.74),
    cc("22-300", "Fixtures", 400, 280, 110, 0.7),
  ]),
  calm("j156", "156", "Northgate Transit Center", "Concrete", "Pacific Northwest", 4260000, 78, 9.4, 22, 0.33, [
    cc("03-100", "Formwork", 3200, 1050, 2050, 0.33),
    cc("03-300", "Placement", 2400, 760, 1560, 0.32),
  ]),
  calm("j168", "168", "Birchwood Apartments", "Electrical", "Southwest", 1610000, 79, 11.0, 12, 0.8, [
    cc("26-100", "Rough-in", 1050, 840, 200, 0.8),
    cc("26-300", "Finish / devices", 760, 600, 150, 0.79),
  ]),
  calm("j189", "189", "Westview Data Center Fit-out", "Electrical", "Mountain West", 5380000, 88, 14.2, 24, 0.41, [
    cc("26-250", "Switchgear", 2600, 1060, 1500, 0.41),
    cc("26-100", "Rough-in", 3000, 1230, 1740, 0.42),
  ]),
  calm("j201", "201", "Maplewood Senior Living", "Plumbing", "Midwest", 1320000, 74, 10.7, 13, 0.55, [
    cc("22-100", "Piping", 1100, 600, 480, 0.55),
    cc("22-300", "Fixtures", 520, 280, 220, 0.54),
  ]),
  calm("j214", "214", "Granite Ridge Parking Structure", "Concrete", "Mountain West", 2890000, 77, 9.1, 16, 0.64, [
    cc("03-100", "Formwork", 2400, 1530, 840, 0.64),
    cc("03-300", "Placement", 1800, 1150, 620, 0.63),
  ]),
  calm("j222", "222", "Cobalt Tower Core & Shell", "Concrete", "Pacific Northwest", 6100000, 80, 8.8, 30, 0.19, [
    cc("03-100", "Formwork", 5200, 980, 4100, 0.19),
    cc("03-300", "Placement", 3800, 720, 3000, 0.18),
  ]),
  calm("j238", "238", "Elmwood Retail Renovation", "Electrical", "Southwest", 740000, 78, 11.5, 9, 0.88, [
    cc("26-100", "Rough-in", 520, 460, 50, 0.89),
    cc("26-300", "Finish / devices", 360, 315, 30, 0.87),
  ]),
];

/* Historical lessons already written back — power the Bid Co-pilot benchmarks. */
export const SEED_LEARNINGS: Learning[] = [
  {
    id: "seed-051",
    jobNumber: "051",
    jobName: "Cedar Point Medical TI",
    trade: "Electrical",
    costCode: "26-100",
    costCodeName: "Rough-in",
    overranPct: 9,
    kind: "added-scope",
    text: "Completed Job 051 closed 9% over on rough-in (26-100) — medical TI rough-in benchmark raised for Mountain West.",
    source: "seed",
  },
  {
    id: "seed-318",
    jobNumber: "318",
    jobName: "Aspen Grove Clinic (closed)",
    trade: "Electrical",
    costCode: "28-310",
    costCodeName: "Fire alarm",
    overranPct: 19,
    kind: "underbid",
    text: "Closed Job 318 ran 19% over on fire alarm (28-310) tie-ins — low-voltage benchmark tightened.",
    source: "seed",
  },
  {
    id: "seed-264",
    jobNumber: "264",
    jobName: "Lincoln Yards TI (closed)",
    trade: "Electrical",
    costCode: "26-300",
    costCodeName: "Finish / devices",
    overranPct: 12,
    kind: "rework",
    text: "Closed Job 264 absorbed 12% rework on finish/devices (26-300) — punch allowance baked into the benchmark.",
    source: "seed",
  },
];
