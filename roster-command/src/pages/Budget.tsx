import { useState } from 'react';
import { BUCKETS, budgetApproved, budgetSummary, computeTriggers, money, reallocationRule } from '../engine';
import { today, uid, useStore } from '../store';
import type { Bucket, Role } from '../types';
import { ROLE_LABEL } from '../types';
import { Badge, Card, Field, Gate, Meter, Modal, PageHead, Stat } from '../ui';

const QUESTIONS = [
  'Were there talented transfers available at positions of need?',
  'Did we evaluate and attempt to acquire those players?',
  'What prevented acquisitions: cost, fit, academics, player preference, or coaching decisions?',
  'Did the staff deliberately prioritize existing players despite evidence of a potential upgrade?',
  'What is the plan to address the remaining weaknesses?',
];

export default function BudgetPage() {
  const { state, update, can } = useStore();
  const rows = budgetSummary(state);
  const portal = rows.find((r) => r.bucket === 'portal')!;
  const unusedPct = portal.allocated ? (portal.remaining / portal.allocated) * 100 : 0;
  const weakFlags = computeTriggers(state).filter((t) => t.kind === 'acquisition' || t.kind === 'discrepancy');
  const justification = state.unusedJustifications.find((j) => j.season === state.settings.season);
  const needsJustify = unusedPct >= state.settings.unusedPortalThreshold && weakFlags.length > 0;
  const [pct, setPct] = useState(state.budget.pct);
  const [total, setTotal] = useState(state.budget.total);
  const [showRealloc, setShowRealloc] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const [answers, setAnswers] = useState<string[]>(justification?.answers ?? QUESTIONS.map(() => ''));
  const sum = pct.retention + pct.portal + pct.contingency;
  const dirty = total !== state.budget.total || BUCKETS.some((b) => pct[b] !== state.budget.pct[b]);

  return (
    <>
      <PageHead kicker="Initiative 1 & 5 · Departmental budgets + utilization reviews" title="Retention & Portal Budgets">
        Separate budgets force an intentional investment decision. Portal funds can’t be diverted into retention without a documented
        business justification and AD approval.
      </PageHead>

      <div className="stats">
        {rows.map((r) => (
          <Stat key={r.bucket} label={`${r.bucket} (${Math.round((r.allocated / state.budget.total) * 100)}%)`} value={money(r.allocated)} note={`${money(r.spent)} committed · ${money(r.remaining)} left`} tone={r.remaining < 0 ? 'bad' : r.bucket === 'portal' && r.utilization < 0.75 ? 'warn' : undefined} />
        ))}
        <Stat label="Approval status" value={budgetApproved(state) ? 'Approved' : 'Pending'} note={`Signed: ${state.budget.approvedBy.map((r) => ROLE_LABEL[r]).join(', ') || 'none'}`} tone={budgetApproved(state) ? 'good' : 'warn'} />
      </div>

      <div className="grid-2">
        <Card title="Annual allocation proposal" sub="GM proposes · AD and Head Coach approve">
          <Field label="Total player-compensation budget">
            <input type="number" step={100000} value={total} disabled={!can('GM')} onChange={(e) => setTotal(+e.target.value)} />
          </Field>
          {BUCKETS.map((b) => (
            <div key={b} className="slider-row">
              <span className="cap">{b}</span>
              <input type="range" min={0} max={100} value={pct[b]} disabled={!can('GM')} onChange={(e) => setPct({ ...pct, [b]: +e.target.value })} />
              <strong>{pct[b]}%</strong>
              <span className="muted small">{money((total * pct[b]) / 100)}</span>
            </div>
          ))}
          <p className={sum === 100 ? 'muted small' : 'error small'}>Total: {sum}% {sum !== 100 && '— must equal 100%'}</p>
          <div className="row gap-s wrap">
            <Gate roles={['GM']} what="Propose allocation">
              <button className="btn" disabled={!dirty || sum !== 100} onClick={() => update((d) => { d.budget.total = total; d.budget.pct = pct; d.budget.approvedBy = ['GM']; })}>
                Submit proposal
              </button>
            </Gate>
            {(['AD', 'HC'] as Role[]).map((r) => (
              <Gate key={r} roles={[r]} what={`${r} approval`}>
                <button className="btn secondary" disabled={state.budget.approvedBy.includes(r) || dirty} onClick={() => update((d) => { d.budget.approvedBy.push(r); })}>
                  {state.budget.approvedBy.includes(r) ? `${r} approved ✓` : `Approve as ${r}`}
                </button>
              </Gate>
            ))}
          </div>
          <p className="muted small">Funds must operate within applicable revenue-sharing caps and payment rules. Third-party NIL is not treated as guaranteed budget.</p>
        </Card>

        <Card title="Use It or Justify It" sub={`Required when ≥${state.settings.unusedPortalThreshold}% of portal funds are unused while weaknesses remain`}>
          <div className="row between">
            <div>
              <div className="big">{money(portal.remaining)}</div>
              <div className="muted small">allocated but unused ({Math.round(unusedPct)}%)</div>
            </div>
            <Badge tone={!needsJustify ? 'good' : justification ? (justification.adAction === 'corrective action required' ? 'bad' : 'accent') : 'bad'}>
              {!needsJustify ? 'Not required' : justification ? justification.adAction ?? 'Submitted — awaiting AD' : 'Justification required'}
            </Badge>
          </div>
          <Meter value={portal.spent} max={portal.allocated || 1} tone="warn" label="portal utilization" />
          {weakFlags.length > 0 && <p className="small">Open weakness flags: {[...new Set(weakFlags.map((w) => w.pos).filter(Boolean))].join(', ')}</p>}
          {needsJustify && (
            <div className="qa">
              {QUESTIONS.map((q, i) => (
                <Field key={q} label={`${i + 1}. ${q}`}>
                  <textarea rows={2} value={answers[i]} disabled={!can('GM', 'HC', 'COACH')} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
                </Field>
              ))}
              <div className="row gap-s wrap">
                <Gate roles={['GM', 'HC', 'COACH']} what="Submit justification">
                  <button className="btn" disabled={answers.some((a) => a.trim().length < 5)} onClick={() => update((d) => {
                    d.unusedJustifications = d.unusedJustifications.filter((j) => j.season !== d.settings.season);
                    d.unusedJustifications.push({ season: d.settings.season, answers, date: today() });
                  })}>Submit justification</button>
                </Gate>
                {justification && (
                  <Gate roles={['AD']} what="AD review">
                    <button className="btn secondary" onClick={() => update((d) => { d.unusedJustifications.find((j) => j.season === d.settings.season)!.adAction = 'accepted'; })}>Accept</button>
                    <button className="btn danger" onClick={() => update((d) => {
                      d.unusedJustifications.find((j) => j.season === d.settings.season)!.adAction = 'corrective action required';
                      d.committee.unshift({ id: uid('m'), date: today(), type: 'Escalation', title: 'Corrective action: unused portal funds', detail: `AD required corrective action — ${money(portal.remaining)} unused with open weaknesses.`, status: 'pending' });
                    })}>Require corrective action</button>
                  </Gate>
                )}
              </div>
              <p className="muted small">A defensible decision to preserve funds is better than an unnecessary acquisition.</p>
            </div>
          )}
        </Card>
      </div>

      <Card title="Reallocation requests" sub="Every change to the approved allocation is logged and approved by the AD" actions={<button className="btn" onClick={() => setShowRealloc(true)}>Request reallocation</button>}>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Move</th><th>Amount</th><th>Justification</th><th>Requested by</th><th>Status</th><th /></tr></thead>
          <tbody>
            {state.reallocations.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td className="cap">{r.from} → {r.to}</td>
                <td>{money(r.amount)}</td>
                <td className="wrap-cell">{r.justification}</td>
                <td>{ROLE_LABEL[r.requestedBy]}</td>
                <td><Badge tone={r.status === 'approved' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Badge></td>
                <td>
                  {r.status === 'pending' && (
                    <Gate roles={['AD']} what="Decide">
                      <div className="row gap-s">
                        <button className="btn small" disabled={!!reallocationRule(r.from, r.to, r.justification)} title={reallocationRule(r.from, r.to, r.justification) ?? ''} onClick={() => update((d) => { d.reallocations.find((x) => x.id === r.id)!.status = 'approved'; })}>Approve</button>
                        <button className="btn small danger" onClick={() => update((d) => { d.reallocations.find((x) => x.id === r.id)!.status = 'rejected'; })}>Reject</button>
                      </div>
                    </Gate>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {state.reallocations.some((r) => r.status === 'pending' && reallocationRule(r.from, r.to, r.justification)) && (
          <p className="error small">One or more pending requests lack the documented justification required to approve them.</p>
        )}
      </Card>

      <Card title="Commitments ledger" sub={`${state.transactions.length} entries`} actions={<Gate roles={['GM', 'FINANCE']} what="Add commitment"><button className="btn secondary" onClick={() => setShowTx(true)}>Add commitment</button></Gate>}>
        <div className="scroll-y">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Bucket</th><th>Description</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {[...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                <tr key={t.id}><td>{t.date}</td><td className="cap">{t.bucket}</td><td>{t.label}</td><td className="num">{money(t.amount, false)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showRealloc && <ReallocModal onClose={() => setShowRealloc(false)} />}
      {showTx && <TxModal onClose={() => setShowTx(false)} />}
    </>
  );
}

function ReallocModal({ onClose }: { onClose: () => void }) {
  const { state, update } = useStore();
  const [from, setFrom] = useState<Bucket>('portal');
  const [to, setTo] = useState<Bucket>('retention');
  const [amount, setAmount] = useState(250000);
  const [just, setJust] = useState('');
  const err = reallocationRule(from, to, just);
  return (
    <Modal title="Request budget reallocation" onClose={onClose}>
      <div className="form-grid">
        <Field label="From"><select value={from} onChange={(e) => setFrom(e.target.value as Bucket)}>{BUCKETS.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="To"><select value={to} onChange={(e) => setTo(e.target.value as Bucket)}>{BUCKETS.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Amount"><input type="number" step={50000} value={amount} onChange={(e) => setAmount(+e.target.value)} /></Field>
      </div>
      <Field label="Business justification" hint={from === 'portal' && to === 'retention' ? 'Portal → retention requires a documented justification and AD approval.' : undefined}>
        <textarea rows={4} value={just} onChange={(e) => setJust(e.target.value)} />
      </Field>
      {err && <p className="error small">{err}</p>}
      <div className="row gap-s end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!!err || amount <= 0} onClick={() => {
          update((d) => {
            d.reallocations.unshift({ id: uid('r'), from, to, amount, justification: just, requestedBy: state.role, date: today(), status: 'pending' });
            d.committee.unshift({ id: uid('m'), date: today(), type: 'Allocation change', title: `Shift ${money(amount)} ${from} → ${to}`, detail: just, status: 'pending' });
          });
          onClose();
        }}>Submit to AD</button>
      </div>
    </Modal>
  );
}

function TxModal({ onClose }: { onClose: () => void }) {
  const { update } = useStore();
  const [bucket, setBucket] = useState<Bucket>('portal');
  const [amount, setAmount] = useState(100000);
  const [label, setLabel] = useState('');
  return (
    <Modal title="Add commitment" onClose={onClose}>
      <div className="form-grid">
        <Field label="Bucket"><select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)}>{BUCKETS.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Amount"><input type="number" step={10000} value={amount} onChange={(e) => setAmount(+e.target.value)} /></Field>
      </div>
      <Field label="Description"><input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      <div className="row gap-s end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!label || amount <= 0} onClick={() => { update((d) => { d.transactions.push({ id: uid('t'), bucket, amount, label, date: today() }); }); onClose(); }}>Add</button>
      </div>
    </Modal>
  );
}
