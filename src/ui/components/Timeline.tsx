import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { alpha } from '../../engine/color';
import { activeFrame, celOf, DURATION, frameCount } from '../../engine/frames';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { pause, playbackStore, togglePlay } from '../playback';
import { toggleTimeline } from '../uiStore';
import { IconButton } from './IconButton';
import { openMenu } from './Menu';
import { NumberField } from './NumberField';

/**
 * The active board's frames, under the canvas: a row per layer (the top one first), a column per
 * frame, a dot where the layer has pixels on that frame. Clicking a cell shows its frame and picks
 * its layer; dragging a frame's number moves the frame.
 */
export function Timeline() {
  const t = useT();
  const editor = useEditor();
  const doc = useEditorState((s) => s.doc);
  const revision = useEditorState((s) => s.revision);
  const playing = playbackStore.use((s) => s.playing);
  const ref = useRef<HTMLDivElement>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const count = frameCount(doc);
  const shown = activeFrame(doc);
  const duration = doc.frames?.[shown].duration;

  // Which layers have pixels on which frame, for the dots.
  const drawn = useMemo(
    () =>
      doc.layers.map((layer) =>
        Array.from({ length: count }, (_, f) => celOf(doc, layer, f).pixels.some((c) => alpha(c) > 0)),
      ),
    // The document changes in place: its revision says when.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, count, revision],
  );

  // The toolbar and the tool options move up to stay above it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() =>
      root.style.setProperty('--timeline-space', `${el.offsetHeight + 12}px`),
    );
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--timeline-space');
    };
  }, []);

  // Drawing on the canvas stops the playing, so it lands on the frame in view.
  useEffect(() => {
    const onDown = (e: PointerEvent) => (e.target as Element).closest?.('.canvas-wrap') && pause();
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      pause();
    };
  }, []);

  const frameMenu = (e: ReactMouseEvent<HTMLElement>, f: number) => {
    e.preventDefault();
    pause();
    editor.setFrame(f);
    openMenu(e.currentTarget, [
      { label: t('timeline.add'), icon: 'plus', shortcut: 'Alt+N', onSelect: () => editor.addFrame() },
      {
        label: t('timeline.delete'),
        icon: 'trash',
        disabled: count < 2,
        onSelect: () => editor.deleteFrame(f),
      },
    ]);
  };

  const rows = doc.layers.map((layer, index) => ({ layer, index })).reverse();

  return (
    <div className="timeline" ref={ref}>
      <div className="timeline-bar">
        <span className="timeline-title">{t('timeline.title')}</span>
        <IconButton
          icon="first"
          label={t('timeline.first')}
          onClick={() => (pause(), editor.setFrame(0))}
          disabled={count < 2}
        />
        <IconButton
          icon={playing ? 'pause' : 'play'}
          label={playing ? t('timeline.pause') : t('timeline.play')}
          shortcut="Enter"
          onClick={() => togglePlay(editor)}
          disabled={count < 2}
        />
        <span className="timeline-count">
          {shown + 1} / {count}
        </span>
        {duration !== undefined && (
          <div className="timeline-duration">
            <NumberField
              value={duration}
              min={DURATION.min}
              max={DURATION.max}
              suffix="ms"
              ariaLabel={t('timeline.duration')}
              label={t('timeline.duration')}
              sensitivity={1}
              onChange={(ms, final) => final && editor.setFrameDuration(ms, [shown])}
            />
          </div>
        )}
        <span className="timeline-spacer" />
        <IconButton
          icon="plus"
          label={t('timeline.add')}
          shortcut="Alt+N"
          onClick={() => editor.addFrame()}
        />
        <IconButton
          icon="trash"
          label={t('timeline.delete')}
          onClick={() => editor.deleteFrame()}
          disabled={count < 2}
        />
        <IconButton icon="close" label={t('timeline.hide')} shortcut="Shift+A" onClick={toggleTimeline} />
      </div>
      <div
        className="timeline-grid"
        style={{ gridTemplateColumns: `var(--timeline-names) repeat(${count}, 24px)` }}
      >
        <span className="timeline-corner" />
        {Array.from({ length: count }, (_, f) => (
          <button
            key={doc.frames?.[f].id ?? f}
            type="button"
            className={`timeline-frame${f === shown ? ' is-active' : ''}${f === dragged ? ' is-dragged' : ''}`}
            draggable
            data-tip={t('timeline.frame', { n: f + 1, ms: doc.frames?.[f].duration ?? 0 })}
            onClick={() => (pause(), editor.setFrame(f))}
            onContextMenu={(e) => frameMenu(e, f)}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              setDragged(f);
            }}
            onDragOver={(e) => dragged !== null && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged !== null) editor.moveFrame(dragged, f);
              setDragged(null);
            }}
            onDragEnd={() => setDragged(null)}
          >
            {f + 1}
          </button>
        ))}
        {rows.map(({ layer, index }) => (
          <div key={layer.id} className="timeline-row" role="row">
            <span className={`timeline-name${index === doc.activeLayer ? ' is-active' : ''}`}>
              {layer.name}
            </span>
            {drawn[index].map((has, f) => (
              <button
                key={f}
                type="button"
                className={`timeline-cel${f === shown ? ' in-frame' : ''}${
                  f === shown && index === doc.activeLayer ? ' is-active' : ''
                }`}
                aria-label={`${layer.name}, ${t('timeline.frame', { n: f + 1, ms: doc.frames?.[f].duration ?? 0 })}`}
                onClick={() => {
                  pause();
                  editor.setFrame(f);
                  editor.setActiveLayer(index);
                }}
              >
                <span className={has ? 'timeline-dot' : 'timeline-dot is-empty'} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
