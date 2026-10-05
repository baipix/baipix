import { useT, type MessageKey } from '../../i18n';

/** 0: left / top, 1: center, 2: right / bottom. */
export interface Anchor {
  x: 0 | 1 | 2;
  y: 0 | 1 | 2;
}

const LABELS: MessageKey[] = [
  'anchor.topLeft',
  'anchor.top',
  'anchor.topRight',
  'anchor.left',
  'anchor.center',
  'anchor.right',
  'anchor.bottomLeft',
  'anchor.bottom',
  'anchor.bottomRight',
];

/** A 3×3 grid of spots to pin something to (top left … bottom right). `null`: none of them. */
export function AnchorGrid({
  value,
  onChange,
  label,
}: {
  value: Anchor | null;
  onChange: (anchor: Anchor) => void;
  label?: string;
}) {
  const t = useT();
  return (
    <div className="anchor-grid" role="group" aria-label={label}>
      {LABELS.map((key, i) => {
        const x = (i % 3) as Anchor['x'];
        const y = Math.floor(i / 3) as Anchor['y'];
        return (
          <button
            key={key}
            type="button"
            className="anchor-cell"
            aria-label={t(key)}
            data-tip={t(key)}
            aria-pressed={value?.x === x && value.y === y}
            onClick={() => onChange({ x, y })}
          />
        );
      })}
    </div>
  );
}
