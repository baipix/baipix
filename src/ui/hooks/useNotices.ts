import { useEffect } from 'react';
import type { Editor, Notice } from '../../engine/editor';
import { t } from '../../i18n';
import { toast } from '../uiStore';

const message = (n: Notice): string => {
  switch (n.type) {
    case 'layerHidden':
      return t('toast.layerHidden');
    case 'layerLocked':
      return t('toast.layerLocked');
    case 'colorInPalette':
      return t('toast.colorInPalette');
    case 'colorNotInPalette':
      return t('toast.colorNotInPalette');
    case 'emptyDrawing':
      return t('toast.emptyDrawing');
    case 'rampAdded':
      return n.count ? t('toast.rampAdded', { count: n.count }) : t('toast.rampExists');
    case 'extracted':
      return t('toast.extracted', { count: n.count });
    case 'pasted':
      return t('toast.pasted');
    case 'merged':
      return t('toast.merged');
    case 'groupTooDeep':
      return t('toast.groupTooDeep');
    case 'instanceLocked':
      return t('toast.instanceLocked');
    case 'componentCreated':
      return t('toast.componentCreated');
  }
};

/** Turns engine notices into translated toasts. */
export function useNotices(editor: Editor) {
  useEffect(() => editor.onNotice((n) => toast(message(n))), [editor]);
}
