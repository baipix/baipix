import { alpha, pack } from '../engine/color';
import { isLinkedInstance } from '../engine/components';
import type { Editor, FileInfo } from '../engine/editor';
import { LOCALES, getLocale, setLocale, t } from '../i18n';
import type { Actions } from './actions';
import type { MenuItem } from './components/Menu';
import { getTheme, setTheme, type ThemePreference } from './theme';
import { openAdjust, openDialog, toast, uiStore } from './uiStore';

import { viewport } from './viewport';
import { ALIGNS } from './components/ToolOptionsBar';

const GITHUB_URL = 'https://github.com/baipix/baipix';
const CHANGELOG_URL = `${GITHUB_URL}/blob/main/CHANGELOG.md`;

/** A file's "…" menu, in the Files list and on the home screen cards. */
export function fileMenu(editor: Editor, actions: Actions, file: FileInfo): MenuItem[] {
  return [
    { label: t('file.duplicate'), onSelect: () => editor.duplicateFile(file.id) },
    {
      label: t('file.download'),
      onSelect: () => (editor.switchFile(file.id), void actions.saveDocument()),
    },
    '-',
    { label: t('common.delete'), onSelect: () => actions.deleteFile(file.id, file.name) },
  ];
}

/**
 * The files menu of the left panel's header: the most recent files (the current one checked),
 * the current file's actions, and the home screen with all of them.
 */
export function filesMenu(editor: Editor, actions: Actions): MenuItem[] {
  const s = editor.getState();
  const current = s.files.find((f) => f.id === s.activeId)!;
  const recent = [...s.files].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  return [
    ...recent.map((f) => ({
      label: f.name,
      checked: f.id === s.activeId,
      onSelect: () => editor.switchFile(f.id),
    })),
    '-',
    ...fileMenu(editor, actions, current),
    '-',
    { label: t('menu.newFile'), onSelect: () => openDialog({ type: 'newFile' }) },
    { label: t('menu.open'), shortcut: 'Ctrl+O', onSelect: () => void actions.openDocument() },
    { label: t('menu.importImage'), onSelect: () => void actions.importImage() },
    '-',
    { label: t('file.allFiles'), onSelect: () => uiStore.set({ home: true }) },
  ];
}

/** Puts the Design tab's Canvas section in view, open, then runs `then` once it's rendered. */
function revealCanvas(then: () => void) {
  uiStore.set((u) => ({ rightTab: 'design', collapsed: u.collapsed.filter((x) => x !== 'canvas') }));
  requestAnimationFrame(then);
}

/** Pastes the system clipboard's image if the browser lets us read it, else what was copied here. */
async function paste(editor: Editor, actions: Actions) {
  try {
    const files: File[] = [];
    let html = '';
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
      const type = item.types.find((x) => x.startsWith('image/'));
      if (type) files.push(new File([await item.getType(type)], 'clipboard', { type }));
    }
    if (await actions.pasteFromClipboard(files, html)) return;
  } catch {
    /* no permission to read the clipboard: fall back to our own */
  }
  if (editor.hasClipboard()) editor.paste();
}

export interface MenuBarMenu {
  id: 'file' | 'edit' | 'image' | 'layer' | 'select' | 'view' | 'help';
  items: (editor: Editor, actions: Actions) => MenuItem[];
}

