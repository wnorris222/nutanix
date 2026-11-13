import { useState } from 'react';
import { auditGroup, groupPlayers, money, tier } from '../engine';
import { uid, useStore } from '../store';
import type { ClassYear, Pos } from '../types';
import { POSITIONS, POS_LABEL } from '../types';
import { Badge, Card, Field, Gate, Meter, Modal, PageHead, toneFor } from '../ui';

export default function RosterPage() {
  const { state, update, can } = useStore();
  const [pos, setPos] = useState<Pos | 'ALL'>('ALL');
  const [adding, setAdding] = useState(false);
  const list = (pos === 'ALL' ? state.players.filter((p) => p.status !== 'Departed') : groupPlayers(state, pos)).sort(
    (a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || b.auditGrade - a.auditGrade,
  );
  const group = pos === 'ALL' ? null : state.groups.find((g) => g.pos === pos)!;
  const audit = group ? auditGroup(state, group) : null;
  const ready = state.settings.gameReadyGrade;

  return (
    <>
      <PageHead kicker="Player evaluation & depth" title="Roster & Depth">
        Coach grades and independent audit grades side by side. Game-ready means active with an audit grade of {ready}+.
      </PageHead>

      <div className="tabs" role="tablist">
        {(['ALL', ...POSITIONS] as const).map((p) => {
          const g = p === 'ALL' ? null : auditGroup(state, state.groups.find((x) => x.pos === p)!);
          const short = g && g.gameReady < g.requiredDepth;
          return (
            <button key={p} role="tab" aria-selected={pos === p} className={`tab ${pos === p ? 'active' : ''}`} onClick={() => setPos(p)}>
              {p}{short && <span className="dot bad" aria-label="depth short" />}
            </button>
          );
        })}
      </div>

      {group && audit && (
        <div className="grid-2">
          <Card title={POS_LABEL[group.pos]} sub={`Coach: ${state.coaches.find((c) => c.id === group.coachId)?.title}`}>
            <div className="mini-stats">
              <div><span className="muted small">Audit grade</span><strong>{audit.auditGrade}</strong><span className="small">{audit.tier}</span></div>
              <div><span className="muted small">Coach grade</span><strong>{audit.coachGrade}</strong><span className="small">{audit.coachTier}</span></div>
              <div><span className="muted small">Game-ready</span><strong className={audit.gameReady < group.requiredDepth ? 'error' : ''}>{audit.gameReady}/{group.requiredDepth}</strong><span className="small">required depth</span></div>
              <div><span className="muted small">Development</span><strong>{audit.devRate >= 0 ? '+' : ''}{audit.devRate}</strong><span className="small">target +{group.devTarget}/yr</span></div>
            </div>
          </Card>
          <Card title="Group standards" sub="Set by GM; used by the escalation engine">
            <div className="form-grid">
              <Field label={`ACC rank (1-${state.settings.conferenceSize})`}>
                <input type="number" min={1} max={state.settings.conferenceSize} value={group.accRank} disabled={!can('GM', 'SCOUT')} onChange={(e) => update((d) => { d.groups.find((g) => g.pos === group.pos)!.accRank = +e.target.value; })} />
              </Field>
              <Field label="Target rank">
                <input type="number" min={1} value={group.targetRank} disabled={!can('GM')} onChange={(e) => update((d) => { d.groups.find((g) => g.pos === group.pos)!.targetRank = +e.target.value; })} />
              </Field>
              <Field label="Required depth">
                <input type="number" min={1} value={group.requiredDepth} disabled={!can('GM')} onChange={(e) => update((d) => { d.groups.find((g) => g.pos === group.pos)!.requiredDepth = +e.target.value; })} />
              </Field>
              <Field label="Dev target (/yr)">
                <input type="number" step={0.5} value={group.devTarget} disabled={!can('GM')} onChange={(e) => update((d) => { d.groups.find((g) => g.pos === group.pos)!.devTarget = +e.target.value; })} />
              </Field>
            </div>
            <label className="check"><input type="checkbox" checked={group.critical} disabled={!can('GM')} onChange={(e) => update((d) => { d.groups.find((g) => g.pos === group.pos)!.critical = e.target.checked; })} /> Critical position (two game-ready players minimum)</label>
          </Card>
        </div>
      )}

      <Card title={`${list.length} players`} sub="Coaches edit coach grades · Personnel/Scouting edits audit grades" actions={<Gate roles={['GM', 'SCOUT']} what="Add player"><button className="btn" onClick={() => setAdding(true)}>Add player</button></Gate>}>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr><th>Player</th><th>Pos</th><th>Yr</th><th>Src</th><th>Status</th><th className="num">Coach</th><th className="num">Audit</th><th>Gap</th><th>Trend</th><th className="num">Comp</th><th>Priority</th><th /></tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const gap = p.coachGrade - p.auditGrade;
                const last = p.history[p.history.length - 1];
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong><div className="muted small">{tier(p.auditGrade)}</div></td>
                    <td>{p.pos}</td>
                    <td>{p.year}</td>
                    <td><Badge tone={p.source === 'Portal' ? 'purple' : 'neutral'}>{p.source}</Badge></td>
                    <td>
                      <select className="inline" value={p.status} disabled={!can('GM', 'HC', 'COACH')} onChange={(e) => update((d) => { d.players.find((x) => x.id === p.id)!.status = e.target.value as typeof p.status; })}>
                        <option>Active</option><option>Injured</option><option>Departed</option>
                      </select>
                    </td>
                    <td className="num"><input className="inline num-in" type="number" min={0} max={100} value={p.coachGrade} disabled={!can('COACH', 'HC')} onChange={(e) => update((d) => { d.players.find((x) => x.id === p.id)!.coachGrade = +e.target.value; })} /></td>
                    <td className="num"><input className="inline num-in" type="number" min={0} max={100} value={p.auditGrade} disabled={!can('SCOUT')} onChange={(e) => update((d) => { d.players.find((x) => x.id === p.id)!.auditGrade = +e.target.value; })} /></td>
                    <td>{Math.abs(gap) >= state.settings.discrepancyThreshold ? <Badge tone="bad">{gap > 0 ? '+' : ''}{gap}</Badge> : <span className="muted small">{gap > 0 ? '+' : ''}{gap}</span>}</td>
                    <td className="trend">
                      {last ? <span className={p.auditGrade - last.grade >= 0 ? 'good-t' : 'bad-t'}>{p.auditGrade - last.grade >= 0 ? '▲' : '▼'} {Math.abs(p.auditGrade - last.grade)}</span> : <span className="muted small">new</span>}
                      <Meter value={p.auditGrade} max={100} tone={toneFor(p.auditGrade + 10)} />
                    </td>
                    <td className="num">{money(p.compensation)}</td>
                    <td><input type="checkbox" aria-label="priority retention" checked={p.priorityRetention} disabled={!can('GM', 'HC')} onChange={(e) => update((d) => { d.players.find((x) => x.id === p.id)!.priorityRetention = e.target.checked; })} /></td>
                    <td>{p.auditGrade >= ready && p.status === 'Active' ? <Badge tone="good">Ready</Badge> : <Badge>Developing</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {adding && <AddPlayer defaultPos={pos === 'ALL' ? 'QB' : pos} onClose={() => setAdding(false)} />}
    </>
  );
}

function AddPlayer({ defaultPos, onClose }: { defaultPos: Pos; onClose: () => void }) {
  const { state, update } = useStore();
  const [f, setF] = useState({ name: '', pos: defaultPos, year: 'FR' as ClassYear, source: 'HS' as 'HS' | 'Portal', coachGrade: 70, auditGrade: 68, compensation: 100000 });
  return (
    <Modal title="Add player" onClose={onClose}>
      <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="form-grid">
        <Field label="Position"><select value={f.pos} onChange={(e) => setF({ ...f, pos: e.target.value as Pos })}>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Year"><select value={f.year} onChange={(e) => setF({ ...f, year: e.target.value as ClassYear })}>{['FR', 'SO', 'JR', 'SR', 'GR'].map((y) => <option key={y}>{y}</option>)}</select></Field>
        <Field label="Source"><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as 'HS' | 'Portal' })}><option>HS</option><option>Portal</option></select></Field>
        <Field label="Coach grade"><input type="number" value={f.coachGrade} onChange={(e) => setF({ ...f, coachGrade: +e.target.value })} /></Field>
        <Field label="Audit grade"><input type="number" value={f.auditGrade} onChange={(e) => setF({ ...f, auditGrade: +e.target.value })} /></Field>
        <Field label="Compensation"><input type="number" step={10000} value={f.compensation} onChange={(e) => setF({ ...f, compensation: +e.target.value })} /></Field>
      </div>
      <div className="row gap-s end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!f.name} onClick={() => {
          const id = uid('p');
          update((d) => {
            d.players.push({ id, ...f, status: 'Active', depth: 2, history: [], priorityRetention: false, injuries: 0, snapPct: 0,
              acquisition: f.source === 'Portal' ? { projectedGrade: f.auditGrade, replacedGrade: Math.min(...groupPlayers(state, f.pos).slice(0, 3).map((p) => p.auditGrade), f.auditGrade), season: d.settings.season } : undefined });
            d.transactions.push({ id: uid('t'), bucket: f.source === 'Portal' ? 'portal' : 'retention', amount: f.compensation, label: `${f.source === 'Portal' ? 'Portal acquisition' : 'Retention'}: ${f.name} (${f.pos})`, date: new Date().toISOString().slice(0, 10), playerId: id });
          });
          onClose();
        }}>Add to roster</button>
      </div>
    </Modal>
  );
}
