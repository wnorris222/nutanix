import { useState } from 'react';
import { consecutivePoor } from '../engine';
import { today, uid, useStore } from '../store';
import type { Pos, QbrRating, Quarter, QuarterlyReview } from '../types';
import { POSITIONS, POS_LABEL, QUARTERS } from '../types';
import { Badge, Card, Field, Gate, Modal, PageHead } from '../ui';

const TONE: Record<QbrRating, 'good' | 'accent' | 'warn' | 'bad'> = { Exceeds: 'good', Meets: 'accent', Below: 'warn', Poor: 'bad' };

export default function ReviewsPage() {
  const { state, update } = useStore();
  const season = state.settings.season;
  const [edit, setEdit] = useState<{ pos: Pos; quarter: Quarter } | null>(null);
  const plans = POSITIONS.filter((p) => consecutivePoor(state, p));

  return (
    <>
      <PageHead kicker="Initiative 6 · Quarterly business reviews" title="Quarterly Roster Reviews">
        Each position coach presents a scorecard to the GM and head coach: what is working, what isn’t, and what actions are needed.
        Two consecutive poor evaluations automatically trigger an improvement plan.
      </PageHead>

      <Card title={`${season} review calendar`} sub="Click a cell to record or edit a review">
        <div className="scroll-x">
          <table className="tbl qbr">
            <thead>
              <tr><th>Group</th>{QUARTERS.map((q) => <th key={q.q}>{q.q}<div className="muted small">{q.label}</div></th>)}<th>Status</th></tr>
            </thead>
            <tbody>
              {POSITIONS.map((pos) => (
                <tr key={pos}>
                  <td><strong>{pos}</strong> <span className="muted small">{POS_LABEL[pos]}</span></td>
                  {QUARTERS.map((q) => {
                    const r = state.reviews.find((x) => x.pos === pos && x.quarter === q.q && x.season === season);
                    return (
                      <td key={q.q}>
                        <button className="cell-btn" onClick={() => setEdit({ pos, quarter: q.q })}>
                          {r ? <Badge tone={TONE[r.rating]}>{r.rating}</Badge> : <span className="muted small">+ add</span>}
                        </button>
                      </td>
                    );
                  })}
                  <td>{consecutivePoor(state, pos) ? <Badge tone="bad">Improvement plan</Badge> : <span className="muted small">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Automatic improvement plans" sub="Includes mandatory consideration of external talent">
          {plans.length === 0 && <p className="muted">No groups with consecutive poor reviews.</p>}
          {plans.map((pos) => {
            const key = `imp-${pos}-${season}`;
            const act = state.triggerActions[key];
            return (
              <div key={pos} className="decl flag">
                <strong>{POS_LABEL[pos]}</strong>
                <ul className="checklist small">
                  <li>Development plan with measurable grade targets for each returning player</li>
                  <li>High school recruiting adjustments for the next class</li>
                  <li><strong>Mandatory:</strong> Build vs. Buy analysis and portal target list (<a href="#buildbuy">open</a>)</li>
                  <li>Re-review at next quarter by the GM and head coach</li>
                </ul>
                <div className="row gap-s">
                  <Badge tone={act?.status === 'resolved' ? 'good' : 'warn'}>{act?.status ?? 'open'}</Badge>
                  <Gate roles={['HC', 'GM']} what="Acknowledge">
                    <button className="btn small secondary" onClick={() => update((d) => { d.triggerActions[key] = { status: 'in review', note: 'Improvement plan initiated', updated: today() }; })}>Start plan</button>
                  </Gate>
                </div>
              </div>
            );
          })}
        </Card>
        <Card title="Review objectives">
          <table className="tbl">
            <tbody>{QUARTERS.map((q) => <tr key={q.q}><td><strong>{q.q}</strong></td><td>{q.label}</td><td className="muted small">{q.objective}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>

      {edit && <ReviewModal {...edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ReviewModal({ pos, quarter, onClose }: { pos: Pos; quarter: Quarter; onClose: () => void }) {
  const { state, update } = useStore();
  const season = state.settings.season;
  const existing = state.reviews.find((x) => x.pos === pos && x.quarter === quarter && x.season === season);
  const [r, setR] = useState<QuarterlyReview>(existing ?? { id: uid('q'), season, quarter, pos, rating: 'Meets', working: '', notWorking: '', actions: '' });
  const q = QUARTERS.find((x) => x.q === quarter)!;
  return (
    <Modal title={`${POS_LABEL[pos]} · ${quarter} ${season}`} onClose={onClose}>
      <p className="muted small">{q.label}: {q.objective}</p>
      <Field label="Rating">
        <select value={r.rating} onChange={(e) => setR({ ...r, rating: e.target.value as QbrRating })}>{(['Exceeds', 'Meets', 'Below', 'Poor'] as QbrRating[]).map((x) => <option key={x}>{x}</option>)}</select>
      </Field>
      <Field label="What is working"><textarea rows={2} value={r.working} onChange={(e) => setR({ ...r, working: e.target.value })} /></Field>
      <Field label="What isn’t"><textarea rows={2} value={r.notWorking} onChange={(e) => setR({ ...r, notWorking: e.target.value })} /></Field>
      <Field label="Actions needed"><textarea rows={2} value={r.actions} onChange={(e) => setR({ ...r, actions: e.target.value })} /></Field>
      <div className="row gap-s end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <Gate roles={['GM', 'HC', 'COACH']} what="Save review">
          <button className="btn" onClick={() => { update((d) => { d.reviews = [...d.reviews.filter((x) => x.id !== r.id), r]; }); onClose(); }}>Save</button>
        </Gate>
      </div>
    </Modal>
  );
}
