// Pure computations: budgets, audits, KPIs, triggers, ROI. No React here so it is unit-testable.
import type { AppState, Bucket, BuildBuy, KpiKey, Player, Pos, PositionGroup, QbrRating, Risk } from './types';
import { POSITIONS, POS_LABEL, QUARTERS } from './types';

export const BUCKETS: Bucket[] = ['retention', 'portal', 'contingency'];

// ---------- Budget ----------

export function allocation(s: AppState): Record<Bucket, number> {
  const base = Object.fromEntries(BUCKETS.map((b) => [b, (s.budget.total * s.budget.pct[b]) / 100])) as Record<Bucket, number>;
  for (const r of s.reallocations) {
    if (r.status !== 'approved') continue;
    base[r.from] -= r.amount;
    base[r.to] += r.amount;
  }
  return base;
}

export function spent(s: AppState): Record<Bucket, number> {
  const out: Record<Bucket, number> = { retention: 0, portal: 0, contingency: 0 };
  for (const t of s.transactions) out[t.bucket] += t.amount;
  return out;
}

export function budgetSummary(s: AppState) {
  const alloc = allocation(s);
  const used = spent(s);
  return BUCKETS.map((b) => ({
    bucket: b,
    allocated: alloc[b],
    spent: used[b],
    remaining: alloc[b] - used[b],
    utilization: alloc[b] > 0 ? used[b] / alloc[b] : 0,
  }));
}

export function budgetApproved(s: AppState) {
  return s.budget.approvedBy.includes('AD') && s.budget.approvedBy.includes('HC');
}

/** Can a reallocation be approved? Portal funds moving to retention need a documented justification and AD sign-off. */
export function reallocationRule(from: Bucket, to: Bucket, justification: string): string | null {
  if (from === to) return 'Source and destination must differ.';
  if (from === 'portal' && to === 'retention' && justification.trim().length < 40) {
    return 'Portal → retention moves require a documented business justification (40+ characters) and AD approval.';
  }
  if (justification.trim().length < 10) return 'A justification is required.';
  return null;
}

// ---------- Position groups / audits ----------

export function groupPlayers(s: AppState, pos: Pos): Player[] {
  return s.players.filter((p) => p.pos === pos && p.status !== 'Departed').sort((a, b) => b.auditGrade - a.auditGrade);
}

