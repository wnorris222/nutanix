# Roster Command Center

A roster planning and accountability app for college football programs. It turns roster building into a repeatable business process: budgets, independent audits, KPIs, Build vs. Buy analysis, a transfer portal pipeline, and executive oversight. Today these decisions often rest on coaching philosophy alone.

> “We aren’t requiring coaches to use the transfer portal. We’re requiring coaches to prove that their roster is the best it can reasonably be, given the talent and financial resources available.”

## Modules (mapped to the 12 initiatives)

| Module | Initiative(s) | What it does |
| --- | --- | --- |
| **Command Center** | Closed-loop cycle | Window countdown, open escalations, budget use, weakest groups, coach MBO, and the status of the 6-step management cycle |
| **Budgets** | 1, 5 | Retention / portal / contingency allocation (GM proposes, AD + HC approve), reallocation requests (portal → retention needs a documented justification and AD approval), commitments ledger, **Use It or Justify It** review with five required questions |
| **Roster & Depth** | 2, 3 | Coach grade vs. independent audit grade per player, game-ready depth, development trend, priority retention, group standards (ACC rank, required depth, dev target) |
| **Build vs. Buy** | 4 | Side-by-side develop-vs-acquire comparison with an expected-value model; build decisions that fall behind projection are flagged for revisit |
| **Portal Pipeline** | 8, 9 | 7-stage acquisition pipeline (kanban), upgrade/budget flags, commit → creates player + portal ledger entry, loss attribution (scouting / delay / execution / financial / preference), **required explanations for declined opportunities** with GM review and escalation |
| **Acquisition ROI** | 10 | Snap share, upgrade over the replaced option, scouting projection accuracy, $ per grade point, and a comparison with internal development bets |
| **Independent Audit** | 2 | Coach vs. audit chart; gaps above threshold trigger a formal review the GM must resolve with evidence, or escalate |
| **Quarterly Reviews** | 6 | Q1–Q4 review grid per position group; two consecutive poor reviews automatically create an improvement plan |
| **Coach KPIs** | 3, 11 | Six KPIs computed from roster data (overridable), weighted MBO composite (40/25/20/15 by default) |
| **Escalations** | 7 | Automatic triggers (bottom-third rank, depth, injuries, development, audit discrepancy, consecutive poor reviews, unused funds, undocumented declines, build revisit). A trigger can only be closed with a documented note |
| **Roster Committee** | 12 | Agenda + decision log; GM direct recommendations to the AD, with coaching and GM positions shown side by side |
| **Settings** | — | Thresholds, MBO weights, JSON export/import, reset |

**Role-based accountability:** the “Acting as” switch (AD, Head Coach, GM, Position Coach, Personnel/Scouting, Finance/Compliance) controls who can approve, grade, resolve, and decide. For example, only Scouting edits audit grades, only the GM resolves audit disputes, and only the AD approves reallocations and committee decisions.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine unit tests
npm run build    # static build in dist/
```

Data is stored in the browser (localStorage). Use Settings → Export/Import to move data between machines.

## Notes

- The sample dataset is **fictional and illustrative**: player and prospect names are invented, and the $15M budget split is an example, not any program’s actual figures. Coach records use role titles; names can be entered on the Coach KPIs page.
- Compensation must operate within applicable revenue-sharing caps and payment rules; third-party NIL is not treated as guaranteed budget.
- The transfer window is computed as the 10-day football window beginning the first business day after January 1.

## Structure

```
src/
  types.ts     domain model
  seed.ts      sample data
  engine.ts    pure logic: budgets, audits, KPIs/MBO, Build vs. Buy EV, triggers, ROI, window
  store.tsx    state + localStorage persistence
  pages/       one file per module
```
