// Core domain model for the Roster Command Center.

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'EDGE', 'LB', 'CB', 'S', 'ST'] as const;
export type Pos = (typeof POSITIONS)[number];

export const POS_LABEL: Record<Pos, string> = {
  QB: 'Quarterback',
  RB: 'Running Back',
  WR: 'Wide Receiver',
  TE: 'Tight End',
  OL: 'Offensive Line',
  DL: 'Defensive Tackle',
  EDGE: 'Defensive End',
  LB: 'Linebacker',
  CB: 'Cornerback',
  S: 'Safety',
  ST: 'Specialists',
};

export type Role = 'AD' | 'HC' | 'GM' | 'COACH' | 'SCOUT' | 'FINANCE';
export const ROLE_LABEL: Record<Role, string> = {
  AD: 'Athletic Director',
  HC: 'Head Coach',
  GM: 'General Manager',
  COACH: 'Position Coach',
  SCOUT: 'Personnel / Scouting',
  FINANCE: 'Finance / Compliance',
};

export type ClassYear = 'FR' | 'SO' | 'JR' | 'SR' | 'GR';
export type Bucket = 'retention' | 'portal' | 'contingency';

export interface GradePoint {
  season: number;
  grade: number; // 0-100 independent audit grade at end of season
}

export interface Player {
  id: string;
  name: string;
  pos: Pos;
  year: ClassYear;
  source: 'HS' | 'Portal';
  status: 'Active' | 'Injured' | 'Departed';
  depth: number; // 1 = starter, 2 = backup...
  coachGrade: number; // 0-100, position coach's evaluation
  auditGrade: number; // 0-100, independent evaluator's grade
  history: GradePoint[];
  compensation: number; // annual $ (revenue share)
  priorityRetention: boolean;
  injuries: number; // games missed this season
  snapPct?: number; // share of snaps played this season
  // Portal acquisition ROI fields
  acquisition?: {
    prospectId?: string;
    projectedGrade: number; // scouting projection at signing
    replacedGrade: number; // grade of best internal option at signing
    season: number;
  };
}

export interface PositionGroup {
  pos: Pos;
  coachId: string;
  critical: boolean;
  requiredDepth: number; // game-ready players needed
  accRank: number; // 1 (best) - 17 on relevant metrics
  targetRank: number;
  devTarget: number; // expected avg YoY grade gain
}

export interface Coach {
  id: string;
  title: string; // role title (names are editable)
  name: string;
  groups: Pos[];
  manualScores?: Partial<Record<KpiKey, number>>; // optional overrides
}

export type KpiKey = 'performance' | 'development' | 'depth' | 'evaluation' | 'acquisition' | 'retention';

export interface Transaction {
  id: string;
  bucket: Bucket;
  amount: number;
  label: string;
  date: string;
  playerId?: string;
  prospectId?: string;
}

export interface Reallocation {
  id: string;
  from: Bucket;
  to: Bucket;
  amount: number;
  justification: string;
  requestedBy: Role;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  decisionNote?: string;
}

export interface Budget {
  season: number;
  total: number;
  pct: Record<Bucket, number>; // must sum to 100
  approvedBy: Role[]; // GM proposes; AD + HC approve
}

export const STAGES = [
  'Talent identified',
  'Roster need confirmed',
  'Financially qualified',
  'Recruiting eligible',
  'Recruiting active',
  'Committed & enrolled',
  'Performance tracked',
] as const;

export type LossReason = 'scouting' | 'delayed decision' | 'recruiting execution' | 'financial' | 'player preference';
export type DeclineReason = 'affordability' | 'scheme fit' | 'eligibility' | 'current players better value' | 'character / academics' | 'other';

export interface Prospect {
  id: string;
  name: string;
  pos: Pos;
  prevSchool: string;
  stage: number; // index into STAGES
  projectedGrade: number;
  askComp: number;
  offerComp?: number;
  evaluated: boolean;
  priority: boolean;
  outcome: 'active' | 'committed' | 'lost' | 'declined';
  lossReason?: LossReason;
  decline?: {
    reason: DeclineReason;
    explanation: string;
    by: Role;
    gmReviewed: boolean;
    escalated: boolean;
  };
  notes?: string;
}

export type Risk = 'Low' | 'Medium' | 'Medium-high' | 'High';

export interface BuildBuy {
  id: string;
  pos: Pos;
  season: number;
  buildPlayerId: string;
  buyProspectId?: string;
  build: { readyYear: number; risk: Risk; cost: number; impact: number };
  buy: { readyYear: number; risk: Risk; cost: number; impact: number };
  decision: 'pending' | 'build' | 'buy';
  rationale: string;
  projectedGradeAtReview: number; // what the build player must reach by next review
}

export type QbrRating = 'Exceeds' | 'Meets' | 'Below' | 'Poor';
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export const QUARTERS: { q: Quarter; label: string; objective: string }[] = [
  { q: 'Q1', label: 'After season', objective: 'Identify weaknesses, departures, and immediate needs' },
  { q: 'Q2', label: 'After spring practice', objective: 'Validate player development and depth' },
  { q: 'Q3', label: 'Before season', objective: 'Evaluate readiness and roster investment' },
  { q: 'Q4', label: 'Midseason', objective: 'Identify performance gaps and next-cycle priorities' },
];

export interface QuarterlyReview {
  id: string;
  season: number;
  quarter: Quarter;
  pos: Pos;
  rating: QbrRating;
  working: string;
  notWorking: string;
  actions: string;
}

export interface AuditResolution {
  pos: Pos;
  season: number;
  ruling: 'coach' | 'audit' | 'split';
  evidence: string;
  date: string;
}

export interface TriggerAction {
  status: 'open' | 'in review' | 'resolved';
  note: string;
  updated: string;
}

export interface UnusedJustification {
  season: number;
  answers: string[]; // five required questions
  date: string;
  adAction?: 'accepted' | 'corrective action required';
}

export interface CommitteeItem {
  id: string;
  date: string;
  type: 'Strategy approval' | 'Allocation change' | 'Disagreement' | 'GM direct recommendation' | 'Declined opportunity' | 'Escalation';
  title: string;
  detail: string;
  coachPosition?: string;
  gmPosition?: string;
  status: 'pending' | 'approved' | 'rejected' | 'resolved';
  decisionNote?: string;
}

export interface Settings {
  orgName: string;
  season: number;
  weights: { onField: number; development: number; depth: number; execution: number };
  discrepancyThreshold: number; // coach vs audit grade gap that triggers review
  gameReadyGrade: number;
  unusedPortalThreshold: number; // pct of portal budget unused that requires justification
  injuryThreshold: number; // games missed in group
  conferenceSize: number;
}

export interface AppState {
  version: number;
  role: Role;
  settings: Settings;
  budget: Budget;
  transactions: Transaction[];
  reallocations: Reallocation[];
  players: Player[];
  groups: PositionGroup[];
  coaches: Coach[];
  prospects: Prospect[];
  buildBuy: BuildBuy[];
  reviews: QuarterlyReview[];
  resolutions: AuditResolution[];
  triggerActions: Record<string, TriggerAction>;
  unusedJustifications: UnusedJustification[];
  committee: CommitteeItem[];
}
