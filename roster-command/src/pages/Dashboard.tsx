import { auditAll, budgetSummary, computeTriggers, cycleStatus, mboScore, money, nextTransferWindow, pipelineFunnel } from '../engine';
import { useStore } from '../store';
import { POS_LABEL } from '../types';
import { Badge, Card, Meter, PageHead, Principle, Stat, toneFor } from '../ui';

export default function Dashboard() {
  const { state } = useStore();
  const budget = budgetSummary(state);
  const portal = budget.find((b) => b.bucket === 'portal')!;
  const triggers = computeTriggers(state);
  const openTriggers = triggers.filter((t) => state.triggerActions[t.id]?.status !== 'resolved');
  const audits = auditAll(state);
  const disputes = audits.filter((a) => a.disputed && !a.resolved);
  const window = nextTransferWindow(new Date());
  const funnel = pipelineFunnel(state);
  const steps = cycleStatus(state);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const weakest = [...audits].sort((a, b) => a.auditGrade - b.auditGrade).slice(0, 4);
  const coaches = state.coaches.map((c) => ({ c, m: mboScore(state, c.id) })).sort((a, b) => a.m.total - b.m.total);

  return (
    <>
      <PageHead kicker="Organization-centric roster management" title="Command Center">
        Every roster decision evaluated, justified, measured, and challenged when necessary.
      </PageHead>

      <div className="stats">
        <Stat label="Transfer window" value={window.open ? 'OPEN' : `${window.daysUntil} days`} note={`${fmt(window.start)} – ${fmt(window.end)}`} tone={window.daysUntil < 60 ? 'warn' : undefined} />
        <Stat label="Open escalations" value={openTriggers.length} note={`${openTriggers.filter((t) => t.severity === 'high').length} high severity`} tone={openTriggers.length ? 'bad' : 'good'} />
        <Stat label="Portal budget used" value={`${Math.round(portal.utilization * 100)}%`} note={`${money(portal.remaining)} unspent of ${money(portal.allocated)}`} tone={portal.utilization < 0.75 ? 'warn' : 'good'} />
        <Stat label="Audit disputes" value={disputes.length} note={disputes.map((d) => d.pos).join(', ') || 'None unresolved'} tone={disputes.length ? 'bad' : 'good'} />
      </div>

      <div className="grid-2">
        <Card title="Closed-loop management cycle" sub="Findings feed into the next planning cycle">
          <ol className="cycle">
            {steps.map((s, i) => (
              <li key={s.name} className={s.done ? 'done' : ''}>
                <span className="cycle-n">{s.done ? '✓' : i + 1}</span>
                <div>
                  <a href={`#/${s.link}`}>{s.name}</a>
                  <div className="muted small">{s.owner}</div>
                </div>
                <Badge tone={s.done ? 'good' : 'warn'}>{s.done ? 'Complete' : 'Open'}</Badge>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Top escalations" sub="Mandatory evaluations — not mandates to sign" actions={<a className="btn ghost" href="#/triggers">All →</a>}>
          {openTriggers.length === 0 && <p className="muted">No open escalations.</p>}
          <ul className="list esc-list">
            {openTriggers.slice(0, 6).map((t) => (
              <li key={t.id}>
                <Badge tone={t.severity === 'high' ? 'bad' : 'warn'}>{t.action}</Badge>
                <a href={`#/${t.link}`}>{t.title}</a>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid-3">
        <Card title="Budget allocation" sub={`${money(state.budget.total)} player-compensation budget`} actions={<a className="btn ghost" href="#/budget">Open →</a>}>
          {budget.map((b) => (
            <div key={b.bucket} className="bud-row">
              <div className="row between">
                <strong className="cap">{b.bucket}</strong>
                <span className="muted small">{money(b.spent)} / {money(b.allocated)}</span>
              </div>
              <Meter value={b.spent} max={b.allocated || 1} tone={b.utilization > 1 ? 'bad' : b.bucket === 'portal' && b.utilization < 0.75 ? 'warn' : 'accent'} label={b.bucket} />
            </div>
          ))}
        </Card>

        <Card title="Weakest position groups" sub="Independent audit grade (starters)" actions={<a className="btn ghost" href="#/audit">Audit →</a>}>
          <ul className="list">
            {weakest.map((a) => (
              <li key={a.pos} className="row between">
                <span><strong>{a.pos}</strong> <span className="muted small">{POS_LABEL[a.pos]}</span></span>
                <span className="row gap-s"><Badge tone={toneFor(a.auditGrade + 8)}>{a.auditGrade}</Badge><span className="muted small">#{a.accRank} ACC</span></span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Portal pipeline" sub="Identified → evaluated → contacted → acquired" actions={<a className="btn ghost" href="#/pipeline">Pipeline →</a>}>
          <div className="funnel">
            {(['identified', 'evaluated', 'contacted', 'acquired'] as const).map((k) => (
              <div key={k} className="funnel-row">
                <span className="cap small">{k}</span>
                <Meter value={funnel[k]} max={funnel.identified || 1} />
                <strong>{funnel[k]}</strong>
              </div>
            ))}
          </div>
          <p className="muted small">{funnel.lost} lost · {funnel.declined} declined</p>
        </Card>
      </div>

      <Card title="Coach evaluations (MBO)" sub="Lowest composite first — on-field 40%, development 25%, roster quality 20%, acquisition & retention 15%" actions={<a className="btn ghost" href="#/coaches">Scorecards →</a>}>
        <div className="coach-strip">
          {coaches.slice(0, 6).map(({ c, m }) => (
            <div key={c.id} className="coach-chip">
              <div className="small muted">{c.groups.join(', ')}</div>
              <div className="strong">{c.name || c.title}</div>
              <Meter value={m.total} max={100} tone={toneFor(m.total)} />
              <div className="row between small"><span>{m.rating}</span><strong>{m.total}</strong></div>
            </div>
          ))}
        </div>
      </Card>

      <Principle>
        “We aren’t requiring coaches to use the transfer portal. We’re requiring coaches to prove that their roster is the best it can
        reasonably be, given the talent and financial resources available. If it isn’t, they must present a measurable plan to improve it.”
      </Principle>
    </>
  );
}
