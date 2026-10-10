import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { useT } from '../../i18n';

interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Called on submit (Enter / primary button). */
  onSubmit?: () => void;
  submitLabel?: string;
  /** Hide the cancel button (informational dialogs). */
  hideCancel?: boolean;
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
  hideCancel,
  cancelLabel,
  className = '',
  footer,
}: DialogProps) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (!el.open) el.showModal();
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
        <div className="dialog-header">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-footer">
          {footer && <div className="dialog-footer-start">{footer}</div>}
          {!hideCancel && (
            <button type="button" className="btn" onClick={onClose}>
              {cancelLabel ?? t('common.cancel')}
            </button>
          )}
          <button type="submit" className="btn btn-primary" autoFocus={hideCancel}>
            {submitLabel ?? t('common.ok')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
