import { useState } from 'react';
import { budgetSummary, declineNeedsExplanation, isUpgrade, money, nextTransferWindow, pipelineFunnel, starters } from '../engine';
import { today, uid, useStore } from '../store';
import type { DeclineReason, LossReason, Pos, Prospect } from '../types';
import { POSITIONS, POS_LABEL, STAGES } from '../types';
import { Badge, Card, Field, Gate, Meter, Modal, PageHead, Stat } from '../ui';

const LOSS: LossReason[] = ['scouting', 'delayed decision', 'recruiting execution', 'financial', 'player preference'];
const DECLINE: DeclineReason[] = ['affordability', 'scheme fit', 'eligibility', 'current players better value', 'character / academics', 'other'];

export default function PipelinePage() {
  const { state, update } = useStore();
  const [view, setView] = useState<'board' | 'closed'>('board');
  const [posF, setPosF] = useState<Pos | 'ALL'>('ALL');
  const [adding, setAdding] = useState(false);
  const [modal, setModal] = useState<{ p: Prospect; kind: 'lost' | 'declined' } | null>(null);
  const portal = budgetSummary(state).find((b) => b.bucket === 'portal')!;
  const funnel = pipelineFunnel(state);
  const win = nextTransferWindow(new Date());
  const active = state.prospects.filter((p) => p.outcome === 'active' && (posF === 'ALL' || p.pos === posF));
  const closed = state.prospects.filter((p) => p.outcome !== 'active' && (posF === 'ALL' || p.pos === posF));
  const lossCounts = LOSS.map((r) => ({ r, n: state.prospects.filter((p) => p.lossReason === r).length }));

  const commit = (p: Prospect) => update((d) => {
    const x = d.prospects.find((y) => y.id === p.id)!;
    x.outcome = 'committed';
    x.stage = 5;
    const comp = x.offerComp ?? x.askComp;
    const pid = uid('p');
    const best = starters(d, p.pos);
    d.players.push({
      id: pid, name: x.name, pos: x.pos, year: 'SR', source: 'Portal', status: 'Active', depth: 1, coachGrade: x.projectedGrade, auditGrade: x.projectedGrade,
      history: [], compensation: comp, priorityRetention: false, injuries: 0, snapPct: 0,
      acquisition: { prospectId: x.id, projectedGrade: x.projectedGrade, replacedGrade: best[best.length - 1]?.auditGrade ?? 0, season: d.settings.season },
    });
    d.transactions.push({ id: uid('t'), bucket: 'portal', amount: comp, label: `Portal acquisition: ${x.name} (${x.pos})`, date: today(), prospectId: x.id, playerId: pid });
  });

  return (
    <>
      <PageHead kicker="Initiatives 8 & 9 · Acquisition pipeline" title="Transfer Portal Pipeline">
        A live database of potential acquisitions — maintained year-round, not started when the window opens. Declining a qualified
        opportunity at a position of need requires a documented explanation.
      </PageHead>

      <div className="stats">
        <Stat label="Window opens" value={win.open ? 'OPEN NOW' : `${win.daysUntil} days`} note="10-day window after Jan 1" tone={win.daysUntil < 60 ? 'warn' : undefined} />
        <Stat label="Portal funds available" value={money(portal.remaining)} note={`of ${money(portal.allocated)}`} />
        <Stat label="Evaluated" value={`${funnel.evaluated}/${funnel.identified}`} note="qualified candidates" />
        <Stat label="Acquired" value={funnel.acquired} note={`${funnel.lost} lost · ${funnel.declined} declined`} />
      </div>

      <div className="row between wrap gap-s">
        <div className="tabs">
          <button className={`tab ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')}>Active board</button>
          <button className={`tab ${view === 'closed' ? 'active' : ''}`} onClick={() => setView('closed')}>Outcomes & explanations</button>
        </div>
        <div className="row gap-s">
          <select value={posF} onChange={(e) => setPosF(e.target.value as Pos | 'ALL')} aria-label="Filter position"><option value="ALL">All positions</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select>
          <Gate roles={['SCOUT', 'GM', 'COACH']} what="Add"><button className="btn" onClick={() => setAdding(true)}>Add prospect</button></Gate>
        </div>
      </div>

      {view === 'board' && (
        <div className="kanban">
          {STAGES.slice(0, 5).map((stage, i) => (
            <div key={stage} className="col">
              <div className="col-h"><span>{i + 1}. {stage}</span><span className="muted">{active.filter((p) => p.stage === i).length}</span></div>
              {active.filter((p) => p.stage === i).map((p) => {
                const upgrade = isUpgrade(state, p.pos, p.projectedGrade);
                const afford = p.askComp <= portal.remaining;
                return (
                  <div key={p.id} className="pcard">
                    <div className="row between"><strong>{p.name}</strong><Badge tone="purple">{p.pos}</Badge></div>
                    <div className="muted small">{p.prevSchool}</div>
                    <div className="row gap-s wrap small">
                      <span>Proj. <strong>{p.projectedGrade}</strong></span>
                      <span>Ask <strong>{money(p.askComp)}</strong></span>
                    </div>
                    <div className="row gap-s wrap">
                      {upgrade && <Badge tone="good">Upgrade</Badge>}
                      {p.priority && <Badge tone="accent">Priority</Badge>}
                      {!p.evaluated && <Badge tone="warn">Not evaluated</Badge>}
                      {!afford && <Badge tone="bad">Over budget</Badge>}
                    </div>
                    {p.notes && <div className="small muted">{p.notes}</div>}
                    <div className="pcard-a">
                      <Gate roles={['SCOUT', 'GM', 'COACH']} what="Move">
                        {!p.evaluated && <button className="btn small ghost" onClick={() => update((d) => { d.prospects.find((x) => x.id === p.id)!.evaluated = true; })}>Mark evaluated</button>}
                        {i > 0 && <button className="btn small ghost" onClick={() => update((d) => { d.prospects.find((x) => x.id === p.id)!.stage--; })}>←</button>}
                        {i < 4 && <button className="btn small ghost" disabled={i === 0 && !p.evaluated} onClick={() => update((d) => { d.prospects.find((x) => x.id === p.id)!.stage++; })}>→</button>}
                        {i === 4 && <button className="btn small" onClick={() => commit(p)}>Commit</button>}
                        <button className="btn small ghost" onClick={() => setModal({ p, kind: 'lost' })}>Lost</button>
                        <button className="btn small ghost" onClick={() => setModal({ p, kind: 'declined' })}>Decline</button>
                      </Gate>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {view === 'closed' && (
        <div className="grid-2">
          <Card title="Declined opportunities" sub="Coaches document why; GM reviews; material disagreements go to the committee">
            {closed.filter((p) => p.outcome === 'declined').map((p) => {
              const missing = declineNeedsExplanation(state, p.id);
              return (
                <div key={p.id} className={`decl ${missing ? 'flag' : ''}`}>
                  <div className="row between"><strong>{p.name} · {p.pos}</strong>{isUpgrade(state, p.pos, p.projectedGrade) && <Badge tone="good">Would upgrade starter</Badge>}</div>
                  <div className="small muted">Proj. {p.projectedGrade} · ask {money(p.askComp)} · {p.prevSchool}</div>
                  <div className="small">Reason: <strong>{p.decline?.reason}</strong></div>
                  {missing ? (
                    <div className="row gap-s"><Badge tone="bad">Explanation required</Badge><Gate roles={['COACH', 'HC', 'GM']} what="Document"><button className="btn small" onClick={() => setModal({ p, kind: 'declined' })}>Document</button></Gate></div>
                  ) : (
                    <>
                      <p className="small quote">“{p.decline!.explanation}”</p>
                      <div className="row gap-s wrap">
                        {p.decline!.gmReviewed ? <Badge tone="good">GM reviewed</Badge> : <Gate roles={['GM']} what="Review"><button className="btn small secondary" onClick={() => update((d) => { d.prospects.find((x) => x.id === p.id)!.decline!.gmReviewed = true; })}>Mark GM reviewed</button></Gate>}
                        {p.decline!.escalated ? <Badge tone="purple">Escalated</Badge> : <Gate roles={['GM']} what="Escalate"><button className="btn small ghost" onClick={() => update((d) => {
                          const x = d.prospects.find((y) => y.id === p.id)!; x.decline!.escalated = true; x.decline!.gmReviewed = true;
                          d.committee.unshift({ id: uid('m'), date: today(), type: 'Declined opportunity', title: `Declined ${x.name} (${x.pos})`, detail: `${x.decline!.reason}: ${x.decline!.explanation}`, coachPosition: x.decline!.explanation, gmPosition: `Projected ${x.projectedGrade} vs. weakest starter ${starters(d, x.pos).slice(-1)[0]?.auditGrade}.`, status: 'pending' });
                        })}>Escalate to HC + AD</button></Gate>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {!closed.some((p) => p.outcome === 'declined') && <p className="muted">None.</p>}
          </Card>

          <div className="stack">
            <Card title="Why acquisitions failed" sub="Scouting, delayed decisions, execution, financial limits, or player preference">
              {lossCounts.map(({ r, n }) => (
                <div key={r} className="funnel-row"><span className="cap small">{r}</span><Meter value={n} max={Math.max(1, ...lossCounts.map((x) => x.n))} tone="bad" /><strong>{n}</strong></div>
              ))}
            </Card>
            <Card title="Committed & lost">
              <ul className="list">
                {closed.filter((p) => p.outcome !== 'declined').map((p) => (
                  <li key={p.id} className="row between">
                    <span><strong>{p.name}</strong> <span className="muted small">{p.pos} · {money(p.offerComp ?? p.askComp)}</span></span>
                    {p.outcome === 'committed' ? <Badge tone="good">Committed</Badge> : <Badge tone="bad">Lost: {p.lossReason}</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {adding && <AddProspect onClose={() => setAdding(false)} />}
      {modal && <CloseModal {...modal} onClose={() => setModal(null)} />}
    </>
  );
}

function CloseModal({ p, kind, onClose }: { p: Prospect; kind: 'lost' | 'declined'; onClose: () => void }) {
  const { state, update } = useStore();
  const [loss, setLoss] = useState<LossReason>('player preference');
  const [reason, setReason] = useState<DeclineReason>(p.decline?.reason ?? 'scheme fit');
  const [text, setText] = useState(p.decline?.explanation ?? '');
  const upgrade = isUpgrade(state, p.pos, p.projectedGrade);
  return (
    <Modal title={kind === 'lost' ? `Mark ${p.name} lost` : `Decline ${p.name}`} onClose={onClose}>
      {kind === 'lost' ? (
        <Field label="Where did it break down?"><select value={loss} onChange={(e) => setLoss(e.target.value as LossReason)}>{LOSS.map((r) => <option key={r}>{r}</option>)}</select></Field>
      ) : (
        <>
          {upgrade && <div className="callout warn">This player projects above the weakest current {POS_LABEL[p.pos]} starter. A documented, evidence-based explanation is required and the GM will review it.</div>}
          <Field label="Reason"><select value={reason} onChange={(e) => setReason(e.target.value as DeclineReason)}>{DECLINE.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Documented explanation" hint="20+ characters. Cite evidence: grades, fit, cost, eligibility."><textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        </>
      )}
      <div className="row gap-s end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={kind === 'declined' && text.trim().length < 20} onClick={() => {
          update((d) => {
            const x = d.prospects.find((y) => y.id === p.id)!;
            if (kind === 'lost') { x.outcome = 'lost'; x.lossReason = loss; }
            else { x.outcome = 'declined'; x.decline = { reason, explanation: text, by: d.role, gmReviewed: false, escalated: false }; }
          });
          onClose();
        }}>Save</button>
      </div>
    </Modal>
  );
}

function AddProspect({ onClose }: { onClose: () => void }) {
  const { update } = useStore();
  const [f, setF] = useState({ name: '', pos: 'OL' as Pos, prevSchool: '', projectedGrade: 78, askComp: 300000, priority: true, notes: '' });
  return (
    <Modal title="Add prospect" onClose={onClose}>
      <div className="form-grid">
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Position"><select value={f.pos} onChange={(e) => setF({ ...f, pos: e.target.value as Pos })}>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Previous school"><input value={f.prevSchool} onChange={(e) => setF({ ...f, prevSchool: e.target.value })} /></Field>
        <Field label="Projected grade"><input type="number" value={f.projectedGrade} onChange={(e) => setF({ ...f, projectedGrade: +e.target.value })} /></Field>
        <Field label="Compensation ask"><input type="number" step={25000} value={f.askComp} onChange={(e) => setF({ ...f, askComp: +e.target.value })} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.priority} onChange={(e) => setF({ ...f, priority: e.target.checked })} /> Priority target</label>
      <Field label="Notes"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <p className="muted small">Use only permitted scouting information. Contact only once the player is eligible and permissions allow.</p>
      <div className="row gap-s end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!f.name} onClick={() => { update((d) => { d.prospects.push({ id: uid('x'), ...f, stage: 0, evaluated: false, outcome: 'active' }); }); onClose(); }}>Add</button>
      </div>
    </Modal>
  );
}
