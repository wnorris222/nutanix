import { useState } from 'react';
import { buildNeedsRevisit, expectedValue, groupPlayers, money, recommend } from '../engine';
import { today, uid, useStore } from '../store';
import type { BuildBuy, Pos, Risk } from '../types';
import { POSITIONS, POS_LABEL } from '../types';
import { Badge, Card, Empty, Field, Gate, Modal, PageHead } from '../ui';

const RISKS: Risk[] = ['Low', 'Medium', 'Medium-high', 'High'];

export default function BuildBuyPage() {
  const { state } = useStore();
  const [editing, setEditing] = useState<BuildBuy | 'new' | null>(null);
  const covered = new Set(state.buildBuy.filter((b) => b.season === state.settings.season).map((b) => b.pos));
  const missing = state.groups.filter((g) => g.critical && !covered.has(g.pos));

  return (
    <>
      <PageHead kicker="Initiative 4 · Make vs. buy" title="Build vs. Buy Analysis">
        Before each portal window, every position presents two options: develop a current player, or acquire an experienced transfer.
        If a build decision falls behind projection, it is automatically revisited.
      </PageHead>

      {missing.length > 0 && (
        <div className="callout warn">Critical positions without a {state.settings.season} analysis: <strong>{missing.map((m) => m.pos).join(', ')}</strong></div>
      )}

      <div className="row end"><Gate roles={['COACH', 'GM']} what="New analysis"><button className="btn" onClick={() => setEditing('new')}>New analysis</button></Gate></div>

      {state.buildBuy.length === 0 && <Empty>No analyses yet.</Empty>}
      {state.buildBuy.map((b) => <Analysis key={b.id} b={b} onEdit={() => setEditing(b)} />)}
      {editing && <Editor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Analysis({ b, onEdit }: { b: BuildBuy; onEdit: () => void }) {
  const { state, update } = useStore();
  const player = state.players.find((p) => p.id === b.buildPlayerId);
  const prospect = state.prospects.find((p) => p.id === b.buyProspectId);
  const eb = expectedValue(b.build, state.settings.season);
  const ey = expectedValue(b.buy, state.settings.season);
  const rec = recommend(b, state.settings.season);
  const revisit = buildNeedsRevisit(state, b);
  const rows: [string, string, string][] = [
    ['Option', player ? `${player.name} (${player.year}, audit ${player.auditGrade})` : '—', prospect ? `${prospect.name} (${prospect.prevSchool}, proj. ${prospect.projectedGrade})` : 'Unnamed transfer'],
    ['Expected readiness', String(b.build.readyYear), String(b.buy.readyYear)],
    ['Development risk', b.build.risk, b.buy.risk],
    ['Incremental compensation', money(b.build.cost), money(b.buy.cost)],
    ['Short-term impact (1-5)', '●'.repeat(b.build.impact) + '○'.repeat(5 - b.build.impact), '●'.repeat(b.buy.impact) + '○'.repeat(5 - b.buy.impact)],
    ['Expected value', String(eb.value), String(ey.value)],
    ['Value per $100K', String(eb.perDollar), String(ey.perDollar)],
  ];
  return (
    <Card
      title={`${POS_LABEL[b.pos]} · ${b.season}`}
      sub={b.decision === 'pending' ? 'Decision pending' : `Decision: ${b.decision.toUpperCase()}${b.rationale ? ` — ${b.rationale}` : ''}`}
      actions={<>
        {revisit && <Badge tone="bad">Revisit — behind projection</Badge>}
        <Badge tone={rec === 'buy' ? 'purple' : 'accent'}>Model favors {rec}</Badge>
        <Gate roles={['COACH', 'GM']} what="Edit"><button className="btn ghost small" onClick={onEdit}>Edit</button></Gate>
      </>}
    >
      <div className="scroll-x">
        <table className="tbl bvb">
          <thead><tr><th>Criteria</th><th>Develop current player</th><th>Acquire transfer</th></tr></thead>
          <tbody>{rows.map(([c, x, y]) => <tr key={c}><td className="muted">{c}</td><td>{x}</td><td>{y}</td></tr>)}</tbody>
        </table>
      </div>
      {b.decision === 'build' && player && (
        <p className="small">Projection checkpoint: {player.name} must reach <strong>{b.projectedGradeAtReview}</strong> by next roster review — currently <strong className={revisit ? 'error' : ''}>{player.auditGrade}</strong>.</p>
      )}
      {b.decision !== 'pending' && b.decision !== rec && (
        <div className="callout warn">Decision differs from the expected-value model. The rationale is recorded for the next roster review.</div>
      )}
      {b.decision === 'pending' && (
        <div className="row gap-s wrap">
          <Gate roles={['GM', 'HC']} what="Decide">
            <button className="btn secondary" onClick={() => update((d) => { const x = d.buildBuy.find((y) => y.id === b.id)!; x.decision = 'build'; if (!x.rationale) x.rationale = 'Develop current player.'; })}>Decide: Build</button>
            <button className="btn" onClick={() => update((d) => {
              const x = d.buildBuy.find((y) => y.id === b.id)!; x.decision = 'buy'; if (!x.rationale) x.rationale = 'Acquire transfer.';
              const p = d.prospects.find((y) => y.id === b.buyProspectId);
              if (p && p.stage < 2) p.stage = 2;
              d.committee.unshift({ id: uid('m'), date: today(), type: 'Strategy approval', title: `Buy decision: ${POS_LABEL[b.pos]}`, detail: `Approve acquisition budget of ${money(b.buy.cost)} for ${p?.name ?? 'transfer'}.`, status: 'pending' });
            })}>Decide: Buy</button>
          </Gate>
        </div>
      )}
    </Card>
  );
}

function Editor({ initial, onClose }: { initial: BuildBuy | null; onClose: () => void }) {
  const { state, update } = useStore();
  const [b, setB] = useState<BuildBuy>(initial ?? {
    id: uid('b'), pos: 'OL', season: state.settings.season, buildPlayerId: '', buyProspectId: '',
    build: { readyYear: state.settings.season + 2, risk: 'Medium', cost: 100000, impact: 3 },
    buy: { readyYear: state.settings.season + 1, risk: 'Medium', cost: 500000, impact: 4 },
    decision: 'pending', rationale: '', projectedGradeAtReview: 72,
  });
  const players = groupPlayers(state, b.pos);
  const prospects = state.prospects.filter((p) => p.pos === b.pos && p.outcome !== 'declined');
  const side = (k: 'build' | 'buy') => (
    <fieldset className="fs">
      <legend>{k === 'build' ? 'Build (develop)' : 'Buy (acquire)'}</legend>
      <div className="form-grid">
        <Field label="Ready year"><input type="number" value={b[k].readyYear} onChange={(e) => setB({ ...b, [k]: { ...b[k], readyYear: +e.target.value } })} /></Field>
        <Field label="Risk"><select value={b[k].risk} onChange={(e) => setB({ ...b, [k]: { ...b[k], risk: e.target.value as Risk } })}>{RISKS.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Incremental cost"><input type="number" step={25000} value={b[k].cost} onChange={(e) => setB({ ...b, [k]: { ...b[k], cost: +e.target.value } })} /></Field>
        <Field label="Impact (1-5)"><input type="number" min={1} max={5} value={b[k].impact} onChange={(e) => setB({ ...b, [k]: { ...b[k], impact: Math.max(1, Math.min(5, +e.target.value)) } })} /></Field>
      </div>
    </fieldset>
  );
  return (
    <Modal title={initial ? 'Edit analysis' : 'New Build vs. Buy analysis'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Position"><select value={b.pos} onChange={(e) => setB({ ...b, pos: e.target.value as Pos, buildPlayerId: '', buyProspectId: '' })}>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Current player"><select value={b.buildPlayerId} onChange={(e) => setB({ ...b, buildPlayerId: e.target.value })}><option value="">Select…</option>{players.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.auditGrade})</option>)}</select></Field>
        <Field label="Transfer target"><select value={b.buyProspectId} onChange={(e) => setB({ ...b, buyProspectId: e.target.value })}><option value="">Unnamed / TBD</option>{prospects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.projectedGrade})</option>)}</select></Field>
        <Field label="Projected grade at next review"><input type="number" value={b.projectedGradeAtReview} onChange={(e) => setB({ ...b, projectedGradeAtReview: +e.target.value })} /></Field>
      </div>
      {side('build')}
      {side('buy')}
      <Field label="Rationale"><textarea rows={2} value={b.rationale} onChange={(e) => setB({ ...b, rationale: e.target.value })} /></Field>
      <div className="row gap-s end">
        {initial && <button className="btn danger ghost" onClick={() => { update((d) => { d.buildBuy = d.buildBuy.filter((x) => x.id !== b.id); }); onClose(); }}>Delete</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!b.buildPlayerId} onClick={() => { update((d) => { d.buildBuy = [...d.buildBuy.filter((x) => x.id !== b.id), b]; }); onClose(); }}>Save</button>
      </div>
    </Modal>
  );
}
