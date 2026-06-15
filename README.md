# Cost Agent

**The labor cost intelligence layer for construction.**

An always-on agent that protects margin on the jobs a contractor has already
won. It watches every active job's labor cost in real time, surfaces only the
few jobs where margin is genuinely at risk (ranked by dollars at risk × time
left to act), and — on one human approval — takes governed multi-step action to
protect it: draft change order → reforecast margin → alert the PM → write the
actuals back to the benchmark.

> **MVP scope:** this build is **Cost Agent** only — the monitoring + action
> agent. A bidding co-pilot and cross-contractor benchmarks are roadmap, not
> part of this app.

## How the numbers are grounded

Every figure traces to first-party data in the **Miter** stack — no third-party
PMS required:

- **Miter Payroll** → burdened labor **cost and hours by cost code**
- **Miter Field Operations** → **units installed by cost code** (field production)
- **ERP** → job **budgets and planned quantities**

The overrun forecast is **unit-rate / earned-value**: *actual hours per unit
installed* vs. *budgeted hours per unit* → projected hours at completion →
projected cost overrun. All figures in the demo are **illustrative**; the data
model is real.

---

## Stack

- **Frontend:** React + Vite + TypeScript, Tailwind CSS, Framer Motion (`client/`)
- **API:** Vercel serverless functions (`api/`), with a local Express mirror
  (`server/`) for `npm run dev`. Shared logic lives in `api/_lib/core.ts`.
- **Model:** Anthropic SDK — `claude-sonnet-4-6` for the agent's reasoning, with
  a deterministic fallback so the demo always responds.
- Cost Agent's portfolio is **seeded and deterministic** — it never
  hard-depends on a live API.

```
client/   React + Vite app (landing + Cost Agent at /app)
  src/lib/engine.ts     cost-code projection + scoring + surfacing engine
  src/lib/seed-data.ts  seeded portfolio (raw cost-code actuals)
api/      Serverless functions: /api/chat, /api/health (share api/_lib/core.ts)
server/   Local Express dev server (mirrors /api for `npm run dev`)
```

---

## Run locally

```bash
npm run install:all

# (optional) turn on live Claude reasoning for the agent's chat
cp server/.env.example server/.env
#   then set ANTHROPIC_API_KEY=sk-ant-...   (note: API_PORT, not PORT)

npm run dev          # client on :5173, API on :8787 (Vite proxies /api → :8787)
```

Open **http://localhost:5173**. Without a key everything still works on the
deterministic fallback.

## API

| Endpoint | Input | Output |
| --- | --- | --- |
| `/api/chat` | `{ messages, jobContext?, mode? }` | `{ reply, source }` |
| `/api/health` | — | `{ ok, model }` |

Both always return a result (model output, or fallback if the key is missing or
the call fails).

## Deploy to Vercel

The repo is Vercel-ready (`vercel.json`): the Vite client builds to a static
site (`client/dist`) and the API runs as serverless functions in `/api`.

1. **Add New → Project → Import** the repo (settings come from `vercel.json`).
2. **Settings → Environment Variables** → add `ANTHROPIC_API_KEY` for
   Production, Preview, and Development.
3. **Deploy.** Every push to `main` redeploys.
