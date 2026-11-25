
import type { ButtonHTMLAttributes } from 'react';
import type { IconName } from '../icons';
import { Icon } from './Icon';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  /** Keyboard shortcut shown in the tooltip. */
  shortcut?: string;
  iconSize?: number;
  pressed?: boolean;
  /** Shows a caret after the icon. */
  caret?: boolean;
}

export function IconButton({
  icon,
  label,
  shortcut,
  iconSize = 16,
  pressed,
  caret = false,
  className = 'icon-btn',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`${className}${caret ? ' has-caret' : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      data-tip={label}
      data-kbd={shortcut}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
      {caret && <Icon name="caret" size={12} />}
    </button>
  );
}
