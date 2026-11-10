import { createPortal } from 'react-dom';
import { dismissToast, setToastDetailsOpen, toastStore } from '../uiStore';

export function Toasts() {
  const toasts = toastStore.use((s) => s.toasts);
  const last = toasts[toasts.length - 1];
  // An open modal dialog sits above the page, its backdrop blurring it: the toast goes inside, or
  // a copy from the export (say) would be told behind the blur.
  const dialog = last ? document.querySelector('dialog:modal') : null;
  const toast = (
    <div className={`toast${last ? ' is-visible' : ''}`} role="status" aria-live="polite">
      {last?.message}

      {last?.details && (
        <details
          className="toast-details"
          onToggle={(event) => setToastDetailsOpen(last.id, event.currentTarget.open)}
        >
          <summary>{last.details.label}</summary>

          <ul className="toast-details-list">
            {last.details.items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </details>
      )}

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
