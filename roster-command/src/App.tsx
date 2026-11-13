import { useEffect, useState } from 'react';
import { computeTriggers } from './engine';
import { useStore } from './store';
import type { Role } from './types';
import { ROLE_LABEL } from './types';
import Dashboard from './pages/Dashboard';
import BudgetPage from './pages/Budget';
import RosterPage from './pages/Roster';
import AuditPage from './pages/Audit';
import CoachesPage from './pages/Coaches';
import BuildBuyPage from './pages/BuildBuy';
import PipelinePage from './pages/Pipeline';
import ReviewsPage from './pages/Reviews';
import TriggersPage from './pages/Triggers';
import RoiPage from './pages/Roi';
import CommitteePage from './pages/Committee';
import SettingsPage from './pages/Settings';

export const NAV = [
  { id: 'dashboard', label: 'Command Center', icon: '◎', group: 'Overview' },
  { id: 'triggers', label: 'Escalations', icon: '⚑', group: 'Overview' },
  { id: 'budget', label: 'Budgets', icon: '$', group: 'Plan' },
  { id: 'roster', label: 'Roster & Depth', icon: '☰', group: 'Plan' },
  { id: 'buildbuy', label: 'Build vs. Buy', icon: '⇄', group: 'Plan' },
  { id: 'pipeline', label: 'Portal Pipeline', icon: '➜', group: 'Acquire' },
  { id: 'roi', label: 'Acquisition ROI', icon: '↗', group: 'Acquire' },
  { id: 'audit', label: 'Independent Audit', icon: '⚖', group: 'Evaluate' },
  { id: 'reviews', label: 'Quarterly Reviews', icon: '▦', group: 'Evaluate' },
  { id: 'coaches', label: 'Coach KPIs', icon: '★', group: 'Evaluate' },
  { id: 'committee', label: 'Roster Committee', icon: '◈', group: 'Govern' },
  { id: 'settings', label: 'Settings', icon: '⚙', group: 'Govern' },
] as const;

export type PageId = (typeof NAV)[number]['id'];

const PAGES: Record<PageId, () => JSX.Element> = {
  dashboard: Dashboard,
  triggers: TriggersPage,
  budget: BudgetPage,
  roster: RosterPage,
  buildbuy: BuildBuyPage,
  pipeline: PipelinePage,
  roi: RoiPage,
  audit: AuditPage,
  reviews: ReviewsPage,
  coaches: CoachesPage,
  committee: CommitteePage,
  settings: SettingsPage,
};

function currentPage(): PageId {
  const h = window.location.hash.replace('#/', '').replace('#', '');
  return (NAV.find((n) => n.id === h)?.id ?? 'dashboard') as PageId;
}

export function go(id: string) {
  window.location.hash = `#/${id}`;
}

export default function App() {
  const { state, update } = useStore();
  const [page, setPage] = useState<PageId>(currentPage);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const on = () => {
      setPage(currentPage());
      setMenu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const triggers = computeTriggers(state);
  const open = triggers.filter((t) => state.triggerActions[t.id]?.status !== 'resolved').length;
  const Page = PAGES[page];
  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="shell">
      <aside className={`side ${menu ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo" aria-hidden>RC</div>
          <div>
            <div className="brand-t">Roster Command</div>
            <div className="brand-s">{state.settings.orgName}</div>
          </div>
        </div>
        <nav>
          {groups.map((g) => (
            <div key={g} className="nav-g">
              <div className="nav-gl">{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => (
                <a key={n.id} href={`#/${n.id}`} className={`nav-i ${page === n.id ? 'active' : ''}`}>
                  <span className="nav-ic" aria-hidden>{n.icon}</span>
                  {n.label}
                  {n.id === 'triggers' && open > 0 && <span className="nav-count">{open}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">Illustrative sample data. Not any program's actual roster, budget, or decisions.</div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <main className="main">
        <div className="topbar">
          <button className="btn ghost menu-btn" onClick={() => setMenu(true)} aria-label="Open menu">☰</button>
          <div className="season">Season {state.settings.season}</div>
          <label className="role">
            <span>Acting as</span>
            <select value={state.role} onChange={(e) => update((d) => { d.role = e.target.value as Role; })}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="content">
          <Page />
        </div>
      </main>
    </div>
  );
}
