import { useEffect, useRef } from 'react';
import { alpha, toCss } from '../../engine/color';
import { flatten } from '../../engine/composite';
import { hasBackground } from '../../engine/document';
import { renderGeometry } from '../../engine/export/svg';
import { useT } from '../../i18n';
import { pixelsToCanvas } from '../../io/png';
import { useEditor, useEditorState } from '../EditorContext';
import { checkerPattern, readTheme } from '../render/theme';
import { uiStore } from '../uiStore';

/**
 * Live preview of the exported image: pixel size, gap, background and "active layer only" as they
 * will be in the file, scaled to fit. Drawn at preview size, never at the (possibly huge) real size.
 */
export function ExportPreview() {
  const t = useT();
  const editor = useEditor();
  const ref = useRef<HTMLCanvasElement>(null);
  const doc = useEditorState((s) => s.doc);
  useEditorState((s) => s.revision);
  const format = uiStore.use((s) => s.exportFormat);
  const activeLayerOnly = uiStore.use((s) => s.exportActiveLayer);
  const onlyLayer = format !== 'layers' && activeLayerOnly;
  const includeBackground = uiStore.use((s) => s.exportBackground);
  const g = renderGeometry(doc.width, doc.height, doc.render.pixelSize, doc.render.gap);
  const withBackground = format !== 'layers' && includeBackground && !onlyLayer && hasBackground(doc);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = 0;
      const canvas = ref.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      const ctx = canvas.getContext('2d')!;
      const theme = readTheme();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = theme.canvas;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const { doc } = editor.getLive();
      const ui = uiStore.get();
      const geometry = renderGeometry(doc.width, doc.height, doc.render.pixelSize, doc.render.gap);
      const pad = Math.round(12 * dpr);
      let f = Math.min(
        (canvas.width - pad * 2) / geometry.width,
        (canvas.height - pad * 2) / geometry.height,
      );
      if (f >= 1) f = Math.floor(f); // whole steps keep small images crisp
      const w = Math.max(1, Math.round(geometry.width * f));
      const h = Math.max(1, Math.round(geometry.height * f));
      const x = Math.round((canvas.width - w) / 2);
      const y = Math.round((canvas.height - h) / 2);

      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = checkerPattern(ctx, Math.max(3, Math.round(5 * dpr)), theme.checkA, theme.checkB);
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      const onlyLayer = ui.exportFormat !== 'layers' && ui.exportActiveLayer;
      const withBackground =
        ui.exportFormat !== 'layers' && ui.exportBackground && !onlyLayer && hasBackground(doc);
      if (withBackground) {
        ctx.fillStyle = toCss(doc.background);
        ctx.fillRect(x, y, w, h);
      }
      // With the background, the layers go over it, as on the canvas and in the PNG: blend modes
      // mix with it.
      const pixels = flatten(
        doc,
        onlyLayer ? { onlyLayer: doc.layers[doc.activeLayer] } : { includeBackground: withBackground },
      );
      const step = (geometry.pixelSize + geometry.gap) * f;
      if (geometry.gap > 0 && step >= 3) {
        const size = Math.max(1, geometry.pixelSize * f);
        for (let py = 0; py < doc.height; py++)
          for (let px = 0; px < doc.width; px++) {
            const c = pixels[py * doc.width + px];
            if (!alpha(c)) continue;
            ctx.fillStyle = toCss(c);
            ctx.fillRect(
              x + Math.round(px * step),
              y + Math.round(py * step),
              Math.ceil(size),
              Math.ceil(size),
            );
          }
      } else {
        ctx.drawImage(pixelsToCanvas(pixels, doc.width, doc.height), x, y, w, h);
      }
      // Outline of the image, so a transparent export still shows its extent.
      ctx.strokeStyle = theme.frame;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    };
    const request = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    request();
    const offs = [editor.onPixels(request), editor.subscribe(request), uiStore.subscribe(request)];
    const ro = new ResizeObserver(request);
    if (ref.current) ro.observe(ref.current);
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', request);
    const mo = new MutationObserver(request);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      offs.forEach((off) => off());
      ro.disconnect();
      media.removeEventListener('change', request);
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [editor]);

  return (
    <div className="export-preview-wrap">
      <div className="preview export-preview">
        <canvas ref={ref} role="img" aria-label={t('export.previewLabel')} />
      </div>
      <p className="export-size">
        {t('export.info', { w: g.width, h: g.height })}{' '}
        {withBackground ? t('export.withBackground') : t('export.transparent')}
        {doc.render.gap > 0 && <> · {t('export.gap', { gap: doc.render.gap })}</>}
        {g.pixelSize !== doc.render.pixelSize && <> · {t('export.shrunk', { size: g.pixelSize })}</>}
      </p>
    </div>
  );
}
