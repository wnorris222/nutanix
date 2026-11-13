import { useRef } from 'react';
import { useStore } from '../store';
import type { AppState, Settings } from '../types';
import { Card, Field, Gate, PageHead } from '../ui';

export default function SettingsPage() {
  const { state, update, replace, reset } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const s = state.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update((d) => { d.settings[k] = v; });
  const wsum = s.weights.onField + s.weights.development + s.weights.depth + s.weights.execution;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `roster-command-${s.season}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHead kicker="Governance" title="Settings">Thresholds that drive automatic escalation, evaluation weights, and data management.</PageHead>
      <div className="grid-2">
        <Card title="Organization">
          <Field label="Program name"><input value={s.orgName} onChange={(e) => set('orgName', e.target.value)} /></Field>
          <div className="form-grid">
            <Field label="Season"><input type="number" value={s.season} onChange={(e) => set('season', +e.target.value)} /></Field>
            <Field label="Conference size"><input type="number" value={s.conferenceSize} onChange={(e) => set('conferenceSize', +e.target.value)} /></Field>
          </div>
        </Card>
        <Card title="Escalation thresholds">
          <div className="form-grid">
            <Field label="Coach vs audit discrepancy (pts)"><input type="number" value={s.discrepancyThreshold} onChange={(e) => set('discrepancyThreshold', +e.target.value)} /></Field>
            <Field label="Game-ready grade"><input type="number" value={s.gameReadyGrade} onChange={(e) => set('gameReadyGrade', +e.target.value)} /></Field>
            <Field label="Unused portal % requiring justification"><input type="number" value={s.unusedPortalThreshold} onChange={(e) => set('unusedPortalThreshold', +e.target.value)} /></Field>
            <Field label="Injury games-missed threshold"><input type="number" value={s.injuryThreshold} onChange={(e) => set('injuryThreshold', +e.target.value)} /></Field>
          </div>
        </Card>
        <Card title="Coach evaluation weights (MBO)" sub={wsum === 100 ? 'Totals 100%' : `Totals ${wsum}% — weights are normalized`}>
          <div className="form-grid">
            {([['onField', 'On-field performance'], ['development', 'Player development'], ['depth', 'Roster quality & depth'], ['execution', 'Acquisition & retention']] as const).map(([k, l]) => (
              <Field key={k} label={`${l} %`}>
                <input type="number" value={s.weights[k]} onChange={(e) => update((d) => { d.settings.weights[k] = +e.target.value; })} />
              </Field>
            ))}
          </div>
        </Card>
        <Card title="Data" sub="Data is stored in this browser only">
          <div className="row gap-s wrap">
            <button className="btn secondary" onClick={exportJson}>Export JSON</button>
            <button className="btn secondary" onClick={() => file.current?.click()}>Import JSON</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const parsed = JSON.parse(await f.text()) as AppState;
                if (parsed.version !== 1 || !Array.isArray(parsed.players)) throw new Error('bad');
                replace(parsed);
              } catch {
                alert('That file is not a valid Roster Command export.');
              }
              e.target.value = '';
            }} />
            <Gate roles={['AD', 'GM']} what="Reset">
              <button className="btn danger" onClick={() => { if (confirm('Reset all data to the sample dataset?')) reset(); }}>Reset to sample data</button>
            </Gate>
          </div>
          <p className="muted small">All players, prospects, and dollar figures in the sample dataset are fictional and illustrative.</p>
        </Card>
      </div>
    </>
  );
}