/** The menu bar's menus, in order. Built when opened, so they show the current state. */
export const MENU_BAR: MenuBarMenu[] = [
  {
    id: 'file',
    items: (editor, actions) => {
      const s = editor.getState();
      const current = s.files.find((f) => f.id === s.activeId)!;
      const recent = [...s.files].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
      return [
        { label: t('menu.newFile'), onSelect: () => openDialog({ type: 'newFile' }) },
        { label: t('menu.open'), shortcut: 'Ctrl+O', onSelect: () => void actions.openDocument() },
        {
          label: t('menu.recent'),
          items: [
            ...recent.map((f) => ({
              label: f.name,
              checked: f.id === s.activeId,
              onSelect: () => editor.switchFile(f.id),
            })),
            '-',
            { label: t('file.allFiles'), onSelect: () => uiStore.set({ home: true }) },
          ],
        },
        { label: t('menu.importImage'), onSelect: () => void actions.importImage() },
        { label: t('menu.reference'), onSelect: () => void actions.addReference() },
        '-',
        { label: t('menu.duplicateFile'), onSelect: () => editor.duplicateFile(current.id) },
        {
          label: t('menu.renameFile'),
          shortcut: 'F2',
          onSelect: () => requestAnimationFrame(renameFile),
        },
        { label: t('file.download'), onSelect: () => void actions.saveDocument() },
        '-',
        {
          label: t('menu.export'),
          shortcut: 'Ctrl+E',
          onSelect: () =>
            void actions.exportImage(uiStore.get().exportFormat, uiStore.get().exportActiveLayer),
        },
        '-',
        { label: t('menu.deleteFile'), onSelect: () => actions.deleteFile(current.id, current.name) },
      ];
    },
  },
  {
    id: 'edit',
    items: (editor, actions) => {
      const s = editor.getState();
      return [
        { label: t('menu.undo'), shortcut: 'Ctrl+Z', disabled: !s.canUndo, onSelect: () => editor.undo() },
        {
          label: t('menu.redo'),
          shortcut: 'Ctrl+Shift+Z',
          disabled: !s.canRedo,
          onSelect: () => editor.redo(),
        },
        '-',
        {
          label: t('menu.cut'),
          shortcut: 'Ctrl+X',
          onSelect: () => (s.selection ? editor.cut() && toast(t('toast.cut')) : actions.copyLayers(true)),
        },
        {
          label: t('menu.copy'),
          shortcut: 'Ctrl+C',
          onSelect: () =>
            s.selection ? editor.copy() && toast(t('toast.selectionCopied')) : actions.copyLayers(),
        },
        { label: t('menu.paste'), shortcut: 'Ctrl+V', onSelect: () => void paste(editor, actions) },
        { label: t('menu.copyPng'), onSelect: () => void actions.copyPng() },
        { label: t('menu.copySvg'), shortcut: 'Ctrl+Shift+C', onSelect: () => void actions.copySvg() },
        '-',
        {
          label: s.selection ? t('menu.fillSelection') : t('menu.fillLayer'),
          shortcut: 'Shift+Del',
          onSelect: () => editor.fill(),
        },
        {
          label: s.selection ? t('menu.clearSelection') : t('menu.clearLayer'),
          shortcut: 'Del',
          onSelect: () => editor.clearSelection(),
        },
        '-',
        { label: t('color.swap'), shortcut: 'X', onSelect: () => editor.swapColors() },
      ];
    },
  },
  {
    id: 'image',
    items: (editor) => [
      {
        label: t('menu.canvasSize'),
        onSelect: () => openDialog({ type: 'canvasSize' }),
      },
      {
        label: t('menu.background'),
        onSelect: () =>
          revealCanvas(() => {
            const s = editor.getState();
            if (!s.doc.background)
              editor.setBackground(alpha(s.secondary) ? s.secondary : pack(255, 255, 255), true);
            const width = document.querySelector(`input[aria-label="${t('canvas.width')}"]`);
            const row = width?.closest('.section')?.querySelector('.subsection-title');
            uiStore.set({ picker: { slot: 'background', top: row?.getBoundingClientRect().top ?? 120 } });
          }),
      },
      '-',
      { label: t('menu.flipH'), shortcut: 'Shift+H', onSelect: () => editor.flip(true) },
      { label: t('menu.flipV'), shortcut: 'Shift+V', onSelect: () => editor.flip(false) },
      { label: t('menu.rotate'), shortcut: 'Shift+R', onSelect: () => editor.rotate() },
      { label: t('menu.rotateLeft'), shortcut: 'Alt+Shift+R', onSelect: () => editor.rotate(false) },
      '-',
      { label: t('menu.adjustColors'), shortcut: 'Ctrl+U', onSelect: () => openAdjust('all') },
    ],
  },
  {
    id: 'layer',
    items: (editor, actions) => {
      const { doc, referenceSelected, selectedGroup } = editor.getState();
      const layer = doc.layers[doc.activeLayer];
      const disabled = referenceSelected;
      return [
        { label: t('layer.new'), shortcut: 'Shift+N', onSelect: () => editor.addLayer() },
        { label: t('group.create'), shortcut: 'Ctrl+G', disabled, onSelect: () => editor.groupSelection() },
        {
          label: t('component.create'),
          shortcut: 'Ctrl+Alt+K',
          disabled: disabled || !!layer.instance,
          onSelect: () => editor.createComponent(),
        },
        {
          label: t('repeat.menu'),
          disabled,
          onSelect: () => editor.beginRepeat(),
        },
        {
          label: t('component.goTo'),
          disabled: disabled || !isLinkedInstance(doc, layer),
          onSelect: () => editor.goToMaster(),
        },
        {
          label: t('component.detach'),
          shortcut: 'Ctrl+Alt+B',
          disabled: disabled || !isLinkedInstance(doc, layer),
          onSelect: () => editor.detachInstance(),
        },
        {
          label: t('group.ungroup'),
          shortcut: 'Ctrl+Shift+G',
          disabled: !selectedGroup,
          onSelect: () => selectedGroup && editor.ungroup(selectedGroup),
        },
        {
          label: t('group.merge'),
          disabled: !selectedGroup,
          onSelect: () => selectedGroup && editor.mergeGroup(selectedGroup),
        },
        {
          label: t('layer.duplicate'),
          shortcut: 'Shift+D',
          disabled,
          onSelect: () => editor.duplicateLayer(),
        },
        {
          label: t('layer.delete'),
          disabled: disabled || doc.layers.length < 2,
          onSelect: () => actions.deleteLayers(),
        },
        '-',
        {
          label: t('layer.mergeDown'),
          shortcut: 'Shift+M',
          disabled: disabled || !editor.canMergeDown(),
          onSelect: () => editor.mergeDown(),
        },
        {
          label: t('menu.layerUp'),
          shortcut: 'Alt+↑',
          disabled: disabled || !editor.canMoveLayer(1),
          onSelect: () => editor.moveLayer(1),
        },
        {
          label: t('menu.layerDown'),
          shortcut: 'Alt+↓',
          disabled: disabled || !editor.canMoveLayer(-1),
          onSelect: () => editor.moveLayer(-1),
        },
        '-',
        {
          label: t('menu.align'),
          disabled,
          items: ALIGNS.map((a) => ({
            label: t(a.label),
            shortcut: a.shortcut,
            onSelect: () => editor.align(a.to),
          })),
        },
        {
          label: t('menu.outline'),
          shortcut: 'Shift+O',
          disabled,
          onSelect: () => openAdjust('layer', 'outline'),
        },
        '-',
        {
          label: layer.visible ? t('menu.hideLayer') : t('menu.showLayer'),
          disabled,
          onSelect: () => editor.setLayerVisible(doc.activeLayer, !layer.visible),
        },
        {
          label: layer.locked ? t('menu.unlockLayer') : t('menu.lockLayer'),
          disabled,
          onSelect: () => editor.setLayerLocked(doc.activeLayer, !layer.locked),
        },
      ];
    },
  },
  {
    id: 'select',
    items: (editor) => {
      const s = editor.getState();
      return [
        { label: t('menu.selectAll'), shortcut: 'Ctrl+A', onSelect: () => editor.selectAll() },
        {
          label: t('menu.deselect'),
          shortcut: 'Ctrl+D',
          disabled: !s.selection,
          onSelect: () => editor.deselect(),
        },
        '-',
        {
          label: t('brush.fromSelection'),
          disabled: !s.selection,
          onSelect: () => editor.brushFromSelection(),
        },
      ];
    },
  },
  {
    id: 'view',
    items: (editor) => {
      const s = editor.getState();
      return [
        {
          label: t('menu.grid'),
          shortcut: 'Shift+G',
          checked: s.view.grid,
          onSelect: () => editor.toggleView('grid'),
        },
        {
          label: t('menu.tile'),
          shortcut: 'Shift+T',
          checked: s.view.tile,
          onSelect: () => editor.toggleView('tile'),
        },
        {
          label: t('display.mirrorX'),
          shortcut: 'Shift+X',
          checked: s.view.mirrorX,
          onSelect: () => editor.toggleView('mirrorX'),
        },
        {
          label: t('display.mirrorY'),
          shortcut: 'Shift+Y',
          checked: s.view.mirrorY,
          onSelect: () => editor.toggleView('mirrorY'),
        },
        {
          label: t('display.rulers'),
          checked: s.view.rulers,
          onSelect: () => editor.toggleView('rulers'),
        },
        {
          label: t('menu.preview'),
          shortcut: 'Shift+P',
          checked: uiStore.get().preview.open,
          onSelect: togglePreview,
        },
        '-',
        { label: t('zoom.in'), shortcut: 'Ctrl+=', onSelect: () => viewport.step(1) },
        { label: t('zoom.out'), shortcut: 'Ctrl+-', onSelect: () => viewport.step(-1) },
        { label: t('zoom.fit'), shortcut: 'Shift+1', onSelect: () => viewport.fit(s.doc) },
        { label: t('zoom.to', { value: 100 }), shortcut: 'Shift+0', onSelect: () => viewport.zoomTo(1) },
        '-',
        {
          label: t('menu.hideUi'),
          shortcut: 'Tab',
          onSelect: () => uiStore.set((u) => ({ uiHidden: !u.uiHidden })),
        },
        '-',
        {
          label: t('menu.theme'),
          items: (['system', 'light', 'dark'] as ThemePreference[]).map((theme) => ({
            label: t(`theme.${theme}`),
            checked: getTheme() === theme,
            onSelect: () => setTheme(theme),
          })),
        },
        {
          label: t('menu.language'),
          items: LOCALES.map((l) => ({
            label: l.label,
            checked: getLocale() === l.id,
            onSelect: () => setLocale(l.id),
          })),
        },
      ];
    },
  },
  {
    id: 'help',
    items: () => [
      {
        label: t('menu.commandPalette'),
        shortcut: 'Ctrl+K',
        onSelect: () => uiStore.set({ commandPalette: true }),
      },
      { label: t('menu.shortcuts'), shortcut: '?', onSelect: () => openDialog({ type: 'shortcuts' }) },
      { label: t('menu.tour'), onSelect: () => uiStore.set({ tour: 0 }) },
      { label: t('menu.github'), onSelect: () => window.open(GITHUB_URL, '_blank', 'noopener') },
      '-',
      {
        label: t('menu.version', { version: __APP_VERSION__ }),
        onSelect: () => window.open(CHANGELOG_URL, '_blank', 'noopener'),
      },
    ],
  },
];

export const togglePreview = () => uiStore.set((u) => ({ preview: { ...u.preview, open: !u.preview.open } }));

/** Starts editing the file name in the menu bar. */
export function renameFile() {
  document.querySelector<HTMLInputElement>('.menubar-file input')?.select();
}

/** The menu bar's menus as submenus: the ☰ button on narrow windows and phones. */
export function mainMenu(editor: Editor, actions: Actions): MenuItem[] {
  return MENU_BAR.map((m) => ({ label: t(`menu.${m.id}`), items: m.items(editor, actions) }));
}

export function zoomMenu(editor: Editor): MenuItem[] {
  return [
    { label: t('zoom.in'), shortcut: '+', onSelect: () => viewport.step(1) },
    { label: t('zoom.out'), shortcut: '−', onSelect: () => viewport.step(-1) },
    '-',
    { label: t('zoom.fit'), shortcut: 'Shift+1', onSelect: () => viewport.fit(editor.getState().doc) },
    ...[1, 8, 16, 32].map((z) => ({
      label: t('zoom.to', { value: z * 100 }),
      shortcut: z === 1 ? 'Shift+0' : undefined,
      onSelect: () => viewport.zoomTo(z),
    })),
  ];
}
