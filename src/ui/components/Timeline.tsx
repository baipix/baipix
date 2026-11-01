import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { alpha } from '../../engine/color';
import { activeFrame, celOf, DURATION, frameCount, ONION } from '../../engine/frames';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { pause, playbackStore, togglePlay } from '../playback';
import { toggleOnion, toggleTimeline, uiStore, type UiState } from '../uiStore';
import { IconButton } from './IconButton';
import { openMenu } from './Menu';
import { NumberField } from './NumberField';

/**
 * The active board's frames, under the canvas: a row per layer (the top one first), a column per
 * frame, a dot where the layer has pixels on that frame. Clicking a cell shows its frame and picks
 * its layer; dragging a frame's number moves the frame. Shift-click a frame's number picks every
 * frame up to it, Cmd/Ctrl-click adds or removes one: the duration and Delete then apply to them all.
 */
const setOnion = (change: Partial<UiState['onion']>) =>
  uiStore.set((s) => ({ onion: { ...s.onion, ...change } }));

export function Timeline() {
  const t = useT();
  const editor = useEditor();
  const doc = useEditorState((s) => s.doc);
  const revision = useEditorState((s) => s.revision);
  const playing = playbackStore.use((s) => s.playing);
  const onion = uiStore.use((s) => s.onion);
  const ref = useRef<HTMLDivElement>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  // The frames picked with Shift or Cmd/Ctrl, by id so they follow a move; fewer than two: the shown one.
  const [picked, setPicked] = useState<string[]>([]);
  const anchor = useRef(0);
  const count = frameCount(doc);
  const shown = activeFrame(doc);
  const duration = doc.frames?.[shown].duration;
  const ids = doc.frames?.map((f) => f.id) ?? [];
  const pickedFrames = ids.flatMap((id, f) => (picked.includes(id) ? [f] : []));
  // Showing a frame outside the pick (playing, stepping, a cell clicked) leaves it aside.
  const selected = pickedFrames.length > 1 && pickedFrames.includes(shown) ? pickedFrames : [shown];
  const isSelected = (f: number) => selected.length > 1 && selected.includes(f);

  // Another board: nothing picked.
  useEffect(() => setPicked([]), [doc.id]);

  const pickFrame = (e: ReactMouseEvent, f: number) => {
    pause();
    if (e.shiftKey) {
      // From the last frame clicked while picking, or else from the shown one.
      const start = selected.length > 1 ? anchor.current : shown;
      const [from, to] = [Math.min(start, f), Math.max(start, f)];
      setPicked(ids.slice(from, to + 1));
    } else if (e.metaKey || e.ctrlKey) {
      const current = selected.map((s) => ids[s]);
      const id = ids[f];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      setPicked(next);
      anchor.current = f;
      // Removed from the pick: the shown frame stays, or moves to another picked one if it was this one.
      if (!next.includes(id)) {
        if (f === shown && next.length) editor.setFrame(ids.indexOf(next[next.length - 1]));
        return;
      }
    } else {
      setPicked([]);
      anchor.current = f;
    }
    editor.setFrame(f);
  };

  const deleteSelected = () => {
    editor.deleteFrames(selected);
    setPicked([]);
  };

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
    // On a picked frame, the menu is for all of them; elsewhere, for that frame alone.
    const many = isSelected(f);
    if (!many) setPicked([]);
    editor.setFrame(f);
    openMenu(e.currentTarget, [
      { label: t('timeline.add'), icon: 'plus', shortcut: 'Alt+N', onSelect: () => editor.addFrame() },
      {
        label: t('timeline.addEmpty'),
        icon: 'frameEmpty',
        shortcut: 'Alt+B',
        onSelect: () => editor.addFrame(true),
      },
      {
        label: t('timeline.reverse'),
        icon: 'swap',
        disabled: !many,
        onSelect: () => editor.reverseFrames(selected),
      },
      '-',
      {
        label: many ? t('timeline.deleteFrames', { n: selected.length }) : t('timeline.delete'),
        icon: 'trash',
        disabled: count < 2,
        onSelect: () => (many ? deleteSelected() : editor.deleteFrame(f)),
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
              onChange={(ms, final) => final && editor.setFrameDuration(ms, selected)}
            />
          </div>
        )}
        <IconButton
          icon="onion"
          label={t('timeline.onion')}
          pressed={onion.on}
          onClick={toggleOnion}
          disabled={count < 2}
        />
        {onion.on && count > 1 && (
          <div className="timeline-onion">
            <NumberField
              value={onion.before}
              min={0}
              max={ONION.max}
              ariaLabel={t('timeline.onionBefore')}
              label={t('timeline.onionBefore')}
              sensitivity={12}
              onChange={(before) => setOnion({ before })}
            />
            <NumberField
              value={onion.after}
              min={0}
              max={ONION.max}
              ariaLabel={t('timeline.onionAfter')}
              label={t('timeline.onionAfter')}
              sensitivity={12}
              onChange={(after) => setOnion({ after })}
            />
            <NumberField
              value={Math.round(onion.opacity * 100)}
              min={5}
              max={100}
              suffix="%"
              ariaLabel={t('timeline.onionOpacity')}
              label="◐"
              onChange={(v) => setOnion({ opacity: v / 100 })}
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
          label={
            selected.length > 1 ? t('timeline.deleteFrames', { n: selected.length }) : t('timeline.delete')
          }
          onClick={deleteSelected}
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
            className={`timeline-frame${f === shown ? ' is-active' : ''}${isSelected(f) ? ' is-picked' : ''}${
              f === dragged ? ' is-dragged' : ''
            }`}
            aria-pressed={isSelected(f) || f === shown}
            draggable
            data-tip={t('timeline.frame', { n: f + 1, ms: doc.frames?.[f].duration ?? 0 })}
            onClick={(e) => pickFrame(e, f)}
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
                className={`timeline-cel${f === shown || isSelected(f) ? ' in-frame' : ''}${
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
