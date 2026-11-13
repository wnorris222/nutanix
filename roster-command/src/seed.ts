import type { AppState, ClassYear, Coach, Player, Pos, PositionGroup, Prospect } from './types';

// Sample data only. Player and prospect names are fictional, and every dollar
// figure is illustrative — not any program's actual roster, budget, or spending.

const FIRST = ['Jalen', 'Marcus', 'Tyrese', 'Caleb', 'Darius', 'Mason', 'Isaiah', 'Trey', 'Xavier', 'Bryce', 'Jordan', 'Malik', 'Elijah', 'Cole', 'Devin', 'Kendrick', 'Logan', 'Quincy', 'Andre', 'Hunter', 'Rashad', 'Wyatt', 'Jaylen', 'Carter', 'Dante', 'Grant', 'Micah', 'Tristan', 'Zion', 'Brady', 'Keon', 'Landon', 'Omar', 'Peyton', 'Reggie', 'Silas', 'Terrell', 'Vince', 'Austin', 'Brandon'];
const LAST = ['Whitaker', 'Holloway', 'Pruitt', 'Calloway', 'Benning', 'Strickland', 'Ashford', 'Merriweather', 'Okafor', 'Langston', 'Dorsey', 'Kirkland', 'Fennell', 'Gaskins', 'Rutledge', 'Haywood', 'Mabry', 'Tolliver', 'Vance', 'Wofford', 'Bellamy', 'Crenshaw', 'Easley', 'Fairley', 'Garnett', 'Hollins', 'Ivey', 'Jessup', 'Keller', 'Lomax', 'McCrae', 'Nesbitt', 'Ogletree', 'Pettaway', 'Quarles', 'Rhodes', 'Sumner', 'Thigpen', 'Upshaw', 'Varner'];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface GroupSpec {
  pos: Pos;
  count: number;
  base: number; // starter audit grade
  coachBias: number; // how much higher the coach grades than the auditors
  critical: boolean;
  requiredDepth: number;
  accRank: number;
  devTarget: number;
  growth: number; // actual average YoY growth
  injuries: number[];
}

const SPECS: GroupSpec[] = [
  { pos: 'QB', count: 3, base: 84, coachBias: 2, critical: true, requiredDepth: 2, accRank: 4, devTarget: 3, growth: 4, injuries: [0, 0, 0] },
  { pos: 'RB', count: 4, base: 78, coachBias: 1, critical: false, requiredDepth: 2, accRank: 6, devTarget: 3, growth: 3.5, injuries: [2, 0, 0, 0] },
  { pos: 'WR', count: 6, base: 80, coachBias: 3, critical: true, requiredDepth: 4, accRank: 5, devTarget: 3, growth: 3, injuries: [0, 3, 2, 0, 0, 0] },
  { pos: 'TE', count: 3, base: 74, coachBias: 2, critical: false, requiredDepth: 2, accRank: 8, devTarget: 3, growth: 2.5, injuries: [0, 0, 0] },
  { pos: 'OL', count: 10, base: 71, coachBias: 12, critical: true, requiredDepth: 7, accRank: 12, devTarget: 3, growth: 1.2, injuries: [0, 4, 0, 1, 0, 0, 0, 0, 0, 0] },
  { pos: 'DL', count: 6, base: 79, coachBias: 2, critical: true, requiredDepth: 4, accRank: 4, devTarget: 3, growth: 3.4, injuries: [0, 0, 0, 0, 0, 0] },
  { pos: 'EDGE', count: 5, base: 72, coachBias: 7, critical: true, requiredDepth: 3, accRank: 10, devTarget: 3, growth: 2, injuries: [0, 2, 0, 0, 0] },
  { pos: 'LB', count: 5, base: 81, coachBias: 1, critical: false, requiredDepth: 3, accRank: 3, devTarget: 3, growth: 3.8, injuries: [0, 0, 1, 0, 0] },
  { pos: 'CB', count: 6, base: 77, coachBias: 3, critical: true, requiredDepth: 4, accRank: 7, devTarget: 3, growth: 2.8, injuries: [3, 0, 4, 0, 0, 0] },
  { pos: 'S', count: 4, base: 79, coachBias: 2, critical: false, requiredDepth: 3, accRank: 6, devTarget: 3, growth: 3, injuries: [0, 0, 0, 0] },
  { pos: 'ST', count: 2, base: 80, coachBias: 0, critical: false, requiredDepth: 2, accRank: 5, devTarget: 2, growth: 2, injuries: [0, 0] },
];

