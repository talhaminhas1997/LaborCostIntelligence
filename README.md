# Cubit

**The job-cost intelligence layer for construction.**

Cubit is a closed loop that protects margin on the jobs a contractor has already
won — and then bids the next one smarter:

> **Monitor → Surface (prioritized) → Approve → Act → Learn → Bid smarter**

It watches every active job's labor cost in real time, surfaces only the few
cost creeps that matter (ranked by margin-at-risk × confidence × time-left-to-act),
and — on one human approval — takes multi-step action to protect the margin.
Each resolved job writes a lesson back into the benchmarks, which sharpens the
next bid.

> Prototype note: all figures are **illustrative**. Production uses live
> cross-contractor payroll data; v1 is single-tenant (the contractor's own job
> history). The demo runs end-to-end with **no API key** — every endpoint has a
> deterministic fallback and the monitoring view runs on seeded data.

---

## The two acts (demo at `/app`)

**1. Margin Watch** (default) — an always-on, conversational agent monitoring the
whole portfolio. Most jobs sit quiet; a few are flagged and ranked. Each flag is
job-cost only (labor overrun, margin erosion, rework, under-recovery), shows the
drifting cost code, the projected margin impact, and a **proposed multi-step
plan** (draft change order → reforecast margin → alert PM → write back to
benchmark). Approve all, or review each — the steps execute one-by-one and the
margin recovers. Runs entirely on seeded, deterministic data.

**2. Bid Co-pilot** — a chat-driven bid check. The right panel starts empty;
describe a job (or load the sample / upload a takeoff) and Cubit extracts a
phase-by-phase takeoff by cost code, then benchmarks it against actuals **learned
from your jobs** — including the ones you just protected in Margin Watch. Edit
any phase's hours and the analysis re-runs.

---

## Stack

- **Frontend:** React + Vite + TypeScript, Tailwind CSS, shadcn-style UI,
  Framer Motion (`client/`)
- **API:** Express 5 + TypeScript, official Anthropic SDK (`server/`)
- **Models:** `claude-3-5-haiku` for chat + extraction; `claude-sonnet-4-6` for
  bid analysis and the agent's reasoning
- No database, no auth. The monitoring view never hard-depends on the API.

```
client/   React + Vite app (landing + demo)
  src/lib/engine.ts     cost-code projection + scoring + surfacing engine
  src/lib/seed-data.ts  seeded portfolio (raw cost-code actuals) + learnings
server/   Express API: /api/chat, /api/extract, /api/analyze (all with fallbacks)
```

---

## Run locally

```bash
# install root + server + client deps
npm run install:all

# (optional) turn on real Claude reasoning
cp server/.env.example server/.env
#   then edit server/.env and set ANTHROPIC_API_KEY=sk-ant-...

# start API (:8787) and client (:5173) together
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` to the
Express server on `:8787`.

Without a key, everything still works — the demo uses deterministic fallbacks.

---

## API

All endpoints accept JSON `POST` and **always** return a result (model output,
or a deterministic fallback if the key is missing or the call fails).

| Endpoint | Input | Output |
| --- | --- | --- |
| `/api/chat` | `{ messages, jobContext?, mode? }` | `{ reply }` |
| `/api/extract` | `{ text }` or `{ fileBase64, mimeType }` | `{ trade, region, scope, phases:[{name,hours,costCode}], blendedRate }` |
| `/api/analyze` | `{ trade, region, scope, phases[], blendedRate }` | `{ verdict, percentDelta, headline, phases[], reworkGap, recommended, rationale, confidence }` |

---

## Deploy to Vercel

The repo is Vercel-ready. The Vite client builds to a static site and the API
runs as serverless functions in `/api` (`chat`, `extract`, `analyze`, `health`),
all sharing `api/_lib/core.ts`. The local Express server (`server/`) is only used
for `npm run dev` and calls the same shared core.

From the Vercel dashboard:

1. **Add New → Project → Import** this repo. The settings come from `vercel.json`
   (build command, `client/dist` output, function config, SPA rewrite) — leave
   them as detected.
2. **Settings → Environment Variables** → add `ANTHROPIC_API_KEY` = your key, for
   **Production, Preview, Development**.
3. **Deploy.** Every push to `main` redeploys.

Or via CLI: `npm i -g vercel && vercel` (preview) then `vercel --prod`.

Without the key the deploy still works on deterministic fallbacks; with it, chat,
takeoff extraction, and bid analysis use live Claude. The Margin Watch portfolio
always runs on seeded data by design.

## Build (local production check)

```bash
npm run build      # builds the client to client/dist (what Vercel serves)
```
