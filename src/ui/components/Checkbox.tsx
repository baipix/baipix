type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  variant?: 'default' | 'selection';
} & ({ label: string; ariaLabel?: string } | { label?: never; ariaLabel: string });

export function Checkbox({ checked, onChange, label, ariaLabel, variant = 'default' }: CheckboxProps) {
  return (
    <label className={`checkbox${variant === 'selection' ? ' is-selection' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      {variant === 'selection' && <span className="checkbox-mark" aria-hidden="true" />}
      {label}
    </label>
  );
}
