import { buildSeed } from './seed';
import {
  allocation, auditAll, budgetSummary, coachKpis, computeTriggers, consecutivePoor, declineNeedsExplanation,
  expectedValue, mboScore, nextTransferWindow, reallocationRule, recommend, roi,
} from './engine';

describe('budget', () => {
  it('splits the illustrative $15M budget 60/30/10', () => {
    const s = buildSeed();
    expect(allocation(s)).toEqual({ retention: 9_000_000, portal: 4_500_000, contingency: 1_500_000 });
  });

  it('only applies approved reallocations', () => {
    const s = buildSeed();
    expect(allocation(s).portal).toBe(4_500_000); // seed request is pending
    s.reallocations[0].status = 'approved';
    expect(allocation(s).portal).toBe(3_900_000);
    expect(allocation(s).retention).toBe(9_600_000);
  });

  it('requires a documented justification to move portal funds into retention', () => {
    expect(reallocationRule('portal', 'retention', 'short')).toMatch(/justification/);
    expect(reallocationRule('portal', 'retention', 'x'.repeat(45))).toBeNull();
    expect(reallocationRule('contingency', 'portal', 'injury replacement')).toBeNull();
    expect(reallocationRule('portal', 'portal', 'x'.repeat(45))).toMatch(/differ/);
  });
});

describe('triggers', () => {
  it('flags the seeded offensive line on every key rule', () => {
    const kinds = computeTriggers(buildSeed()).filter((t) => t.pos === 'OL').map((t) => t.kind);
    expect(kinds).toEqual(expect.arrayContaining(['acquisition', 'discrepancy', 'improvement']));
  });

  it('requires Use It or Justify It when portal money sits unused next to weaknesses', () => {
    const s = buildSeed();
    expect(computeTriggers(s).some((t) => t.kind === 'unused')).toBe(true);
    s.unusedJustifications.push({ season: s.settings.season, answers: ['a', 'b', 'c', 'd', 'e'], date: '2026-11-13' });
    expect(computeTriggers(s).some((t) => t.kind === 'unused')).toBe(false);
  });

  it('clears an audit discrepancy once the GM resolves it', () => {
    const s = buildSeed();
    expect(auditAll(s).find((a) => a.pos === 'OL')!.disputed).toBe(true);
    s.resolutions.push({ pos: 'OL', season: s.settings.season, ruling: 'audit', evidence: 'film', date: '2026-11-13' });
    expect(computeTriggers(s).some((t) => t.id.startsWith('disc-OL'))).toBe(false);
  });

  it('demands an explanation for declined prospects', () => {
    const s = buildSeed();
    expect(declineNeedsExplanation(s, 'x-2')).toBe(true);
    expect(declineNeedsExplanation(s, 'x-3')).toBe(false);
  });

  it('detects consecutive poor quarterly reviews', () => {
    const s = buildSeed();
    expect(consecutivePoor(s, 'OL')).toBe(true);
    expect(consecutivePoor(s, 'EDGE')).toBe(false);
  });
});

describe('evaluation', () => {
  it('produces bounded KPI and MBO scores for every coach', () => {
    const s = buildSeed();
    for (const c of s.coaches) {
      for (const k of coachKpis(s, c.id)) expect(k.score).toBeGreaterThanOrEqual(0);
      const m = mboScore(s, c.id);
      expect(m.total).toBeGreaterThanOrEqual(0);
      expect(m.total).toBeLessThanOrEqual(100);
    }
    const ol = mboScore(s, 'c-ol').total;
    const lb = mboScore(s, 'c-lb').total;
    expect(ol).toBeLessThan(lb);
  });

  it('favors buying when the transfer is ready sooner with lower risk', () => {
    const s = buildSeed();
    const edge = s.buildBuy.find((b) => b.pos === 'EDGE')!;
    expect(recommend(edge, s.settings.season)).toBe('buy');
    expect(expectedValue(edge.buy, s.settings.season).value).toBeGreaterThan(expectedValue(edge.build, s.settings.season).value);
  });

  it('computes ROI against the replaced internal option', () => {
    const s = buildSeed();
    const wr = s.players.find((p) => p.id === 'p-portal-0')!;
    const r = roi(wr);
    expect(r.upgrade).toBe(9);
    expect(r.accurate).toBe(true);
    expect(r.verdict).toBe('Strong return');
  });
});

describe('transfer window', () => {
  it('opens on the first business day after Jan 1 and lasts 10 days', () => {
    const w = nextTransferWindow(new Date(Date.UTC(2026, 10, 13)));
    expect(w.start.toISOString().slice(0, 10)).toBe('2027-01-04'); // Jan 2-3 2027 is a weekend
    expect(w.end.toISOString().slice(0, 10)).toBe('2027-01-13');
    expect(w.open).toBe(false);
  });
});

describe('budget summary', () => {
  it('reports utilization per bucket', () => {
    const rows = budgetSummary(buildSeed());
    const portal = rows.find((r) => r.bucket === 'portal')!;
    expect(portal.spent).toBe(1_600_000);
    expect(portal.utilization).toBeLessThan(0.5);
  });
});
