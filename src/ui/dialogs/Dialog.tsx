import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
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
}: DialogProps) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (!el.open) {
      el.showModal();
      // The × comes first but shouldn't take the focus: the first field or button after it does.
      if (document.activeElement === el.querySelector('.dialog-close'))
        el.querySelector<HTMLElement>(
          '.dialog-body :is(input, textarea, select, button), .dialog-footer button',
        )?.focus();
    }
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, [onClose]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
    onClose();
  };
  return (
    <dialog ref={ref} className={`dialog ${className}`}>
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
