import { useState } from 'react';
import { auditAll, type GroupAudit } from '../engine';
import { today, uid, useStore } from '../store';
import { POS_LABEL } from '../types';
import { Badge, Card, Field, Gate, Modal, PageHead } from '../ui';

export default function AuditPage() {
  const { state, update } = useStore();
  const audits = auditAll(state);
  const [resolving, setResolving] = useState<GroupAudit | null>(null);
  const disputed = audits.filter((a) => a.disputed);

  return (
    <>
      <PageHead kicker="Initiative 2 · Independent audits" title="Independent Roster Audit">
        Evaluators independent of the coaches being assessed report to the AD and GM. When an audit and a position coach disagree by
        {` ${state.settings.discrepancyThreshold}+`} grade points, the GM must resolve it with evidence.
      </PageHead>

      <Card title="Coach evaluation vs. independent audit" sub="Starter average · bar = audit, tick = coach">
        <div className="audit-chart">
          {audits.map((a) => (
            <div key={a.pos} className={`audit-row ${a.disputed && !a.resolved ? 'flag' : ''}`}>
              <div className="audit-l"><strong>{a.pos}</strong><span className="muted small">{POS_LABEL[a.pos]}</span></div>
              <div className="audit-track">
                {[70, 75, 80, 85].map((t) => <span key={t} className="audit-tick-bg" style={{ left: `${((t - 55) / 45) * 100}%` }} />)}
                <div className="audit-bar" style={{ width: `${((a.auditGrade - 55) / 45) * 100}%` }} />
                <div className="audit-coach" style={{ left: `${((a.coachGrade - 55) / 45) * 100}%` }} title={`Coach ${a.coachGrade}`} />
              </div>
              <div className="audit-v">
                <span>{a.auditGrade}</span>
                <span className={a.disputed ? 'error' : 'muted'}>{a.gap > 0 ? '+' : ''}{a.gap}</span>
              </div>
            </div>
          ))}
          <div className="audit-row axis">
            <span />
            <div className="audit-axis">
              {([[70, 'ACC avg'], [75, 'Upper ACC'], [80, 'Contender'], [85, 'Championship']] as const).map(([t, l]) => (
                <span key={t} style={{ left: `${((t - 55) / 45) * 100}%` }}>{l} {t}</span>
              ))}
            </div>
            <span />
          </div>
        </div>
      </Card>

      <Card title="Formal reviews" sub="Discrepancies between coach and audit ratings">
        {disputed.length === 0 && <p className="muted">No discrepancies above threshold.</p>}
        <table className="tbl">
          <thead><tr><th>Group</th><th>Coach rates</th><th>Audit rates</th><th>ACC rank</th><th>Status</th><th /></tr></thead>
          <tbody>
            {disputed.map((a) => {
              const res = state.resolutions.find((r) => r.pos === a.pos && r.season === state.settings.season);
              return (
                <tr key={a.pos}>
                  <td><strong>{POS_LABEL[a.pos]}</strong></td>
                  <td>{a.coachGrade} · {a.coachTier}</td>
                  <td>{a.auditGrade} · {a.tier}</td>
                  <td>#{a.accRank}</td>
                  <td>{res ? <Badge tone="good">Resolved: {res.ruling === 'coach' ? 'coach upheld' : res.ruling === 'audit' ? 'audit upheld' : 'split'}</Badge> : <Badge tone="bad">Review required</Badge>}
                    {res && <div className="muted small wrap-cell">{res.evidence}</div>}</td>
                  <td>
                    {!res && (
                      <div className="row gap-s">
                        <Gate roles={['GM']} what="Resolve"><button className="btn small" onClick={() => setResolving(a)}>Resolve with evidence</button></Gate>
                        <Gate roles={['GM']} what="Escalate">
                          <button className="btn small secondary" onClick={() => update((d) => {
                            d.committee.unshift({ id: uid('m'), date: today(), type: 'Disagreement', title: `${POS_LABEL[a.pos]}: coach ${a.coachGrade} vs audit ${a.auditGrade}`, detail: `Coach rates the unit ${a.coachTier}; independent audit ranks it ${a.tier} (#${a.accRank} in ACC).`, coachPosition: `${a.coachTier} unit`, gmPosition: `${a.tier} unit per independent audit`, status: 'pending' });
                          })}>Escalate to committee</button>
                        </Gate>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Audit scope" sub="What the independent evaluation group examines each cycle">
        <ul className="checklist">
          <li>Individual player performance against ACC and playoff-contender benchmarks</li>
          <li>Positions lacking championship-caliber starters or depth — <strong>{audits.filter((a) => a.auditGrade < 80).map((a) => a.pos).join(', ') || 'none'}</strong></li>
          <li>Whether existing players are developing at the expected rate — <strong>{audits.filter((a) => a.devRate < a.devTarget).map((a) => a.pos).join(', ') || 'all on pace'}</strong> behind target</li>
          <li>Positions where transfers could provide immediate upgrades — see <a href="#/pipeline">Portal Pipeline</a></li>
          <li>Whether previous decisions not to pursue transfers were justified — see <a href="#/buildbuy">Build vs. Buy</a></li>
        </ul>
      </Card>

      {resolving && <ResolveModal a={resolving} onClose={() => setResolving(null)} />}
    </>
  );
}

function ResolveModal({ a, onClose }: { a: GroupAudit; onClose: () => void }) {
  const { update } = useStore();
  const [ruling, setRuling] = useState<'coach' | 'audit' | 'split'>('audit');
  const [evidence, setEvidence] = useState('');
  return (
    <Modal title={`Resolve ${POS_LABEL[a.pos]} discrepancy`} onClose={onClose}>
      <p className="small">Coach: <strong>{a.coachGrade}</strong> ({a.coachTier}) · Audit: <strong>{a.auditGrade}</strong> ({a.tier}) · ACC #{a.accRank}</p>
      <Field label="Ruling">
        <select value={ruling} onChange={(e) => setRuling(e.target.value as typeof ruling)}>
          <option value="audit">Uphold independent audit</option>
          <option value="coach">Uphold coach evaluation</option>
          <option value="split">Split — partial adjustment</option>
        </select>
      </Field>
      <Field label="Evidence" hint="Film grades, metrics, benchmark comparisons. Opinions are not evidence.">
        <textarea rows={5} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </Field>
      <div className="row gap-s end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={evidence.trim().length < 30} onClick={() => {
          update((d) => { d.resolutions.push({ pos: a.pos, season: d.settings.season, ruling, evidence, date: today() }); });
          onClose();
        }}>Record resolution</button>
      </div>
    </Modal>
  );
}
