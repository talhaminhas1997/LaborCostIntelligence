# Cubit

**The labor cost intelligence layer for construction.**

Cubit lets a construction estimator validate their labor estimate against
AI-reasoned, cross-contractor benchmarks **before they bid a job**. Drop in a
trade, region, scope, and phase-by-phase hours, and Cubit pressure-tests the
estimate — flagging which phases are light, where the rework gap is, and what a
defensible labor number actually looks like.

> Prototype note: benchmark figures shown in the app are **illustrative**. The
> production version is powered by live cross-contractor payroll data only a
> system-of-record could have.

---

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Anthropic SDK** (`@anthropic-ai/sdk`) — all AI calls run **server-side only**
  in the `/api/analyze` route, using model `claude-sonnet-4-6`.
- No database, no auth. Deploys to **Vercel with zero config**.

The app **always works**: if `ANTHROPIC_API_KEY` is missing or the model
call/parse fails, the API route falls back to a deterministic local analysis
that returns the same JSON shape, so the demo never shows a raw error.

---

## Run locally

```bash
npm install

# Optional but recommended — enables genuine AI-reasoned analysis.
# Without it, the app uses the deterministic local fallback.
cp .env.local.example .env.local
# then edit .env.local and set:
#   ANTHROPIC_API_KEY=sk-ant-...

npm run dev
```

Open <http://localhost:3000>.

- `/` — landing page
- `/app` — the interactive estimate analyzer

---

## Deploy to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel, **New Project → Import** the repo. No build configuration is
   required — Vercel auto-detects Next.js.
3. Add the environment variable in **Project → Settings → Environment
   Variables**:

   | Name                | Value          | Environments                     |
   | ------------------- | -------------- | -------------------------------- |
   | `ANTHROPIC_API_KEY` | `sk-ant-...`   | Production, Preview, Development |

4. Deploy. (Or from the CLI: `vercel` then `vercel --prod`.)

If you skip the env var, the deployment still works — it just uses the local
fallback analysis instead of live model reasoning.

---

## How it works

```
/app (client form)
   │  POST { trade, region, scope, phases[], blendedRate }
   ▼
/api/analyze (server, Node runtime)
   │  ├─ ANTHROPIC_API_KEY present → claude-sonnet-4-6 → strict JSON
   │  └─ missing / error / bad JSON → computeFallback() (deterministic)
   ▼
AnalyzeResult JSON  →  ResultsPanel renders verdict, per-phase bands,
                       rework gap, recommended hours + cost, rationale.
```

The model is instructed to reason genuinely from the actual scope text and
numbers, so different inputs produce different, sensible results, and to return
**only** valid JSON matching a fixed schema (see `lib/types.ts`). The route
extracts and validates that JSON defensively before returning it.

## Project structure

```
app/
  layout.tsx            Root layout + metadata
  page.tsx              Landing page
  app/page.tsx          The interactive analyzer (client component)
  api/analyze/route.ts  Server-side analysis (model + fallback)
components/
  Brand.tsx             Logo / wordmark
  ResultsPanel.tsx      Results rendering
lib/
  types.ts              Shared request/result types
  fallback.ts           Deterministic local analysis engine
```
