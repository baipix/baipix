import { useEffect, useRef, useState } from 'react';

/** Inline rename on double-click, used by files and layers. */
export function EditableName({
  value,
  onRename,
  className = 'item-name',
  startEditing = false,
  onEditingStarted,
  onEditingChange,
}: {
  value: string;
  onRename: (v: string) => void;
  className?: string;
  /** Starts editing from outside (a menu's Rename); `onEditingStarted` then clears the request. */
  startEditing?: boolean;
  onEditingStarted?: () => void;
  /** Told when the field opens and closes (a draggable card stays put while it's open). */
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  useEffect(() => onEditingChange?.(editing), [editing, onEditingChange]);
  useEffect(() => {
    if (!startEditing) return;
    setEditing(true);
    onEditingStarted?.();
  }, [startEditing, onEditingStarted]);
  if (!editing)
    return (
      <span
        className={className}
        // The full name as a tooltip, only when it's cut with an ellipsis.
        data-tip=""
        onPointerEnter={(e) => {
          const el = e.currentTarget;
          el.dataset.tip = el.scrollWidth > el.clientWidth ? value : '';
        }}
        onDoubleClick={() => setEditing(true)}
      >
        {value}
      </span>
    );
  const done = (save: boolean) => {
    if (save && ref.current) onRename(ref.current.value);
    setEditing(false);
  };
  return (
    <span className={className}>
      <input
        ref={ref}
        defaultValue={value}
        autoFocus
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') done(true);
          if (e.key === 'Escape') done(false);
        }}
      />
    </span>
  );
}