const YEARS: ClassYear[] = ['GR', 'SR', 'JR', 'SO', 'FR'];
const COMP_BY_POS: Record<Pos, number> = { QB: 800_000, RB: 180_000, WR: 210_000, TE: 140_000, OL: 180_000, DL: 210_000, EDGE: 240_000, LB: 160_000, CB: 190_000, S: 150_000, ST: 50_000 };

const COACH_TITLES: Record<Pos, string> = {
  QB: 'Quarterbacks Coach', RB: 'Running Backs Coach', WR: 'Wide Receivers Coach', TE: 'Tight Ends Coach',
  OL: 'Offensive Line Coach', DL: 'Defensive Tackles Coach', EDGE: 'Defensive Ends Coach', LB: 'Linebackers Coach',
  CB: 'Cornerbacks Coach', S: 'Safeties Coach', ST: 'Special Teams Coordinator',
};

export const SEASON = 2026;

export function buildSeed(): AppState {
  const r = rng(42);
  const used = new Set<string>();
  const name = () => {
    for (;;) {
      const n = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      if (!used.has(n)) { used.add(n); return n; }
    }
  };

  const players: Player[] = [];
  const groups: PositionGroup[] = [];
  const coaches: Coach[] = [];

  for (const spec of SPECS) {
    const coachId = `c-${spec.pos.toLowerCase()}`;
    coaches.push({ id: coachId, title: COACH_TITLES[spec.pos], name: '', groups: [spec.pos] });
    groups.push({ pos: spec.pos, coachId, critical: spec.critical, requiredDepth: spec.requiredDepth, accRank: spec.accRank, targetRank: 3, devTarget: spec.devTarget });

    for (let i = 0; i < spec.count; i++) {
      const depth = i < spec.requiredDepth ? 1 : 2;
      const drop = i < spec.requiredDepth ? i * 1.5 : 6 + (i - spec.requiredDepth) * 3;
      const grade = Math.round(spec.base - drop + (r() - 0.5) * 4);
      const year = YEARS[Math.min(4, Math.floor(i * 5 / spec.count))];
      const seasonsPlayed = { GR: 4, SR: 3, JR: 2, SO: 1, FR: 0 }[year];
      const history = [] as { season: number; grade: number }[];
      for (let k = seasonsPlayed; k >= 1; k--) {
        history.push({ season: SEASON - k, grade: Math.round(grade - spec.growth * k + (r() - 0.5) * 2) });
      }
      const priority = i < Math.ceil(spec.requiredDepth * 0.75);
      players.push({
        id: `p-${spec.pos.toLowerCase()}-${i}`,
        name: name(),
        pos: spec.pos,
        year,
        source: 'HS',
        status: spec.injuries[i] >= 3 ? 'Injured' : 'Active',
        depth,
        coachGrade: Math.min(99, Math.round(grade + spec.coachBias + (r() - 0.5) * 3)),
        auditGrade: grade,
        history,
        compensation: Math.round((COMP_BY_POS[spec.pos] * (priority ? 1 : 0.35)) / 10_000) * 10_000,
        priorityRetention: priority,
        injuries: spec.injuries[i] ?? 0,
        snapPct: depth === 1 ? Math.round(60 + r() * 35) : Math.round(5 + r() * 25),
      });
    }
  }

  // Five scholarship transfers already on the roster (2026 cycle) — used for ROI reviews.
  const portalSignings: { pos: Pos; grade: number; projected: number; replaced: number; comp: number; snap: number }[] = [
    { pos: 'WR', grade: 83, projected: 82, replaced: 74, comp: 420_000, snap: 78 },
    { pos: 'DL', grade: 80, projected: 84, replaced: 75, comp: 380_000, snap: 64 },
    { pos: 'OL', grade: 70, projected: 79, replaced: 68, comp: 350_000, snap: 41 },
    { pos: 'CB', grade: 79, projected: 78, replaced: 71, comp: 300_000, snap: 82 },
    { pos: 'S', grade: 74, projected: 77, replaced: 73, comp: 150_000, snap: 22 },
  ];
  portalSignings.forEach((s, i) => {
    players.push({
      id: `p-portal-${i}`,
      name: name(),
      pos: s.pos,
      year: i % 2 ? 'SR' : 'GR',
      source: 'Portal',
      status: 'Active',
      depth: s.snap > 50 ? 1 : 2,
      coachGrade: s.grade + 2,
      auditGrade: s.grade,
      history: [{ season: SEASON - 1, grade: s.projected - 3 }],
      compensation: s.comp,
      priorityRetention: s.snap > 60,
      injuries: 0,
      snapPct: s.snap,
      acquisition: { projectedGrade: s.projected, replacedGrade: s.replaced, season: SEASON },
    });
  });

  // Two consecutive seasons-worth of weak OL history: coach rates very high, auditors don't.
  const prospects: Prospect[] = [
    { id: 'x-1', name: name(), pos: 'EDGE', prevSchool: 'Sun Belt program', stage: 4, projectedGrade: 82, askComp: 650_000, evaluated: true, priority: true, outcome: 'active', notes: '9.5 sacks, 2 years eligibility' },
    { id: 'x-2', name: name(), pos: 'EDGE', prevSchool: 'Big Ten program', stage: 2, projectedGrade: 80, askComp: 800_000, evaluated: true, priority: true, outcome: 'declined', decline: { reason: 'scheme fit', explanation: '', by: 'COACH', gmReviewed: false, escalated: false } },
    { id: 'x-3', name: name(), pos: 'EDGE', prevSchool: 'MAC program', stage: 3, projectedGrade: 78, askComp: 400_000, evaluated: true, priority: true, outcome: 'declined', decline: { reason: 'current players better value', explanation: 'Our two returning starters graded out within 4 points in spring; projected to close the gap with a full offseason.', by: 'COACH', gmReviewed: false, escalated: false } },
    { id: 'x-4', name: name(), pos: 'OL', prevSchool: 'SEC program', stage: 4, projectedGrade: 83, askComp: 700_000, evaluated: true, priority: true, outcome: 'active', notes: 'Left tackle, 34 career starts' },
    { id: 'x-5', name: name(), pos: 'OL', prevSchool: 'FCS program', stage: 1, projectedGrade: 79, askComp: 250_000, evaluated: true, priority: true, outcome: 'active' },
    { id: 'x-6', name: name(), pos: 'OL', prevSchool: 'Mountain West program', stage: 0, projectedGrade: 77, askComp: 300_000, evaluated: false, priority: false, outcome: 'active' },
    { id: 'x-7', name: name(), pos: 'CB', prevSchool: 'AAC program', stage: 2, projectedGrade: 79, askComp: 350_000, evaluated: true, priority: false, outcome: 'active' },
    { id: 'x-8', name: name(), pos: 'TE', prevSchool: 'Big 12 program', stage: 0, projectedGrade: 76, askComp: 200_000, evaluated: false, priority: false, outcome: 'active' },
    { id: 'x-9', name: name(), pos: 'WR', prevSchool: 'Conference USA program', stage: 6, projectedGrade: 82, askComp: 420_000, offerComp: 420_000, evaluated: true, priority: true, outcome: 'committed' },
    { id: 'x-10', name: name(), pos: 'DL', prevSchool: 'Pac-12 program', stage: 6, projectedGrade: 84, askComp: 380_000, offerComp: 380_000, evaluated: true, priority: true, outcome: 'committed' },
    { id: 'x-11', name: name(), pos: 'OL', prevSchool: 'ACC program', stage: 4, projectedGrade: 81, askComp: 600_000, evaluated: true, priority: true, outcome: 'lost', lossReason: 'delayed decision', notes: 'Committed elsewhere 36 hours before our offer was approved' },
    { id: 'x-12', name: name(), pos: 'LB', prevSchool: 'Sun Belt program', stage: 1, projectedGrade: 75, askComp: 150_000, evaluated: false, priority: false, outcome: 'active' },
  ];

  // Link the first two portal signings to committed prospects.
  players.find((p) => p.id === 'p-portal-0')!.acquisition!.prospectId = 'x-9';
  players.find((p) => p.id === 'p-portal-1')!.acquisition!.prospectId = 'x-10';

  const retentionTx = players
    .filter((p) => p.source === 'HS' && p.status !== 'Departed')
    .map((p) => ({ id: `t-${p.id}`, bucket: 'retention' as const, amount: p.compensation, label: `Retention: ${p.name} (${p.pos})`, date: `${SEASON}-01-20`, playerId: p.id }));
  const portalTx = players
    .filter((p) => p.source === 'Portal')
    .map((p) => ({ id: `t-${p.id}`, bucket: 'portal' as const, amount: p.compensation, label: `Portal acquisition: ${p.name} (${p.pos})`, date: `${SEASON}-01-12`, playerId: p.id }));

  return {
    version: 1,
    role: 'GM',
    settings: {
      orgName: 'Clemson Football',
      season: SEASON,
      weights: { onField: 40, development: 25, depth: 20, execution: 15 },
      discrepancyThreshold: 8,
      gameReadyGrade: 70,
      unusedPortalThreshold: 25,
      injuryThreshold: 5,
      conferenceSize: 17,
    },
    budget: { season: SEASON, total: 15_000_000, pct: { retention: 60, portal: 30, contingency: 10 }, approvedBy: ['GM', 'HC'] },
    transactions: [
      ...retentionTx,
      ...portalTx,
      { id: 't-cont-1', bucket: 'contingency', amount: 250_000, label: 'Contingency: mid-year injury replacement', date: `${SEASON}-09-15` },
    ],
    reallocations: [
      { id: 'r-1', from: 'portal', to: 'retention', amount: 600_000, justification: 'Retain two starting OL who received outside offers.', requestedBy: 'HC', date: `${SEASON}-11-02`, status: 'pending' },
    ],
    players,
    groups,
    coaches,
    prospects,
    buildBuy: [
      {
        id: 'b-1', pos: 'OL', season: SEASON, buildPlayerId: 'p-ol-7', buyProspectId: 'x-4',
        build: { readyYear: SEASON + 2, risk: 'Medium-high', cost: 120_000, impact: 3 },
        buy: { readyYear: SEASON + 1, risk: 'Medium', cost: 700_000, impact: 4 },
        decision: 'build', rationale: 'Coach projects sophomore tackle as a starter by spring.', projectedGradeAtReview: 72,
      },
      {
        id: 'b-2', pos: 'EDGE', season: SEASON, buildPlayerId: 'p-edge-3', buyProspectId: 'x-1',
        build: { readyYear: SEASON + 2, risk: 'High', cost: 100_000, impact: 2 },
        buy: { readyYear: SEASON + 1, risk: 'Low', cost: 650_000, impact: 5 },
        decision: 'pending', rationale: '', projectedGradeAtReview: 70,
      },
    ],
    reviews: [
      { id: 'q-1', season: SEASON, quarter: 'Q1', pos: 'OL', rating: 'Below', working: 'Run blocking on inside zone', notWorking: 'Pass protection vs. 4-man rushes; 38 sacks allowed', actions: 'Increase pass-pro reps in spring' },
      { id: 'q-2', season: SEASON, quarter: 'Q2', pos: 'OL', rating: 'Poor', working: 'Interior continuity', notWorking: 'Tackle depth; two starters limited in spring', actions: 'Monitor tackle development' },
      { id: 'q-3', season: SEASON, quarter: 'Q1', pos: 'EDGE', rating: 'Below', working: 'Run fits', notWorking: 'Pressure rate bottom-third of conference', actions: 'Evaluate portal edge rushers' },
      { id: 'q-4', season: SEASON, quarter: 'Q2', pos: 'EDGE', rating: 'Meets', working: 'Spring pressure improved', notWorking: 'Depth behind top two', actions: 'Continue development plan' },
      { id: 'q-5', season: SEASON, quarter: 'Q1', pos: 'QB', rating: 'Exceeds', working: 'Decision-making, efficiency', notWorking: '—', actions: 'Retain backup' },
      { id: 'q-6', season: SEASON, quarter: 'Q2', pos: 'QB', rating: 'Meets', working: 'Backup development', notWorking: 'Deep-ball accuracy', actions: '—' },
    ],
    resolutions: [],
    triggerActions: {},
    unusedJustifications: [],
    committee: [
      { id: 'm-1', date: `${SEASON}-02-01`, type: 'Strategy approval', title: `${SEASON} roster investment strategy`, detail: 'Annual allocation of 60% retention / 30% portal / 10% contingency.', status: 'approved', decisionNote: 'Approved by AD; utilization reviewed after the January window.' },
      { id: 'm-2', date: `${SEASON}-11-02`, type: 'Allocation change', title: 'Shift $600K portal → retention', detail: 'Request to move portal funds to retain two OL starters.', coachPosition: 'Retaining continuity on the line is the priority.', gmPosition: 'OL audit ranks the unit 12th in conference; retention alone does not address the gap.', status: 'pending' },
    ],
  };
}
