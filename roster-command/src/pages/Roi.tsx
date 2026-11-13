import { buildNeedsRevisit, money, roi } from '../engine';
import { useStore } from '../store';
import { POS_LABEL } from '../types';
import { Badge, Card, PageHead, Stat } from '../ui';

export default function RoiPage() {
  const { state, update, can } = useStore();
  const acquired = state.players.filter((p) => p.acquisition);
  const rows = acquired.map((p) => ({ p, r: roi(p) }));
  const spend = acquired.reduce((a, p) => a + p.compensation, 0);
  const accurate = rows.filter((x) => x.r.accurate).length;
  const meaningful = rows.filter((x) => (x.p.snapPct ?? 0) >= 40).length;
  const builds = state.buildBuy.filter((b) => b.decision === 'build');

  return (
    <>
      <PageHead kicker="Initiative 10 · Post-acquisition review" title="Acquisition ROI">
        Signing a portal player isn’t the finish line. Did the acquisition deliver, was the investment justified, and were scouting projections
        accurate? Both successes and misses feed next year’s evaluations and budget.
      </PageHead>

      <div className="stats">
        <Stat label="Portal acquisitions" value={acquired.length} note={`${money(spend)} invested`} />
        <Stat label="Meaningful playing time" value={`${meaningful}/${acquired.length}`} note="≥40% of snaps" tone={meaningful / Math.max(1, acquired.length) >= 0.6 ? 'good' : 'warn'} />
        <Stat label="Scouting accuracy" value={`${accurate}/${acquired.length}`} note="within ±3 of projection" tone={accurate / Math.max(1, acquired.length) >= 0.6 ? 'good' : 'warn'} />
        <Stat label="Avg. upgrade" value={`${rows.length ? (rows.reduce((a, x) => a + x.r.upgrade, 0) / rows.length).toFixed(1) : 0} pts`} note="over best internal option" />
      </div>

      <Card title="Portal acquisitions" sub="Snap share and audit grade are editable by Personnel / Scouting">
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Player</th><th>Pos</th><th className="num">Snaps %</th><th className="num">Projected</th><th className="num">Actual</th><th className="num">Replaced</th><th className="num">Upgrade</th><th className="num">Comp</th><th className="num">$ / grade pt</th><th>Verdict</th></tr></thead>
            <tbody>
              {rows.map(({ p, r }) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.pos}</td>
                  <td className="num">
                    {can('SCOUT', 'GM') ? (
                      <input className="inline num-in" type="number" min={0} max={100} value={p.snapPct ?? 0} onChange={(e) => update((d) => { d.players.find((x) => x.id === p.id)!.snapPct = +e.target.value; })} />
                    ) : (p.snapPct ?? 0)}
                  </td>
                  <td className="num">{p.acquisition!.projectedGrade}</td>
                  <td className="num">{p.auditGrade} <span className={r.accurate ? 'good-t small' : 'bad-t small'}>({r.projectionError > 0 ? '+' : ''}{r.projectionError})</span></td>
                  <td className="num">{p.acquisition!.replacedGrade}</td>
                  <td className="num"><strong className={r.upgrade > 0 ? 'good-t' : 'bad-t'}>{r.upgrade > 0 ? '+' : ''}{r.upgrade}</strong></td>
                  <td className="num">{money(p.compensation)}</td>
                  <td className="num">{money(r.costPerPoint)}</td>
                  <td><Badge tone={r.verdict === 'Strong return' ? 'good' : r.verdict === 'Positive return' ? 'accent' : 'bad'}>{r.verdict}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Internal development decisions" sub="Compared against acquisitions — identifies persistent over-optimism in internal evaluations">
        {builds.length === 0 && <p className="muted">No build decisions recorded.</p>}
        <table className="tbl">
          <thead><tr><th>Position</th><th>Player</th><th className="num">Projected</th><th className="num">Current</th><th>Status</th></tr></thead>
          <tbody>
            {builds.map((b) => {
              const p = state.players.find((x) => x.id === b.buildPlayerId);
              const behind = buildNeedsRevisit(state, b);
              return (
                <tr key={b.id}>
                  <td>{POS_LABEL[b.pos]}</td>
                  <td>{p?.name ?? '—'}</td>
                  <td className="num">{b.projectedGradeAtReview}</td>
                  <td className="num">{p?.auditGrade ?? '—'}</td>
                  <td>{behind ? <Badge tone="bad">Behind projection — revisit</Badge> : <Badge tone="good">On track</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
