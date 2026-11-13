import { useState } from 'react';
import { coachKpis, consecutivePoor, KPI_LABEL, mboScore } from '../engine';
import { useStore } from '../store';
import type { KpiKey } from '../types';
import { Badge, Card, Gate, Meter, PageHead, toneFor } from '../ui';

export default function CoachesPage() {
  const { state, update, can } = useStore();
  const [sel, setSel] = useState(state.coaches.find((c) => c.groups.includes('OL'))?.id ?? state.coaches[0].id);
  const coach = state.coaches.find((c) => c.id === sel)!;
  const kpis = coachKpis(state, sel);
  const mbo = mboScore(state, sel);
  const w = state.settings.weights;
  const multiSeason = coach.groups.some((g) => consecutivePoor(state, g));

  return (
    <>
      <PageHead kicker="Initiatives 3 & 11 · KPIs + management by objectives" title="Position Coach Scorecards">
        Coaches are accountable for the overall quality of their position group — regardless of where the players came from.
      </PageHead>

      <Card title="All coaches" sub="Composite MBO score">
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Coach</th><th>Groups</th><th className="num">On-field {w.onField}%</th><th className="num">Dev {w.development}%</th><th className="num">Depth {w.depth}%</th><th className="num">Acq/Ret {w.execution}%</th><th className="num">Total</th><th>Rating</th></tr></thead>
            <tbody>
              {state.coaches.map((c) => {
                const m = mboScore(state, c.id);
                return (
                  <tr key={c.id} className={c.id === sel ? 'sel' : ''} onClick={() => setSel(c.id)} style={{ cursor: 'pointer' }}>
                    <td><strong>{c.name || c.title}</strong>{c.name && <div className="muted small">{c.title}</div>}</td>
                    <td>{c.groups.join(', ')}</td>
                    <td className="num">{m.parts.onField}</td>
                    <td className="num">{m.parts.development}</td>
                    <td className="num">{m.parts.depth}</td>
                    <td className="num">{m.parts.execution}</td>
                    <td className="num"><strong>{m.total}</strong></td>
                    <td><Badge tone={toneFor(m.total)}>{m.rating}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card title={coach.name || coach.title} sub={`${coach.groups.join(', ')} · composite ${mbo.total} — ${mbo.rating}`}
          actions={<Gate roles={['GM', 'AD']} what="Edit name"><input className="inline" placeholder="Coach name" value={coach.name} onChange={(e) => update((d) => { d.coaches.find((c) => c.id === sel)!.name = e.target.value; })} /></Gate>}>
          <table className="tbl">
            <thead><tr><th>KPI</th><th>Target</th><th>Actual</th><th className="num">Score</th></tr></thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.key}>
                  <td>{KPI_LABEL[k.key]}{k.manual && <Badge tone="purple">override</Badge>}</td>
                  <td className="muted small">{k.target}</td>
                  <td>{k.actual}</td>
                  <td className="num">
                    {can('GM', 'AD') ? (
                      <input className="inline num-in" type="number" min={0} max={100} value={k.score} onChange={(e) => update((d) => {
                        const c = d.coaches.find((x) => x.id === sel)!;
                        c.manualScores = { ...c.manualScores, [k.key]: +e.target.value };
                      })} />
                    ) : <strong>{k.score}</strong>}
                    <Meter value={k.score} max={100} tone={toneFor(k.score)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {kpis.some((k) => k.manual) && (
            <Gate roles={['GM', 'AD']} what="Clear overrides">
              <button className="btn ghost small" onClick={() => update((d) => { d.coaches.find((x) => x.id === sel)!.manualScores = undefined; })}>Clear overrides (use computed)</button>
            </Gate>
          )}
          <p className="muted small">Targets vary by position and should be adjusted for injuries and other circumstances outside a coach’s control.</p>
        </Card>

        <Card title="Evaluation framework" sub="Illustrative weights — actual terms depend on employment agreements">
          {([['onField', 'On-field position performance'], ['development', 'Player development'], ['depth', 'Roster quality and depth'], ['execution', 'Acquisition & retention execution']] as const).map(([k, l]) => (
            <div key={k} className="bud-row">
              <div className="row between"><span>{l} <span className="muted small">({w[k]}%)</span></span><strong>{mbo.parts[k]}</strong></div>
              <Meter value={mbo.parts[k]} max={100} tone={toneFor(mbo.parts[k])} />
            </div>
          ))}
          <div className="score-big"><span className="muted small">Composite</span><strong>{mbo.total}</strong><Badge tone={toneFor(mbo.total)}>{mbo.rating}</Badge></div>
          {multiSeason && (
            <div className="callout bad">
              <strong>Accountability check:</strong> this group has consecutive poor reviews. The coach must explain what is changing through
              development, high school recruiting, or transfer acquisition. “We like our guys” is not evidence.
            </div>
          )}
          {kpis.find((k) => k.key === 'acquisition')!.score < 60 && (
            <div className="callout warn">Documented roster gaps remain unaddressed — an outstanding evaluation is not available on recruiting success alone.</div>
          )}
        </Card>
      </div>
    </>
  );
}

export type { KpiKey };