export function starters(s: AppState, pos: Pos): Player[] {
  const g = s.groups.find((x) => x.pos === pos)!;
  return groupPlayers(s, pos).slice(0, g.requiredDepth);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface GroupAudit {
  pos: Pos;
  coachGrade: number;
  auditGrade: number;
  gap: number;
  disputed: boolean;
  resolved: boolean;
  tier: string;
  coachTier: string;
  accRank: number;
  gameReady: number;
  requiredDepth: number;
  injuries: number;
  devRate: number;
  devTarget: number;
}

export function tier(grade: number): string {
  if (grade >= 85) return 'Championship';
  if (grade >= 80) return 'Playoff contender';
  if (grade >= 75) return 'Upper ACC';
  if (grade >= 70) return 'ACC average';
  return 'Below average';
}

/** Average year-over-year grade gain for players who have history. */
export function devRate(players: Player[]): number {
  const deltas: number[] = [];
  for (const p of players) {
    if (!p.history.length) continue;
    const last = p.history[p.history.length - 1];
    deltas.push(p.auditGrade - last.grade);
  }
  return Math.round(avg(deltas) * 10) / 10;
}

export function auditGroup(s: AppState, g: PositionGroup): GroupAudit {
  const st = starters(s, g.pos);
  const all = groupPlayers(s, g.pos);
  const coachGrade = Math.round(avg(st.map((p) => p.coachGrade)));
  const auditGrade = Math.round(avg(st.map((p) => p.auditGrade)));
  const gap = coachGrade - auditGrade;
  const disputed = Math.abs(gap) >= s.settings.discrepancyThreshold;
  return {
    pos: g.pos,
    coachGrade,
    auditGrade,
    gap,
    disputed,
    resolved: s.resolutions.some((r) => r.pos === g.pos && r.season === s.settings.season),
    tier: tier(auditGrade),
    coachTier: tier(coachGrade),
    accRank: g.accRank,
    gameReady: all.filter((p) => p.status === 'Active' && p.auditGrade >= s.settings.gameReadyGrade).length,
    requiredDepth: g.requiredDepth,
    injuries: all.reduce((a, p) => a + p.injuries, 0),
    devRate: devRate(all),
    devTarget: g.devTarget,
  };
}

export function auditAll(s: AppState): GroupAudit[] {
  return s.groups.map((g) => auditGroup(s, g));
}

// ---------- Coach KPIs / MBO ----------

export const KPI_LABEL: Record<KpiKey, string> = {
  performance: 'Position-group performance',
  development: 'Player development',
  depth: 'Roster depth',
  evaluation: 'Portal evaluation',
  acquisition: 'Acquisition success',
  retention: 'Retention',
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface Kpi {
  key: KpiKey;
  target: string;
  actual: string;
  score: number;
  manual: boolean;
}

export function coachKpis(s: AppState, coachId: string): Kpi[] {
  const coach = s.coaches.find((c) => c.id === coachId)!;
  const groups = s.groups.filter((g) => coach.groups.includes(g.pos));
  const audits = groups.map((g) => auditGroup(s, g));
  const n = s.settings.conferenceSize;
  const prospects = s.prospects.filter((p) => coach.groups.includes(p.pos));
  const qualified = prospects.filter((p) => p.priority);
  const evaluated = qualified.filter((p) => p.evaluated);
  const trig = computeTriggers(s).filter((t) => coach.groups.includes(t.pos as Pos) && t.kind === 'acquisition');
  const addressed = coach.groups.filter((pos) =>
    s.prospects.some((p) => p.pos === pos && p.outcome === 'committed') ||
    s.buildBuy.some((b) => b.pos === pos && b.decision !== 'pending'),
  );
  const priorityPlayers = s.players.filter((p) => coach.groups.includes(p.pos) && p.priorityRetention);
  const retained = priorityPlayers.filter((p) => p.status !== 'Departed');

  const rank = avg(audits.map((a) => a.accRank));
  const target = avg(groups.map((g) => g.targetRank));
  const dev = avg(audits.map((a) => a.devRate));
  const devT = avg(groups.map((g) => g.devTarget));
  const ready = audits.reduce((a, x) => a + Math.min(x.gameReady, x.requiredDepth), 0);
  const need = audits.reduce((a, x) => a + x.requiredDepth, 0);
  const gaps = Math.max(trig.length, 0);

  const auto: Record<KpiKey, Omit<Kpi, 'key' | 'manual'>> = {
    performance: { target: `Top ${Math.round(target)} in ACC`, actual: `#${Math.round(rank)} of ${n}`, score: clamp(rank <= target ? 100 : 100 - ((rank - target) / (n - target)) * 100) },
    development: { target: `+${devT.toFixed(1)} grade / yr`, actual: `${dev >= 0 ? '+' : ''}${dev.toFixed(1)} / yr`, score: clamp(devT > 0 ? (dev / devT) * 100 : 100) },
    depth: { target: `${need} game-ready`, actual: `${ready} game-ready`, score: clamp(need ? (ready / need) * 100 : 100) },
    evaluation: { target: 'All priority targets evaluated', actual: `${evaluated.length}/${qualified.length}`, score: clamp(qualified.length ? (evaluated.length / qualified.length) * 100 : 100) },
    acquisition: { target: 'Address documented gaps', actual: gaps ? `${Math.min(addressed.length, gaps)}/${gaps} gaps addressed` : 'No open gaps', score: clamp(gaps ? (Math.min(addressed.length, gaps) / gaps) * 100 : 100) },
    retention: { target: 'Retain priority players', actual: `${retained.length}/${priorityPlayers.length}`, score: clamp(priorityPlayers.length ? (retained.length / priorityPlayers.length) * 100 : 100) },
  };
  return (Object.keys(auto) as KpiKey[]).map((key) => {
    const m = coach.manualScores?.[key];
    return { key, ...auto[key], score: m ?? auto[key].score, manual: m !== undefined };
  });
}

export function mboScore(s: AppState, coachId: string) {
  const k = Object.fromEntries(coachKpis(s, coachId).map((x) => [x.key, x.score])) as Record<KpiKey, number>;
  const w = s.settings.weights;
  const parts = {
    onField: k.performance,
    development: k.development,
    depth: k.depth,
    execution: Math.round((k.evaluation + k.acquisition + k.retention) / 3),
  };
  const total = (parts.onField * w.onField + parts.development * w.development + parts.depth * w.depth + parts.execution * w.execution) /
    (w.onField + w.development + w.depth + w.execution);
  return { parts, total: Math.round(total), rating: total >= 85 ? 'Outstanding' : total >= 70 ? 'Meets expectations' : total >= 55 ? 'Needs improvement' : 'Unsatisfactory' };
}

// ---------- Build vs Buy ----------

const RISK_FACTOR: Record<Risk, number> = { Low: 0.9, Medium: 0.75, 'Medium-high': 0.6, High: 0.45 };

/** Expected value per $100K: impact × probability-of-success × readiness discount ÷ cost. */
export function expectedValue(o: BuildBuy['build'], season: number) {
  const yearsOut = Math.max(0, o.readyYear - season - 1);
  const readiness = Math.pow(0.7, yearsOut);
  const value = o.impact * RISK_FACTOR[o.risk] * readiness;
  return { value: Math.round(value * 100) / 100, perDollar: Math.round((value / Math.max(o.cost, 50_000)) * 100_000 * 100) / 100 };
}

export function recommend(b: BuildBuy, season: number): 'build' | 'buy' {
  const eb = expectedValue(b.build, season).value;
  const ey = expectedValue(b.buy, season).value;
  return ey > eb * 1.15 ? 'buy' : 'build';
}

export function buildNeedsRevisit(s: AppState, b: BuildBuy): boolean {
  if (b.decision !== 'build') return false;
  const p = s.players.find((x) => x.id === b.buildPlayerId);
  return !!p && p.auditGrade < b.projectedGradeAtReview;
}

// ---------- Quarterly reviews ----------

const POOR: QbrRating[] = ['Below', 'Poor'];

export function consecutivePoor(s: AppState, pos: Pos): boolean {
  const seq = s.reviews
    .filter((r) => r.pos === pos)
    .sort((a, b) => a.season - b.season || QUARTERS.findIndex((q) => q.q === a.quarter) - QUARTERS.findIndex((q) => q.q === b.quarter));
  for (let i = 1; i < seq.length; i++) {
    if (POOR.includes(seq[i].rating) && POOR.includes(seq[i - 1].rating)) return true;
  }
  return false;
}

// ---------- Portal pipeline ----------

export function declineNeedsExplanation(s: AppState, prospectId: string): boolean {
  const p = s.prospects.find((x) => x.id === prospectId);
  if (!p || p.outcome !== 'declined') return false;
  return !p.decline || p.decline.explanation.trim().length < 20;
}

export function isUpgrade(s: AppState, pos: Pos, grade: number): boolean {
  const st = starters(s, pos);
  const weakest = st[st.length - 1];
  return !!weakest && grade > weakest.auditGrade;
}

export function pipelineFunnel(s: AppState) {
  return {
    identified: s.prospects.length,
    evaluated: s.prospects.filter((p) => p.evaluated).length,
    contacted: s.prospects.filter((p) => p.stage >= 4).length,
    acquired: s.prospects.filter((p) => p.outcome === 'committed').length,
    lost: s.prospects.filter((p) => p.outcome === 'lost').length,
    declined: s.prospects.filter((p) => p.outcome === 'declined').length,
  };
}

// ---------- ROI ----------

export function roi(p: Player) {
  const a = p.acquisition!;
  const upgrade = p.auditGrade - a.replacedGrade;
  const projectionError = p.auditGrade - a.projectedGrade;
  const costPerPoint = upgrade > 0 ? p.compensation / upgrade : Infinity;
  const verdict =
    upgrade >= 5 && (p.snapPct ?? 0) >= 50 ? 'Strong return' : upgrade > 0 && (p.snapPct ?? 0) >= 30 ? 'Positive return' : 'Below expectations';
  return { upgrade, projectionError, costPerPoint, verdict, accurate: Math.abs(projectionError) <= 3 };
}

// ---------- Triggers (automatic escalation) ----------

export type TriggerKind = 'acquisition' | 'depth' | 'injury' | 'development' | 'discrepancy' | 'improvement' | 'unused' | 'decline' | 'revisit' | 'reallocation';

export interface Trigger {
  id: string;
  kind: TriggerKind;
  pos?: Pos;
  title: string;
  detail: string;
  action: string;
  owner: string;
  severity: 'high' | 'medium';
  link: string;
}

export function computeTriggers(s: AppState): Trigger[] {
  const out: Trigger[] = [];
  const n = s.settings.conferenceSize;
  const season = s.settings.season;
  for (const g of s.groups) {
    const a = auditGroup(s, g);
    const label = POS_LABEL[g.pos];
    if (g.accRank > (n * 2) / 3) {
      out.push({ id: `acq-${g.pos}-${season}`, kind: 'acquisition', pos: g.pos, severity: 'high', title: `${label} ranks #${g.accRank} of ${n} (bottom third)`, detail: 'Bottom-third conference ranking on relevant metrics.', action: 'Mandatory acquisition review', owner: 'GM', link: 'buildbuy' });
    }
    if (a.gameReady < g.requiredDepth) {
      out.push({ id: `depth-${g.pos}-${season}`, kind: 'depth', pos: g.pos, severity: g.critical ? 'high' : 'medium', title: `${label}: ${a.gameReady} of ${g.requiredDepth} game-ready`, detail: 'Position lacks an established backup / required depth.', action: 'Depth assessment', owner: 'GM', link: 'roster' });
    }
    if (a.injuries >= s.settings.injuryThreshold) {
      out.push({ id: `inj-${g.pos}-${season}`, kind: 'injury', pos: g.pos, severity: 'medium', title: `${label}: ${a.injuries} games missed to injury`, detail: 'Repeated injuries in the group.', action: 'Additional roster planning', owner: 'GM', link: 'roster' });
    }
    if (a.devRate < g.devTarget * 0.67) {
      out.push({ id: `dev-${g.pos}-${season}`, kind: 'development', pos: g.pos, severity: 'medium', title: `${label}: development +${a.devRate}/yr vs +${g.devTarget} target`, detail: 'Coach missing agreed development targets.', action: 'Independent assessment', owner: 'GM', link: 'audit' });
    }
    if (a.disputed && !a.resolved) {
      out.push({ id: `disc-${g.pos}-${season}`, kind: 'discrepancy', pos: g.pos, severity: 'high', title: `${label}: coach grades ${a.coachGrade} (${a.coachTier}) vs audit ${a.auditGrade} (${a.tier})`, detail: 'Coach evaluation disputes the independent audit.', action: 'Formal review — GM resolves with evidence', owner: 'GM', link: 'audit' });
    }
    if (consecutivePoor(s, g.pos)) {
      out.push({ id: `imp-${g.pos}-${season}`, kind: 'improvement', pos: g.pos, severity: 'high', title: `${label}: two consecutive poor quarterly reviews`, detail: 'Automatic improvement plan, including mandatory consideration of external talent.', action: 'Improvement plan', owner: 'HC', link: 'reviews' });
    }
  }
  // Use it or justify it
  const portal = budgetSummary(s).find((b) => b.bucket === 'portal')!;
  const unusedPct = portal.allocated > 0 ? (portal.remaining / portal.allocated) * 100 : 0;
  const weak = out.filter((t) => t.kind === 'acquisition' || t.kind === 'discrepancy').length;
  const justified = s.unusedJustifications.some((j) => j.season === season);
  if (unusedPct >= s.settings.unusedPortalThreshold && weak > 0 && !justified) {
    out.push({ id: `unused-${season}`, kind: 'unused', severity: 'high', title: `${Math.round(unusedPct)}% of portal budget unused while ${weak} weakness flag(s) remain`, detail: 'Use It or Justify It review is required.', action: 'GM + staff justification', owner: 'GM', link: 'budget' });
  }
  for (const p of s.prospects) {
    if (declineNeedsExplanation(s, p.id)) {
      out.push({ id: `decl-${p.id}`, kind: 'decline', pos: p.pos, severity: isUpgrade(s, p.pos, p.projectedGrade) ? 'high' : 'medium', title: `Declined ${p.name} (${p.pos}) without documented explanation`, detail: 'A documented explanation is required for declining a qualified portal opportunity.', action: 'Document rationale', owner: 'Position coach', link: 'pipeline' });
    }
  }
  for (const b of s.buildBuy) {
    if (buildNeedsRevisit(s, b)) {
      out.push({ id: `rev-${b.id}`, kind: 'revisit', pos: b.pos, severity: 'medium', title: `${POS_LABEL[b.pos]} build decision behind projection`, detail: 'Developing player has not reached the projected grade.', action: 'Revisit Build vs. Buy', owner: 'GM', link: 'buildbuy' });
    }
  }
  const pending = s.reallocations.filter((r) => r.status === 'pending');
  if (pending.length) {
    out.push({ id: `realloc-${pending.map((r) => r.id).join('-')}`, kind: 'reallocation', severity: 'medium', title: `${pending.length} budget reallocation request(s) awaiting AD`, detail: 'Allocation changes require AD approval.', action: 'AD decision', owner: 'AD', link: 'budget' });
  }
  return out;
}

// ---------- Transfer window ----------

/** NCAA football window: 10 days beginning the first business day after January 1. */
export function nextTransferWindow(today: Date) {
  const make = (year: number) => {
    const d = new Date(Date.UTC(year, 0, 2));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    const end = new Date(d);
    end.setUTCDate(end.getUTCDate() + 9);
    return { start: d, end };
  };
  let w = make(today.getUTCFullYear());
  if (today > w.end) w = make(today.getUTCFullYear() + 1);
  const days = Math.ceil((w.start.getTime() - today.getTime()) / 86_400_000);
  return { ...w, daysUntil: days, open: today >= w.start && today <= w.end };
}

// ---------- Closed-loop cycle ----------

export function cycleStatus(s: AppState) {
  const audits = auditAll(s);
  const crit = s.groups.filter((g) => g.critical || g.accRank > s.settings.conferenceSize * 0.66);
  const season = s.settings.season;
  const steps = [
    { name: 'Set roster objectives & budgets', owner: 'AD + GM', done: budgetApproved(s), link: 'budget' },
    { name: 'Independently assess position groups', owner: 'Scouting + audit team', done: audits.every((a) => !a.disputed || a.resolved), link: 'audit' },
    { name: 'Complete Build vs. Buy evaluations', owner: 'Position coaches + GM', done: crit.every((g) => s.buildBuy.some((b) => b.pos === g.pos && b.season === season && b.decision !== 'pending')), link: 'buildbuy' },
    { name: 'Approve and execute acquisitions', owner: 'GM + head coach', done: s.prospects.filter((p) => p.priority && p.outcome === 'active').length === 0, link: 'pipeline' },
    { name: 'Measure performance and ROI', owner: 'Analytics + independent evaluators', done: s.players.some((p) => p.acquisition), link: 'roi' },
    { name: 'Require corrective action', owner: 'Head coach + AD', done: computeTriggers(s).every((t) => s.triggerActions[t.id]?.status === 'resolved'), link: 'triggers' },
  ];
  return steps;
}

export function positionsList() {
  return POSITIONS;
}

export function money(n: number, compact = true): string {
  if (!isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  if (compact && v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 2)}M`;
  if (compact && v >= 1_000) return `${sign}$${Math.round(v / 1_000)}K`;
  return `${sign}$${Math.round(v).toLocaleString()}`;
}
