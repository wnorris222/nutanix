import { useState } from 'react';
import { today, uid, useStore } from '../store';
import type { CommitteeItem } from '../types';
import { Badge, Card, Field, Gate, Modal, PageHead } from '../ui';

const MEMBERS = [
  ['Athletic Director', 'Sets objectives, approves overall funding, reviews exceptions'],
  ['Head Coach', 'Owns football strategy and final football evaluations'],
  ['General Manager', 'Leads roster planning and budget execution'],
  ['Personnel / Scouting Director', 'Delivers independent talent assessments'],
  ['Finance / Compliance', 'Validates affordability and compliance'],
  ['Independent reviewer (AD-appointed)', 'Reviews committee decisions from outside the coaching chain'],
];

const TYPES: CommitteeItem['type'][] = ['Strategy approval', 'Allocation change', 'Disagreement', 'GM direct recommendation', 'Declined opportunity', 'Escalation'];

export default function CommitteePage() {
  const { state, update } = useStore();
  const [deciding, setDeciding] = useState<CommitteeItem | null>(null);
  const [adding, setAdding] = useState(false);
  const pending = state.committee.filter((c) => c.status === 'pending');
  const done = state.committee.filter((c) => c.status !== 'pending');

  return (
    <>
      <PageHead kicker="Initiative 12 · Investment committee" title="Executive Roster Committee">
        Approves the annual roster investment strategy, reviews significant allocation changes, and settles major disagreements. The GM
        has a formal channel to present recommendations directly to the AD — including when the coaching staff disagrees.
      </PageHead>

      <div className="grid-2">
        <Card title={`Agenda · ${pending.length} pending`} actions={<Gate roles={['GM']} what="GM direct recommendation"><button className="btn" onClick={() => setAdding(true)}>GM recommendation to AD</button></Gate>}>
          {pending.length === 0 && <p className="muted">Nothing on the agenda.</p>}
          {pending.map((c) => <Item key={c.id} c={c} onDecide={() => setDeciding(c)} />)}
        </Card>
        <Card title="Membership">
          <table className="tbl"><tbody>{MEMBERS.map(([r, d]) => <tr key={r}><td><strong>{r}</strong></td><td className="muted small">{d}</td></tr>)}</tbody></table>
        </Card>
      </div>

      <Card title="Decision log" sub="Every material roster decision has a documented rationale">
        {done.length === 0 && <p className="muted">No decisions yet.</p>}
        {done.map((c) => <Item key={c.id} c={c} />)}
      </Card>

      {deciding && <Decide c={deciding} onClose={() => setDeciding(null)} />}
      {adding && (
        <NewItem onClose={() => setAdding(false)} onSave={(item) => update((d) => { d.committee.unshift(item); })} />
      )}
    </>
  );
}

function Item({ c, onDecide }: { c: CommitteeItem; onDecide?: () => void }) {
  return (
    <div className="decl">
      <div className="row between wrap gap-s">
        <div className="row gap-s wrap"><Badge tone="purple">{c.type}</Badge><span className="muted small">{c.date}</span></div>
        <Badge tone={c.status === 'approved' || c.status === 'resolved' ? 'good' : c.status === 'rejected' ? 'bad' : 'warn'}>{c.status}</Badge>
      </div>
      <strong>{c.title}</strong>
      <div className="small">{c.detail}</div>
      {(c.coachPosition || c.gmPosition) && (
        <div className="positions">
          {c.coachPosition && <div><span className="muted small">Coaching staff</span><div className="small">{c.coachPosition}</div></div>}
          {c.gmPosition && <div><span className="muted small">General Manager</span><div className="small">{c.gmPosition}</div></div>}
        </div>
      )}
      {c.decisionNote && <div className="small quote">Decision: {c.decisionNote}</div>}
      {onDecide && <Gate roles={['AD']} what="Decide"><button className="btn small" onClick={onDecide}>Record decision</button></Gate>}
    </div>
  );
}

function Decide({ c, onClose }: { c: CommitteeItem; onClose: () => void }) {
  const { update } = useStore();
  const [status, setStatus] = useState<CommitteeItem['status']>('approved');
  const [note, setNote] = useState('');
  return (
    <Modal title={c.title} onClose={onClose}>
      <Field label="Outcome">
        <select value={status} onChange={(e) => setStatus(e.target.value as CommitteeItem['status'])}>
          <option value="approved">Approved</option><option value="rejected">Rejected</option><option value="resolved">Resolved</option>
        </select>
      </Field>
      <Field label="Decision rationale"><textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="row gap-s end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={note.trim().length < 10} onClick={() => {
          update((d) => {
            const x = d.committee.find((y) => y.id === c.id)!;
            x.status = status; x.decisionNote = note;
            // Keep linked reallocation requests in sync.
            if (c.type === 'Allocation change') {
              const r = d.reallocations.find((r) => r.status === 'pending' && c.title.includes(`${r.from} → ${r.to}`));
              if (r && status !== 'resolved') r.status = status === 'approved' ? 'approved' : 'rejected';
            }
          });
          onClose();
        }}>Save decision</button>
      </div>
    </Modal>
  );
}

function NewItem({ onClose, onSave }: { onClose: () => void; onSave: (c: CommitteeItem) => void }) {
  const [type, setType] = useState<CommitteeItem['type']>('GM direct recommendation');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [coach, setCoach] = useState('');
  const [gm, setGm] = useState('');
  return (
    <Modal title="Submit to committee" onClose={onClose}>
      <Field label="Type"><select value={type} onChange={(e) => setType(e.target.value as CommitteeItem['type'])}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Recommendation"><textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
      <div className="form-grid">
        <Field label="Coaching staff position"><textarea rows={2} value={coach} onChange={(e) => setCoach(e.target.value)} /></Field>
        <Field label="GM position"><textarea rows={2} value={gm} onChange={(e) => setGm(e.target.value)} /></Field>
      </div>
      <div className="row gap-s end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!title || !detail} onClick={() => { onSave({ id: uid('m'), date: today(), type, title, detail, coachPosition: coach || undefined, gmPosition: gm || undefined, status: 'pending' }); onClose(); }}>Submit</button>
      </div>
    </Modal>
  );
}
