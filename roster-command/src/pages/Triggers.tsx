import { useState } from 'react';
import { computeTriggers, type Trigger } from '../engine';
import { today, uid, useStore } from '../store';
import { Badge, Card, Field, Modal, PageHead } from '../ui';

const RULES = [
  ['Group ranks in the bottom third of the conference', 'Acquisition review'],
  ['Position lacks required game-ready depth', 'Depth assessment'],
  ['Group games missed to injury ≥ threshold', 'Additional roster planning'],
  ['Development rate below ⅔ of target', 'Independent assessment'],
  ['Coach vs. audit grade gap ≥ threshold', 'Formal review (GM resolves)'],
  ['Two consecutive poor quarterly reviews', 'Improvement plan'],
  ['Portal budget unused with open weaknesses', 'Use It or Justify It'],
  ['Qualified prospect declined without explanation', 'Documented rationale'],
  ['Build decision behind projection', 'Revisit Build vs. Buy'],
];

export default function TriggersPage() {
  const { state } = useStore();
  const triggers = computeTriggers(state);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [acting, setActing] = useState<Trigger | null>(null);
  const shown = triggers.filter((t) => filter === 'all' || state.triggerActions[t.id]?.status !== 'resolved');

  return (
    <>
      <PageHead kicker="Initiative 7 · Risk thresholds & automated escalation" title="Escalations">
        Predefined triggers replace subjective opinions about when help is needed. They aren’t mandates to sign transfers — they are
        mandatory evaluations that can’t simply be disregarded. Closing one requires a documented note. The GM owns escalation.
      </PageHead>

      <div className="row between wrap gap-s">
        <div className="tabs">
          <button className={`tab ${filter === 'open' ? 'active' : ''}`} onClick={() => setFilter('open')}>Open ({triggers.filter((t) => state.triggerActions[t.id]?.status !== 'resolved').length})</button>
          <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All ({triggers.length})</button>
        </div>
      </div>

      <Card>
        {shown.length === 0 && <p className="muted">Nothing open. Triggers re-evaluate automatically as data changes.</p>}
        <ul className="trig-list">
          {shown.map((t) => {
            const a = state.triggerActions[t.id];
            return (
              <li key={t.id} className={`trig ${t.severity}`}>
                <div className="trig-main">
                  <div className="row gap-s wrap">
                    <Badge tone={t.severity === 'high' ? 'bad' : 'warn'}>{t.severity}</Badge>
                    <Badge tone="purple">{t.action}</Badge>
                    <span className="muted small">Owner: {t.owner}</span>
                  </div>
                  <a href={`#/${t.link}`} className="trig-t">{t.title}</a>
                  <div className="muted small">{t.detail}</div>
                  {a?.note && <div className="small quote">“{a.note}” — {a.updated}</div>}
                </div>
                <div className="trig-side">
                  <Badge tone={a?.status === 'resolved' ? 'good' : a?.status === 'in review' ? 'accent' : 'neutral'}>{a?.status ?? 'open'}</Badge>
                  <button className="btn small secondary" onClick={() => setActing(t)}>Update</button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Trigger rules" sub="Thresholds are configurable in Settings">
        <table className="tbl"><thead><tr><th>Condition</th><th>Required evaluation</th></tr></thead>
          <tbody>{RULES.map(([c, e]) => <tr key={c}><td>{c}</td><td>{e}</td></tr>)}</tbody>
        </table>
      </Card>

      {acting && <ActModal t={acting} onClose={() => setActing(null)} />}
    </>
  );
}

function ActModal({ t, onClose }: { t: Trigger; onClose: () => void }) {
  const { state, update, can } = useStore();
  const cur = state.triggerActions[t.id];
  const [status, setStatus] = useState(cur?.status ?? 'in review');
  const [note, setNote] = useState(cur?.note ?? '');
  const mayResolve = can('GM', 'AD', 'HC');
  return (
    <Modal title={t.action} onClose={onClose}>
      <p><strong>{t.title}</strong></p>
      <Field label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">Open</option>
          <option value="in review">In review</option>
          <option value="resolved" disabled={!mayResolve}>Resolved{!mayResolve ? ' (GM / HC / AD only)' : ''}</option>
        </select>
      </Field>
      <Field label="Findings & action taken" hint="Required to close. Document the evidence, decision, and owner.">
        <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="row gap-s end wrap">
        <button className="btn ghost" onClick={() => {
          update((d) => { d.committee.unshift({ id: uid('m'), date: today(), type: 'Escalation', title: t.title, detail: `${t.action}. ${t.detail}${note ? ` Note: ${note}` : ''}`, status: 'pending' }); });
          onClose();
        }}>Send to committee</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={status === 'resolved' && note.trim().length < 20} onClick={() => { update((d) => { d.triggerActions[t.id] = { status, note, updated: today() }; }); onClose(); }}>Save</button>
      </div>
    </Modal>
  );
}
