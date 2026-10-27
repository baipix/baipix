import { alpha, type Color } from '../engine/color';
import { flatten } from '../engine/composite';
import { createDocument, fileNameOf, hasBackground, MAX_SIZE, type PixelDoc } from '../engine/document';
import type { Editor } from '../engine/editor';
import { uniqueColors, type PixelBlock } from '../engine/region';
import { detectPixelGrid, gridSize } from '../engine/upscale';
import { toAseprite } from '../engine/export/aseprite';
import { CODE_EXTENSIONS, codeOf, type CodeLanguage } from '../engine/export/code';
import { MAX_EXPORT_SIZE, renderGeometry, toLayeredSvg, toSvg } from '../engine/export/svg';
import { cutTiles, tiledMap, tiledTileset } from '../engine/export/tileset';
import { composeLayerSpriteSheet, exportableLayers } from '../engine/export/layers';
import { parsePaletteFile, toGpl, toHexList } from '../engine/palette';
import { t } from '../i18n';
import { copyHtmlAndPng, copyPng, copyText } from '../io/clipboard';
import { saveFile, safeFileName } from '../io/download';
import { imageToBlock, loadImage, readPixels } from '../io/image';
import { pickFile } from '../io/pickFile';
import { referenceFromFile } from '../io/reference';
import { zip } from '../io/zip';
import { canvasToBlob, renderToCanvas } from '../io/png';
import { FILE_EXTENSION, fileFromJson, fileToJson } from '../storage/fileFormat';
import { layerClipFromHtml, layerClipHtml, pixelClipHtml, pixelClipIdFromHtml } from '../storage/layerClip';
import { leaveHome, showEmptyHome } from './home';
import { openDialog, toast, uiStore } from './uiStore';

export type ExportFormat = 'png' | 'svg' | 'aseprite' | 'tileset' | 'layers';

const PALETTE_FILES = '.hex,.gpl,.txt,text/plain';

