import { createPortal } from 'react-dom';
import { dismissToast, toastStore } from '../uiStore';

export function Toasts() {
  const toasts = toastStore.use((s) => s.toasts);
  const last = toasts[toasts.length - 1];
  // An open modal dialog sits above the page, its backdrop blurring it: the toast goes inside, or
  // a copy from the export (say) would be told behind the blur.
  const dialog = last ? document.querySelector('dialog:modal') : null;
  const toast = (
    <div className={`toast${last ? ' is-visible' : ''}`} role="status" aria-live="polite">
      {last?.message}
      {last?.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            dismissToast(last.id);
            last.action!.run();
          }}
        >
          {last.action.label}
        </button>
      )}
    </div>
  );
  return dialog ? createPortal(toast, dialog) : toast;
}
