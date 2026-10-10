import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { IconName } from '../icons';
import { createStore } from '../store';
import { Icon } from './Icon';

export type MenuItem =
  | '-'
  | {
      label: string;
      icon?: IconName;
      shortcut?: string;
      checked?: boolean;
      disabled?: boolean;
      /** CSS colors shown as a strip under the label (a palette). */
      swatches?: string[];
      /** Hovered or reached with the arrow keys: a live preview of what it would do. */
      onHover?: () => void;
      /** A submenu, opened on hover, click or →. */
      items?: MenuItem[];
      onSelect?: () => void;
    };

export interface MenuOptions {
  /** ← / → on the top level: the menu bar opens its previous or next menu. */
  onSwitch?: (direction: 1 | -1) => void;
  /** The pointer left the menu: the preview goes back to how things were. */
  onHoverEnd?: () => void;
  /** The menu closed, before the chosen item (if any) runs: ends a preview. */
  onClose?: () => void;
}

const menuStore = createStore<{
  anchor: HTMLElement | null;
  items: MenuItem[];
  options: MenuOptions;
  /** Changes with every menu opened, to start each one afresh. */
  seq: number;
}>({
  seq: 0,
  anchor: null,
  items: [],
  options: {},
});

/** Opens a menu under `anchor`. Clicking the same anchor again closes it. */
export function openMenu(anchor: HTMLElement, items: MenuItem[], options: MenuOptions = {}): void {
  if (menuStore.get().anchor === anchor) return closeMenu();
  menuStore.get().options.onClose?.();
  menuStore.get().anchor?.setAttribute('aria-expanded', 'false');
  anchor.setAttribute('aria-expanded', 'true');
  menuStore.set((s) => ({ anchor, items, options, seq: s.seq + 1 }));
}

export function closeMenu(): void {
  const { anchor, options } = menuStore.get();
  anchor?.setAttribute('aria-expanded', 'false');
  menuStore.set({ anchor: null, items: [], options: {} });
  options.onClose?.();
}

export const isMenuOpen = (): boolean => menuStore.get().anchor !== null;
export const menuAnchor = (): HTMLElement | null => menuStore.get().anchor;

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "Ctrl+Shift+Z" as the Mac writes it (⌘⇧Z); unchanged elsewhere. */
export function formatShortcut(shortcut: string): string {
  if (!IS_MAC) return shortcut;
  return shortcut
    .replace(/Ctrl\+/g, '⌘')
    .replace(/Shift\+/g, '⇧')
    .replace(/Alt\+/g, '⌥')
    .replace(/\bDel\b/g, '⌫');
}

/** The menu's own buttons, without those of an open submenu. */
const ownButtons = (panel: HTMLElement | null) => [
  ...(panel?.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)') ?? []),
];

/** One level of a menu: under its anchor, or beside the item that opened it. */
function MenuPanel({
  items,
  anchor,
  side,
  autoFocus,
  onBack,
}: {
  items: MenuItem[];
  anchor: DOMRect;
  /** A submenu, beside its item (else under the anchor). */
  side: boolean;
  /** Opened from the keyboard: the first item takes the focus. */
  autoFocus: boolean;
  onBack?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  const [open, setOpen] = useState<{ index: number; rect: DOMRect; focus: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    let left = side ? anchor.right + 4 : anchor.left;
    let top = side ? anchor.top - 8 : anchor.bottom + 4;
    if (left + w > innerWidth - 8) left = side ? anchor.left - 4 - w : innerWidth - 8 - w;
    if (top + h > innerHeight - 8) top = side ? innerHeight - 8 - h : Math.max(8, anchor.top - 4 - h);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [anchor, side, items]);

  useEffect(() => {
    if (autoFocus) ownButtons(ref.current)[0]?.focus();
  }, [autoFocus]);

  const openSub = (index: number, button: HTMLElement, focus: boolean) =>
    setOpen({ index, rect: button.getBoundingClientRect(), focus });

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const buttons = ownButtons(ref.current);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const item = items.filter((x) => x !== '-' && !x.disabled)[i];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = buttons.length;
      buttons[e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n]?.focus();
    } else if (e.key === 'ArrowRight' && item && item !== '-' && item.items) {
      openSub(items.indexOf(item), buttons[i], true);
    } else if (e.key === 'ArrowLeft' && onBack) {
      onBack();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      menuStore.get().options.onSwitch?.(e.key === 'ArrowRight' ? 1 : -1);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const sub = open && items[open.index];
  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      style={pos}
      onKeyDown={onKeyDown}
      onPointerLeave={(e) => {
        // Only when leaving the whole menu, not into one of its submenus.
        if (!(e.relatedTarget instanceof Node && ref.current?.contains(e.relatedTarget)))
          menuStore.get().options.onHoverEnd?.();
      }}
    >
      {items.map((item, i) =>
        item === '-' ? (
          <div key={i} className="menu-separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            aria-haspopup={item.items ? 'menu' : undefined}
            aria-expanded={item.items ? open?.index === i : undefined}
            className={`menu-item${item.checked ? ' is-checked' : ''}${item.items ? ' has-submenu' : ''}${
              item.swatches ? ' has-swatches' : ''
            }`}
            disabled={item.disabled}
            onPointerEnter={(e) => {
              item.onHover?.();
              if (item.items) openSub(i, e.currentTarget, false);
              else setOpen(null);
            }}
            onFocus={() => item.onHover?.()}
            onClick={(e) => {
              if (item.items) return openSub(i, e.currentTarget, false);
              closeMenu();
              item.onSelect?.();
            }}
          >
            {item.icon && <Icon name={item.icon} size={16} />}
            <span>{item.label}</span>
            {item.shortcut && <span className="menu-shortcut">{formatShortcut(item.shortcut)}</span>}
            {item.items && <span className="menu-chevron" aria-hidden="true" />}
            {item.swatches && (
              <span className="menu-swatches" aria-hidden="true">
                {item.swatches.map((c, k) => (
                  <i key={k} style={{ background: c }} />
                ))}
              </span>
            )}
          </button>
        ),
      )}
      {sub && sub !== '-' && sub.items && (
        <MenuPanel
          key={open.index}
          items={sub.items}
          anchor={open.rect}
          side
          autoFocus={open.focus}
          onBack={() => {
            ownButtons(ref.current)[items.filter((x) => x !== '-' && !x.disabled).indexOf(sub)]?.focus();
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

/** Dark dropdown menu. Rendered once at the app root. */
export function MenuHost() {
  const { anchor, items, seq } = menuStore.use((s) => s);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchor.contains(target)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only the menu: a dialog it opened from stays open.
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        anchor.focus();
        return;
      }
      // Focus still on the anchor: the arrows enter the menu, or move along the menu bar.
      if (ref.current?.contains(document.activeElement)) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        ownButtons(ref.current?.querySelector('.menu') ?? null)[0]?.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const onSwitch = menuStore.get().options.onSwitch;
        if (!onSwitch) return;
        e.preventDefault();
        onSwitch(e.key === 'ArrowRight' ? 1 : -1);
      }
    };
    const onResize = () => closeMenu();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
    };
  }, [anchor]);

  if (!anchor) return null;
  const menu = (
    <div ref={ref} className="menu-host">
      <MenuPanel
        key={seq}
        items={items}
        anchor={anchor.getBoundingClientRect()}
        side={false}
        autoFocus={false}
      />
    </div>
  );
  // A modal dialog sits above the whole page and leaves it inert: a menu opened from one goes
  // inside it, or it would open behind it.
  const dialog = anchor.closest('dialog');
  return dialog ? createPortal(menu, dialog) : menu;
}
