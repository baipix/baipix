import { useId, type ReactNode } from 'react';
import { uiStore } from '../uiStore';
import { Icon } from './Icon';

interface SectionProps {
  title: ReactNode;
  /** Right side of the header: small actions or a hint. */
  aside?: ReactNode;
  /** Help text, shown in a tooltip on an info icon next to the title (keeps the panel light). */
  info?: string;
  /** A small word after the title, like Beta for a feature still being tried out. */
  badge?: string;
  /** Makes the section collapsible from its title. Open/closed is remembered under this key. */
  id?: string;
  children?: ReactNode;
  className?: string;
}

export function Section({ title, aside, info, badge, id, children, className = '' }: SectionProps) {
  const bodyId = useId();
  const collapsed = uiStore.use((s) => !!id && s.collapsed.includes(id));
  const toggle = () =>
    uiStore.set((s) => ({
      collapsed: collapsed ? s.collapsed.filter((x) => x !== id) : [...s.collapsed, id!],
    }));
  return (
    <section className={`section ${className}${collapsed ? ' is-collapsed' : ''}`}>
      <h2 className="section-title">
        {id ? (
          <button
            type="button"
            className="section-name section-toggle"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={toggle}
          >
            {title}
            <Icon name="caret" size={12} />
          </button>
        ) : (
          <span className="section-name">{title}</span>
        )}
        {badge && <span className="section-badge">{badge}</span>}
        {info && (
          <span className="section-info" data-tip={info} aria-label={info} role="img" tabIndex={0}>
            <Icon name="info" size={14} />
          </span>
        )}
        {aside}
      </h2>
      {!collapsed && (id ? <div id={bodyId}>{children}</div> : children)}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <div className="row-control">{children}</div>
    </div>
  );
}
