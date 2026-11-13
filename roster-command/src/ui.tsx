import type { ReactNode } from 'react';
import { useStore } from './store';
import type { Role } from './types';
import { ROLE_LABEL } from './types';

export function Card({ title, sub, actions, children, className = '' }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-h">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <p className="muted small">{sub}</p>}
          </div>
          {actions && <div className="row gap-s">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-l">{label}</div>
      <div className="stat-v">{value}</div>
      {note && <div className="stat-n">{note}</div>}
    </div>
  );
}

export function Meter({ value, max = 1, tone, label }: { value: number; max?: number; tone?: 'good' | 'warn' | 'bad' | 'accent'; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`meter-f ${tone ?? 'accent'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'purple' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function PageHead({ title, kicker, children }: { title: string; kicker: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="kicker">{kicker}</div>
        <h1>{title}</h1>
      </div>
      {children && <p className="lede">{children}</p>}
    </div>
  );
}

export function Principle({ children }: { children: ReactNode }) {
  return <div className="principle">{children}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="card-h">
          <h3>{title}</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

/** Explains which roles may take an action; renders children only when allowed. */
export function Gate({ roles, children, what }: { roles: Role[]; children: ReactNode; what: string }) {
  const { can } = useStore();
  if (can(...roles)) return <>{children}</>;
  return <span className="muted small locked">🔒 {what}: {roles.map((r) => ROLE_LABEL[r]).join(' / ')}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function toneFor(score: number): 'good' | 'warn' | 'bad' {
  return score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad';
}
