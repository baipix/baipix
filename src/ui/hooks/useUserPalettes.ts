import { useCallback, useMemo } from 'react';
import type { Color } from '../../engine/color';
import { MY_PALETTE } from '../../engine/editor';
import { PALETTE_PRESETS, presetColors } from '../../engine/palette';
import { useT } from '../../i18n';
import { useEditorState } from '../EditorContext';
import { uiStore } from '../uiStore';

/**
 * The palettes as the user set them up in Manage palettes, in the same shape as `PALETTE_PRESETS`
 * and `presetColors`: the file's custom palette, the user's own palettes, then the presets they keep
 * shown. Keys follow the file palette's: 'custom', `mine:<id>`, or the preset's key.
 */
export function useUserPalettes(): {
  palettes: Record<string, { name: string }>;
  paletteColors: (key: string) => Color[];
} {
  const t = useT();
  const custom = useEditorState((s) => s.palette.custom);
  const myPalettes = useEditorState((s) => s.myPalettes);
  const hidden = uiStore.use((s) => s.hiddenPalettes);

  const palettes = useMemo(() => {
    const list: Record<string, { name: string }> = {};
    if (custom?.length) list.custom = { name: t('palette.custom') };
    for (const m of myPalettes) list[MY_PALETTE + m.id] = { name: m.name };
    for (const [key, p] of Object.entries(PALETTE_PRESETS)) if (!hidden.includes(key)) list[key] = p;
    return list;
  }, [t, custom, myPalettes, hidden]);

  const paletteColors = useCallback(
    (key: string): Color[] =>
      key === 'custom'
        ? (custom ?? [])
        : key.startsWith(MY_PALETTE)
          ? (myPalettes.find((m) => MY_PALETTE + m.id === key)?.colors ?? [])
          : presetColors(key),
    [custom, myPalettes],
  );

  return { palettes, paletteColors };
}
