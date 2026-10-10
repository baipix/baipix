import { useT } from '../../i18n';
import { TEMPLATES, type Template } from '../templates';

export interface SizeChoice {
  width: number;
  height: number;
  template?: Template;
}

/** The canvas's proportions, as a small outline in a 14×12 box. */
function Shape({ width, height }: { width: number; height: number }) {
  const k = Math.min(14 / width, 12 / height);
  return (
    <span className="size-shape" aria-hidden="true">
      <span
        style={{ width: Math.max(3, Math.round(width * k)), height: Math.max(3, Math.round(height * k)) }}
      />
    </span>
  );
}

/**
 * Sizes to start from, as plain rows like a list in Figma: the last sizes used, then the
 * templates (a name, its size, and what it sets up). A click picks one, a double-click or
 * Enter starts with it.
 */
export function SizeList({
  recent = [],
  selected,
  onPick,
  onCreate,
}: {
  recent?: { width: number; height: number }[];
  /** The row shown as picked: a template's id, or "W×H" for a recent size. */
  selected?: string | null;
  onPick: (choice: SizeChoice) => void;
  onCreate: (choice: SizeChoice) => void;
}) {
  const t = useT();
  const row = (key: string, choice: SizeChoice, name: string, aside: string) => (
    <button
      key={key}
      type="button"
      className="size-row"
      aria-pressed={selected === key}
      onClick={() => onPick(choice)}
      onDoubleClick={() => onCreate(choice)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
        onCreate(choice);
      }}
    >
      <Shape width={choice.width} height={choice.height} />
      <span className="size-name truncate">{name}</span>
      <span className="muted">{aside}</span>
    </button>
  );
  return (
    <div className="size-list">
      {recent.length > 0 && (
        <>
          <div className="size-group">{t('template.recent')}</div>
          {recent.map((s) => row(`${s.width}×${s.height}`, s, `${s.width} × ${s.height}`, ''))}
        </>
      )}
      <div className="size-group">{t('template.title')}</div>
      {TEMPLATES.map((tpl) => {
        const extras = [tpl.mirrorX && t('template.mirrored'), tpl.tile && t('template.tiled')].filter(
          Boolean,
        );
        return row(
          tpl.id,
          { width: tpl.width, height: tpl.height, template: tpl },
          t(tpl.label),
          [`${tpl.width} × ${tpl.height}`, ...extras].join(' · '),
        );
      })}
    </div>
  );
}
