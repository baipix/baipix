import type { Editor } from '../engine/editor';
import type { MessageKey } from '../i18n';

/** A starting point for a new file: a size, a palette that suits it, and the views it needs. */
export interface Template {
  id: string;
  label: MessageKey;
  width: number;
  height: number;
  palette: string;
  /** Symmetry for characters, tile preview for seamless tiles. Off otherwise. */
  mirrorX?: boolean;
  tile?: boolean;
}

export const TEMPLATES: Template[] = [
  { id: 'icon', label: 'template.icon', width: 16, height: 16, palette: 'sweetie16' },
  { id: 'sprite', label: 'template.sprite', width: 32, height: 32, palette: 'pico8', mirrorX: true },
  { id: 'tile', label: 'template.tile', width: 32, height: 32, palette: 'endesga32', tile: true },
  { id: 'portrait', label: 'template.portrait', width: 64, height: 64, palette: 'dawnbringer32' },
  { id: 'gameboy', label: 'template.gameboy', width: 160, height: 144, palette: 'gameboy' },
  { id: 'banner', label: 'template.banner', width: 128, height: 32, palette: 'resurrect64' },
];

/** Creates a file from a template: its size, its palette, its views (symmetry, tile preview). */
export function createFromTemplate(editor: Editor, template: Template, name?: string): void {
  editor.newFile(template.width, template.height, name);
  editor.setPalettePreset(template.palette);
  editor.setView('mirrorX', !!template.mirrorX);
  editor.setView('tile', !!template.tile);
  // Set up, but still untouched: it goes away if left as it is.
  editor.markFresh();
}