/** User-level commands shared by menus, buttons and shortcuts. */
export function createActions(editor: Editor) {
  const doc = () => editor.getState().doc;
  const undoDelete = () => ({ label: t('common.undo'), run: () => editor.restoreDeleted() });
  const baseName = () => safeFileName(doc().name);

  function renderInput(onlyActiveLayer: boolean, quiet = false) {
    const d = doc();
    const pixels = editor.flatten(
      onlyActiveLayer ? { onlyLayer: d.layers[d.activeLayer] } : { includeBackground: false },
    );
    const geometry = renderGeometry(d.width, d.height, d.render.pixelSize, d.render.gap);
    const withBackground = uiStore.get().exportBackground && !onlyActiveLayer && hasBackground(d);
    const background: Color = withBackground ? d.background : 0;
    if (!quiet && geometry.pixelSize !== d.render.pixelSize)
      toast(t('toast.exportShrunk', { size: geometry.pixelSize }));
    return { d, pixels, geometry, background };
  }

  /**
   * The drawing as a picture (PNG). With the background, the layers are laid over it, as on the
   * canvas: a blend mode mixes with it (a Multiply layer darkens it), instead of with nothing and
   * then being put on it as is. The background still fills the gaps between pixels.
   */
  function pictureInput(onlyActiveLayer: boolean, quiet = false) {
    const input = renderInput(onlyActiveLayer, quiet);
    if (!alpha(input.background)) return input;
    return {
      ...input,
      pixels: editor.flatten(),
      background: input.geometry.gap > 0 ? input.background : 0,
    };
  }

  /** The drawing as SVG: its layers and groups kept apart, or the active layer alone. */
  function svgOf(onlyActiveLayer: boolean): string {
    const { d, pixels, geometry, background } = renderInput(onlyActiveLayer);
    return onlyActiveLayer
      ? toSvg(pixels, d.width, d.height, geometry, background)
      : toLayeredSvg(d, geometry, background);
  }

  /** The drawing as code: the SVG with its layers, the rest made from the drawing merged. */
  function codeText(language: CodeLanguage, onlyActiveLayer: boolean, quiet = false): string {
    const { d, pixels, geometry, background } = renderInput(onlyActiveLayer, quiet);
    const flatSvg = toSvg(pixels, d.width, d.height, geometry, background);
    const svg = onlyActiveLayer ? flatSvg : toLayeredSvg(d, geometry, background);
    return codeOf(language, { name: d.name, width: d.width, height: d.height, pixels, svg, flatSvg });
  }

  /** Replaces the palette with a .hex, .gpl or .txt file (picked, or dropped on the canvas). */
  async function importPalette(file?: File | null) {
    const f = file ?? (await pickFile(PALETTE_FILES));
    if (!f) return;
    const colors = parsePaletteFile(await f.text());
    if (!colors.length) {
      toast(t('toast.noPaletteColors'));
      return;
    }
    editor.setPaletteColors(colors);
    toast(t('toast.colorsImported', { count: colors.length }));
  }

  /**
   * "Use as reference" in the toast after an image became pixels: takes the pixels back out, then
   * puts the image, sharp, under the drawing. `undoImport` removes what the import added.
   */
  const asReferenceAction = (file: File, undoImport: () => void) => ({
    label: t('reference.useInstead'),
    run: () => {
      undoImport();
      void actions.addReference(file);
    },
  });

  /** Removes the layer an image was just pasted on: an undo if nothing happened since, else a delete. */
  function removePastedLayer(): () => void {
    const s = editor.getState();
    const docId = s.doc.id;
    const layerId = s.doc.layers[s.doc.activeLayer].id;
    const revision = s.revision;
    return () => {
      if (editor.getState().revision === revision) return editor.undo();
      editor.switchBoard(docId);
      const i = editor.getState().doc.layers.findIndex((l) => l.id === layerId);
      if (i < 0) return;
      editor.setActiveLayer(i);
      editor.deleteLayers();
    };
  }

  async function report(filename: string, result: Promise<string>) {
    const r = await result;
    if (r === 'saved') toast(t('toast.saved', { name: filename }));
    else if (r === 'cancelled') toast(t('toast.downloadCancelled'));
    else toast(t('toast.downloadBusy'));
  }

  const actions = {
    async exportImage(format: ExportFormat, onlyActiveLayer = false) {
      if (format === 'tileset') return actions.exportTileset(onlyActiveLayer);
      if (format === 'layers') return actions.exportLayers();
      const filename = `${baseName()}.${format}`;
      // Aseprite: the layers as they are, to keep working on them there.
      if (format === 'aseprite') {
        const d = doc();
        const bytes = await toAseprite(d, {
          palette: editor.getState().palette.colors,
          background: uiStore.get().exportBackground && hasBackground(d) ? d.background : undefined,
        });
        await report(filename, saveFile(filename, new Blob([bytes as BlobPart])));
        return;
      }
      if (format === 'svg') {
        await report(filename, saveFile(filename, svgOf(onlyActiveLayer), 'image/svg+xml'));
        return;
      }
      const { d, pixels, geometry, background } = pictureInput(onlyActiveLayer);
      const blob = await canvasToBlob(renderToCanvas(pixels, d.width, d.height, geometry, background));
      await report(filename, saveFile(filename, blob, 'image/png'));
    },

    /**
     * Every board of the file in one .zip, each in `format` (PNG, SVG or Aseprite) and named after
     * it, as each would be exported on its own: its pixel size, the background if asked for.
     */
    async exportAllBoards(format: Exclude<ExportFormat, 'tileset' | 'layers'>) {
      const boards = editor.fileBoards();
      const used = new Set<string>();
      const nameOf = (d: PixelDoc) => {
        const base = safeFileName(d.name) || 'board';
        let name = base;
        for (let n = 2; used.has(name); n++) name = `${base} ${n}`;
        used.add(name);
        return `${name}.${format}`;
      };
      const withBackground = (d: PixelDoc) => uiStore.get().exportBackground && hasBackground(d);
      const files = [];
      for (const d of boards) {
        const geometry = renderGeometry(d.width, d.height, d.render.pixelSize, d.render.gap);
        const background: Color = withBackground(d) ? d.background : 0;
        let data: Uint8Array;
        if (format === 'aseprite')
          data = await toAseprite(d, {
            // The file's palette, or the drawing's colors when that's its palette (stored empty).
            palette: d.palette?.colors.length
              ? d.palette.colors
              : uniqueColors(flatten(d, { includeBackground: false })),
            background: withBackground(d) ? d.background : undefined,
          });
        else if (format === 'svg') data = new TextEncoder().encode(toLayeredSvg(d, geometry, background));
        else {
          // Over the background when it's included, as on the canvas (see pictureInput).
          const over = alpha(background) > 0;
          const pixels = flatten(d, { includeBackground: over });
          const png = await canvasToBlob(
            renderToCanvas(pixels, d.width, d.height, geometry, over && geometry.gap > 0 ? background : 0),
          );
          data = new Uint8Array(await png.arrayBuffer());
        }
        files.push({ name: nameOf(d), data });
      }
      const filename = `${safeFileName(fileNameOf(doc()))}.zip`;
      await report(filename, saveFile(filename, new Blob([zip(files) as BlobPart]), 'application/zip'));
    },

    /**
     * Exports visible layers as individual PNGs and a horizontal sprite sheet,
     * bundled into one .zip.
     */
    async exportLayers() {
      const d = doc();
      const layers = exportableLayers(d);

      if (!layers.length) return;

      const sheetWidth = d.width * layers.length;
      const sheetGeometry = renderGeometry(sheetWidth, d.height, d.render.pixelSize, d.render.gap);

      // renderGeometry stops shrinking at 1×, so the sheet may still exceed the limit.
      // Check dimensions before allocating layer pixel buffers or the combined sprite sheet.
      if (sheetGeometry.width > MAX_EXPORT_SIZE || sheetGeometry.height > MAX_EXPORT_SIZE) {
        toast(t('toast.exportTooLarge', { size: MAX_EXPORT_SIZE }));
        return;
      }

      const layerPixels = layers.map((layer) => flatten(d, { onlyLayer: layer }));
      const sheetPixels = composeLayerSpriteSheet(layerPixels, d.width, d.height);
      const layerGeometry = renderGeometry(d.width, d.height, sheetGeometry.pixelSize, sheetGeometry.gap);

      if (sheetGeometry.pixelSize !== d.render.pixelSize)
        toast(t('toast.exportShrunk', { size: sheetGeometry.pixelSize }));

      const usedNames = new Set<string>();

      const uniqueName = (filename: string): string => {
        const dot = filename.lastIndexOf('.');
        const stem = dot > 0 ? filename.slice(0, dot) : filename;
        const extension = dot > 0 ? filename.slice(dot) : '';
        let name = filename;

        for (let n = 2; usedNames.has(name); n++) {
          name = `${stem} ${n}${extension}`;
        }

        usedNames.add(name);
        return name;
      };

      // Reserve the sprite sheet's name before assigning layer filenames.
      const sheetName = uniqueName(`${baseName()}-sprite-sheet.png`);
      const layerNames = layers.map((layer) => `${safeFileName(layer.name)}.png`);
      const filenames = layerNames.map(uniqueName);

      const files: { name: string; data: Uint8Array }[] = [];

      for (const [index, pixels] of layerPixels.entries()) {
        const canvas = renderToCanvas(pixels, d.width, d.height, layerGeometry);
        const blob = await canvasToBlob(canvas);

        files.push({
          name: filenames[index],
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }

      const sheetCanvas = renderToCanvas(sheetPixels, sheetWidth, d.height, sheetGeometry);
      const sheetBlob = await canvasToBlob(sheetCanvas);

      files.push({
        name: sheetName,
        data: new Uint8Array(await sheetBlob.arrayBuffer()),
      });

      const filename = `${baseName()}.zip`;

      await report(filename, saveFile(filename, new Blob([zip(files) as BlobPart]), 'application/zip'));
    },

    /**
     * The drawing cut into tiles, for Godot and Tiled: a .zip with the sheet (PNG, at 1×), a Tiled
     * tileset (.tsj) and a Tiled map (.tmj) that draws the drawing again from it.
     */
    async exportTileset(onlyActiveLayer = false) {
      const d = doc();
      const name = baseName();
      const { exportTileWidth, exportTileHeight, exportTileDrop } = uiStore.get();
      const pixels = editor.flatten(
        onlyActiveLayer ? { onlyLayer: d.layers[d.activeLayer] } : { includeBackground: false },
      );
      const tiles = cutTiles(pixels, d.width, d.height, {
        tileWidth: exportTileWidth,
        tileHeight: exportTileHeight,
        dropEmpty: exportTileDrop,
        dropRepeats: exportTileDrop,
      });
      if (!tiles.tiles.length) return toast(t('toast.emptyTileset'));
      const { sheet, sheetWidth: w, sheetHeight: h } = tiles;
      const png = await canvasToBlob(renderToCanvas(sheet, w, h, renderGeometry(w, h, 1, 0), 0));
      const text = (s: string) => new TextEncoder().encode(s);
      const bytes = zip([
        { name: `${name}.png`, data: new Uint8Array(await png.arrayBuffer()) },
        { name: `${name}.tsj`, data: text(tiledTileset(tiles, name, `${name}.png`)) },
        { name: `${name}.tmj`, data: text(tiledMap(tiles, `${name}.tsj`)) },
      ]);
      const filename = `${name}.zip`;
      await report(filename, saveFile(filename, new Blob([bytes as BlobPart]), 'application/zip'));
    },

    /** The code's text, for the Export dialog's preview: no toast for a size that shrinks. */
    codePreview(language: CodeLanguage, onlyActiveLayer = false): string {
      return codeText(language, onlyActiveLayer, true);
    },

    async copyCode(language: CodeLanguage, onlyActiveLayer = false) {
      const code = codeText(language, onlyActiveLayer);
      if (await copyText(code)) toast(t('toast.codeCopied'));
      else
        openDialog({
          type: 'output',
          title: t('output.copyCodeTitle'),
          message: t('output.copyCodeBlocked'),
          text: code,
        });
    },

    async downloadCode(language: CodeLanguage, onlyActiveLayer = false) {
      const filename = `${baseName()}.${CODE_EXTENSIONS[language]}`;
      const type =
        language === 'svg' ? 'image/svg+xml' : language === 'json' ? 'application/json' : 'text/plain';
      await report(filename, saveFile(filename, codeText(language, onlyActiveLayer), type));
    },

    async copySvg(onlyActiveLayer = false) {
      const svg = svgOf(onlyActiveLayer);
      if (await copyText(svg)) toast(t('toast.svgCopied'));
      else
        openDialog({
          type: 'output',
          title: t('output.copySvgTitle'),
          message: t('output.copySvgBlocked'),
          text: svg,
        });
    },

    async copyPng(onlyActiveLayer = false) {
      const { d, pixels, geometry, background } = pictureInput(onlyActiveLayer);
      const canvas = renderToCanvas(pixels, d.width, d.height, geometry, background);
      if (await copyPng(await canvasToBlob(canvas))) toast(t('toast.pngCopied'));
      else
        openDialog({
          type: 'output',
          title: t('output.copyPngTitle'),
          message: t('output.copyPngBlocked'),
          image: canvas.toDataURL('image/png'),
        });
    },

    /** One of the user's own palettes from a .hex, .gpl or .txt file, named after the file. */
    async newPaletteFromFile() {
      const f = await pickFile(PALETTE_FILES);
      if (!f) return;
      const colors = parsePaletteFile(await f.text());
      if (!colors.length) return toast(t('toast.noPaletteColors'));
      editor.savePalette(f.name.replace(/\.[^.]+$/, ''), colors);
      toast(t('toast.colorsImported', { count: colors.length }));
    },

    /** `.hex` (one hex code per line, Lospec) or `.gpl` (GIMP, Aseprite, Krita). */
    async exportPalette(format: 'hex' | 'gpl' = 'hex') {
      const colors = editor.getState().palette.colors;
      const filename = `${baseName()}-palette.${format}`;
      const content = format === 'gpl' ? toGpl(colors, `${doc().name} palette`) : toHexList(colors);
      await report(filename, saveFile(filename, content, 'text/plain'));
    },

    importPalette,

    async saveDocument() {
      // The whole file, all its boards.
      const filename = `${safeFileName(fileNameOf(doc()))}${FILE_EXTENSION}`;
      await report(filename, saveFile(filename, fileToJson(editor.fileBoards()), 'application/json'));
    },

    async openDocument() {
      const file = await pickFile(`${FILE_EXTENSION},application/json`);
      if (!file) return;
      try {
        editor.addDocuments(fileFromJson(await file.text()));
        toast(t('toast.opened', { name: file.name }));
      } catch {
        toast(t('toast.notBaipix'));
      }
    },

    /** Same size as the canvas: added as a layer (unless `asNewFile`). Otherwise: a new file. */
    async importImage(file?: File | null, asNewFile = false) {
      const f = file ?? (await pickFile('image/*'));
      if (!f) return;
      if (/\.(hex|gpl)$/i.test(f.name)) {
        await importPalette(f);
        return;
      }
      if (f.name.endsWith(FILE_EXTENSION)) {
        try {
          editor.addDocuments(fileFromJson(await f.text()));
        } catch {
          toast(t('toast.notBaipix'));
        }
        return;
      }
      if (!f.type.startsWith('image/')) {
        toast(t('toast.notImage'));
        return;
      }
      let img: HTMLImageElement;
      try {
        img = await loadImage(f);
      } catch {
        toast(t('toast.unreadableImage'));
        return;
      }
      const name = f.name.replace(/\.[^.]+$/, '') || t('default.image');
      const d = doc();
      if (!asNewFile && img.naturalWidth === d.width && img.naturalHeight === d.height) {
        editor.paste(imageToBlock(img, d.width, d.height), name);
        editor.deselect();
        editor.setTool('pencil');
        toast(t('toast.imageAsLayer'), asReferenceAction(f, removePastedLayer()));
        return;
      }
      const previous = d.id;
      const addFile = (block: PixelBlock & { scaled?: boolean }, message: string) => {
        const next = createDocument(name, block.width, block.height, t('default.image'));
        next.layers[0].pixels.set(block.pixels);
        editor.addDocument(next);
        // From the home screen the new file is the point; elsewhere, offer to trace over it instead.
        if (asNewFile) return toast(message);
        toast(
          message,
          asReferenceAction(f, () => {
            editor.discardFile(next.id);
            editor.switchBoard(previous);
          }),
        );
      };
      const asItIs = () => {
        const block = imageToBlock(img, MAX_SIZE, MAX_SIZE);
        addFile(
          block,
          block.scaled
            ? t('toast.imageShrunk', { w: block.width, h: block.height, max: MAX_SIZE })
            : t('toast.imageAsFile', { w: block.width, h: block.height }),
        );
      };
      // Pixel art scaled up (a screenshot, an export at 800%): offer to bring it back to its pixels.
      const full = readPixels(img);
      const grid = full && detectPixelGrid(full.pixels, full.width, full.height);
      const size = full && grid && gridSize(full.width, full.height, grid);
      if (!full || !grid || !size || size.width > MAX_SIZE || size.height > MAX_SIZE) return asItIs();
      // Settles once a choice is made, so callers know whether a file was added.
      await new Promise<void>((resolve) =>
        openDialog({
          type: 'upscaled',
          image: full,
          grid,
          onRecover: (block) => {
            addFile(
              block,
              t('toast.pixelsRecovered', { w: block.width, h: block.height, scale: grid.scale }),
            );
            resolve();
          },
          onKeep: () => {
            asItIs();
            resolve();
          },
        }),
      );
    },

    /**
     * Copies the selected layers whole (Cmd+C with no pixels selected, or in the Layers panel), also
     * to the system clipboard: another file or tab pastes them, other apps get a PNG. `cut` deletes them.
     */
    copyLayers(cut = false) {
      const f = cut ? editor.cutLayers() : editor.copyLayers();
      if (!f) return false;
      const n = f.layers.length;
      if (cut) toast(n > 1 ? t('toast.layersCut', { count: n }) : t('toast.layerCut'));
      else toast(n > 1 ? t('toast.layersCopied', { count: n }) : t('toast.layerCopied'));
      const d = doc();
      const pixels = flatten(
        { ...d, width: f.width, height: f.height, layers: f.layers, groups: f.groups },
        {
          includeBackground: false,
        },
      );
      const geometry = renderGeometry(f.width, f.height, d.render.pixelSize, d.render.gap);
      // Not awaited: the browser may refuse (no focus, no permission); the copy here still works.
      void copyHtmlAndPng(
        layerClipHtml(f),
        canvasToBlob(renderToCanvas(pixels, f.width, f.height, geometry, 0)),
      );
      return true;
    },

    /**
     * Paste event: layers copied in Baipix (this file, another one, another tab) come back whole;
     * images from the system clipboard go on a new layer; otherwise the internal clipboard.
     */
    /**
     * Copies (or cuts) the selected pixels, and puts them on the system clipboard too, as a picture
     * with their id: a paste here then takes them, not what was on the clipboard before (a
     * screenshot, layers copied earlier), and other apps get the picture.
     */
    copyPixels(cut = false) {
      if (!(cut ? editor.cut() : editor.copy())) return false;
      toast(t(cut ? 'toast.cut' : 'toast.selectionCopied'));
      const copied = editor.copiedPixels();
      if (!copied) return true;
      const { block, id } = copied;
      const d = doc();
      const geometry = renderGeometry(block.width, block.height, d.render.pixelSize, d.render.gap);
      // Not awaited: the browser may refuse (no focus, no permission); the copy here still works.
      void copyHtmlAndPng(
        pixelClipHtml(id),
        canvasToBlob(renderToCanvas(block.pixels, block.width, block.height, geometry, 0)),
      );
      return true;
    },

    async pasteFromClipboard(files: File[], html = '') {
      // Pixels copied here last: the system clipboard holds their picture too, but they paste exact.
      const pixels = html ? pixelClipIdFromHtml(html) : null;
      if (pixels && editor.isCopiedPixels(pixels)) {
        editor.paste();
        return true;
      }
      const layers = html ? layerClipFromHtml(html) : null;
      if (layers && !editor.isOlderCopy(layers)) return editor.pasteLayers(layers);
      const image = files.find((f) => f.type.startsWith('image/'));
      if (image) {
        try {
          const d = doc();
          editor.paste(imageToBlock(await loadImage(image), d.width, d.height), t('default.pastedImage'));
          toast(t('toast.imagePasted'), asReferenceAction(image, removePastedLayer()));
        } catch {
          toast(t('toast.unreadableImage'));
        }
        return true;
      }
      if (editor.hasClipboard()) {
        editor.paste();
        return true;
      }
      return false;
    },

    // No confirmation: deleting is instant, and the toast offers to bring it back.
    /** Deleting the last file goes back to the empty home screen; Undo brings the file back. */
    deleteFile(id: string, name: string) {
      const last = editor.getState().files.length === 1;
      if (!editor.deleteFile(id)) return;
      if (!last) return toast(t('toast.deleted', { name }), undoDelete());
      showEmptyHome(editor);
      toast(t('toast.deleted', { name }), {
        label: t('common.undo'),
        run: () => editor.restoreDeleted() && leaveHome(editor),
      });
    },

    /** Deletes the active board, with an Undo toast; a file keeps at least one. */
    deleteBoard() {
      const { doc } = editor.getState();
      if (!editor.deleteBoard(doc.id)) return;
      toast(t('board.deleted', { name: doc.name }), undoDelete());
    },

    /** Deletes the boards selected as boards (the Delete key), with an Undo toast. */
    deleteSelectedBoards() {
      const { selectedBoards, boards } = editor.getState();
      const names = boards.filter((b) => selectedBoards.includes(b.id)).map((b) => b.name);
      const count = editor.deleteBoards(selectedBoards);
      if (!count) return;
      toast(
        count === 1 ? t('board.deleted', { name: names[0] }) : t('board.deletedMany', { count }),
        undoDelete(),
      );
    },

    /** Deletes the selected layers (or the active one), with an Undo toast. */
    deleteLayers() {
      const group = editor.getState().selectedGroup;
      const name = group
        ? doc().groups?.find((g) => g.id === group)?.name
        : doc().layers[doc().activeLayer].name;
      const count = editor.deleteLayers();
      if (count === 1 || (group && count)) toast(t('toast.deleted', { name: name ?? '' }), undoDelete());
      else if (count > 1) toast(t('toast.layersDeleted', { count }), undoDelete());
    },

    hasTransparentBackground: () => !alpha(doc().background),

    /** Removes the reference image, with an Undo in the toast (it isn't in the history). */
    removeReference() {
      const reference = doc().reference;
      if (!reference) return;
      const docId = doc().id;
      editor.setReference(null);
      toast(t('toast.referenceRemoved'), {
        label: t('common.undo'),
        run: () => {
          editor.switchBoard(docId);
          editor.setReference(reference);
        },
      });
    },

    /** Puts an image (picked, or given) under the drawing, fitted to the canvas. */
    async addReference(file?: File | null) {
      const f = file ?? (await pickFile('image/*'));
      if (!f) return;
      try {
        const d = doc();
        editor.setReference(await referenceFromFile(f, d.width, d.height));
        toast(t('toast.referenceAdded'));
      } catch {
        toast(t('toast.unreadableImage'));
      }
    },

    /**
     * Home screen import: a .baipix file or an image, always as a new file.
     * Resolves true when a file was added.
     */
    async openFile(file?: File | null): Promise<boolean> {
      const f = file ?? (await pickFile(`${FILE_EXTENSION},application/json,image/*`));
      if (!f) return false;
      const before = editor.getState().files.length;
      if (f.name.endsWith(FILE_EXTENSION) || f.type === 'application/json') {
        try {
          editor.addDocuments(fileFromJson(await f.text()));
          toast(t('toast.opened', { name: f.name }));
        } catch {
          toast(t('toast.notBaipix'));
        }
      } else {
        await actions.importImage(f, true);
      }
      return editor.getState().files.length > before;
    },
  };
  return actions;
}

export type Actions = ReturnType<typeof createActions>;
