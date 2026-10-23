import {
  useEffect,
  useRef,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useT } from '../../i18n';
import { IconButton } from '../components/IconButton';

interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Called on submit (Enter / primary button). Without it, no footer: the × closes it. */
  onSubmit?: () => void;
  submitLabel?: string;
  /** The cancel button's label, when it does something else than cancel. */
  cancelLabel?: string;
  /** Extra class on the dialog (its width, for one). */
  className?: string;
  /** On the left of the footer, before the buttons: a secondary action. */
  footer?: ReactNode;
  /** Whether its first field takes the focus on opening; false for a field you rarely change. */
  focusField?: boolean;
}

/** Modal based on the native <dialog> element (focus trap and Escape for free). */
export function Dialog({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
  cancelLabel,
  className = '',
  footer,
  focusField = true,
}: DialogProps) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (!el.open) {
      el.showModal();
      // The × comes first but shouldn't take the focus: the first field to type in does, or else
      // the dialog itself, so that no button looks picked (a focus ring reads as a selection).
      if (document.activeElement === el.querySelector('.dialog-close'))
        (
          (focusField &&
            el.querySelector<HTMLElement>(
              '.dialog-body :is(input:not([type="checkbox"], [type="radio"]), textarea)',
            )) ||
          el
        ).focus();
    }
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, [onClose]);
  // A click on the backdrop closes it, like Escape. Only a click that starts and ends there: a drag
  // from a field (selecting its text) that ends outside keeps it open. What the dialog holds (a menu
  // opened from it, a toast) is its child, never the dialog itself, so it never counts.
  const downOutside = useRef(false);
  const outside = (e: ReactPointerEvent | ReactMouseEvent) => {
    const el = ref.current!;
    if (e.target !== el) return false;
    const r = el.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
    onClose();
  };
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      tabIndex={-1}
      onPointerDown={(e) => (downOutside.current = outside(e))}
      onClick={(e) => {
        if (downOutside.current && outside(e)) onClose();
        downOutside.current = false;
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-header">
          <span>{title}</span>
          {/* Closes without doing anything, like Escape and Cancel. */}
          <IconButton
            className="icon-btn dialog-close"
            icon="close"
            label={t('common.close')}
            onClick={onClose}
          />
        </div>
        <div className="dialog-body">{children}</div>
        {onSubmit && (
          <div className="dialog-footer">
            {footer && <div className="dialog-footer-start">{footer}</div>}
            <button type="button" className="btn" onClick={onClose}>
              {cancelLabel ?? t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {submitLabel ?? t('common.ok')}
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
