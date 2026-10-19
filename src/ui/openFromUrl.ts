import type { Editor } from '../engine/editor';
import { t } from '../i18n';
import { FILE_EXTENSION, fileFromJson } from '../storage/fileFormat';
import { toast } from './uiStore';

/**
 * `?open=/path/to/drawing.baipix` opens that file once the workspace is loaded, as File › Open
 * would: the site's guides and gallery link to the editor with their example ready. Only a .baipix
 * file from this same site is opened, never one from elsewhere. The parameter is taken out of the
 * address right away, so a reload doesn't open the file a second time.
 * Returns whether a file was opened.
 */
export async function openFromUrl(editor: Editor): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  const path = params.get('open');
  if (!path) return false;
  params.delete('open');
  const rest = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
  let url: URL;
  try {
    url = new URL(path, location.href);
  } catch {
    return false;
  }
  if (url.origin !== location.origin || !url.pathname.endsWith(FILE_EXTENSION)) return false;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const docs = fileFromJson(await response.text());
    editor.addDocuments(docs);
    toast(t('toast.opened', { name: docs[0].board?.fileName ?? docs[0].name }));
    return true;
  } catch {
    toast(t('toast.notBaipix'));
    return false;
  }
}
