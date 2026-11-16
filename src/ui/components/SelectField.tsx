import { Icon } from './Icon';
import { openMenu } from './Menu';

/**
 * A choice among a few, in place of a native select: the one picked shows in a field with a caret,
 * and the others open in our menu, so it looks and behaves the same in every browser and on a phone.
 */
export function SelectField<T extends string>({
  value,
  options,
  onChange,
  label,
  tip = false,
  className = '',
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** What is being chosen, for screen readers (and the tooltip, with `tip`). */
  label: string;
  /** Shows `label` as a tooltip: for a field with no label next to it. */
  tip?: boolean;
  className?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? '';
  return (
    <button
      type="button"
      className={`field field-menu select-field${className ? ` ${className}` : ''}`}
      aria-haspopup="menu"
      aria-label={`${label}: ${current}`}
      data-tip={tip ? label : undefined}
      onClick={(e) =>
        openMenu(
          e.currentTarget,
          options.map((o) => ({
            label: o.label,
            checked: o.value === value,
            onSelect: () => onChange(o.value),
          })),
        )
      }
    >
      <span className="truncate">{current}</span>
      <Icon name="caret" size={12} />
    </button>
  );
}
