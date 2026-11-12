export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

export type TouchMove =
  | { type: 'none' }
  | { type: 'draw-start'; from: TouchPoint; to: TouchPoint }
  | { type: 'draw-move'; point: TouchPoint }
  | { type: 'pinch-start' };

export type TouchEnd =
  { type: 'none' } | { type: 'draw-end'; point: TouchPoint } | { type: 'tap'; fingers: 1 | 2 | 3 };

export interface TouchGestureOptions {
  longPressMs?: number;
  tapMs?: number;
  maxMove?: number;
  onLongPress: (point: TouchPoint) => void;
}

interface ActiveTouch {
  start: TouchPoint;
  point: TouchPoint;
  moved: boolean;
}

type Mode = 'pending' | 'drawing' | 'multi' | 'pinch' | 'invalid' | 'long-press';

interface GestureState {
  active: Map<number, ActiveTouch>;
  mode: Mode;
  gestureStartedAt: number;
  fingerCount: number;
  timer: ReturnType<typeof setTimeout> | null;
  longPressMs: number;
  tapMs: number;
  maxMove: number;
  onLongPress: (point: TouchPoint) => void;
}

export interface TouchGestures {
  down(point: TouchPoint): void;
  move(point: TouchPoint): TouchMove;
  up(id: number): TouchEnd;
  cancel(id: number): void;
  reset(): void;
}

const DEFAULT_LONG_PRESS_MS = 500;
const DEFAULT_TAP_MS = 1000;
const DEFAULT_MAX_MOVE = 8;

const clearTimer = (state: GestureState) => {
  if (!state.timer) return;
  clearTimeout(state.timer);
  state.timer = null;
};

const movedTooFar = (state: GestureState, touch: ActiveTouch, point: TouchPoint): boolean => {
  const dx = point.x - touch.start.x;
  const dy = point.y - touch.start.y;

  return Math.hypot(dx, dy) > state.maxMove;
};

const invalidateSingle = (state: GestureState) => {
  clearTimer(state);
  if (state.mode === 'pending') state.mode = 'invalid';
};

const startLongPress = (state: GestureState, point: TouchPoint) => {
  clearTimer(state);

  if (state.mode !== 'pending') return;
  if (state.active.size !== 1) return;

  state.mode = 'long-press';
  state.onLongPress(point);
};

const startSingleGesture = (state: GestureState, point: TouchPoint) => {
  state.mode = 'pending';
  state.gestureStartedAt = Date.now();
  state.fingerCount = 1;
  clearTimer(state);
  state.timer = setTimeout(() => startLongPress(state, point), state.longPressMs);
};

const startMultiGesture = (state: GestureState): boolean => {
  clearTimer(state);

  if (state.active.size === 2 && state.mode !== 'drawing') {
    state.mode = 'multi';
    state.fingerCount = 2;

    return true;
  }

  if (state.active.size === 3 && state.mode === 'multi') {
    state.fingerCount = 3;
    return true;
  }

  return false;
};

const down = (state: GestureState, point: TouchPoint) => {
  state.active.set(point.id, { start: point, point, moved: false });

  if (state.active.size === 1) {
    startSingleGesture(state, point);
    return;
  }

  if (startMultiGesture(state)) return;
  state.mode = 'invalid';
};

const drawStart = (state: GestureState, point: TouchPoint): TouchMove => {
  invalidateSingle(state);
  state.mode = 'drawing';
  const first = [...state.active.values()][0];

  return { type: 'draw-start', from: first.start, to: point };
};

const pinchStart = (state: GestureState): TouchMove => {
  clearTimer(state);
  state.mode = 'pinch';

  return { type: 'pinch-start' };
};

const move = (state: GestureState, point: TouchPoint): TouchMove => {
  const touch = state.active.get(point.id);
  if (!touch) return { type: 'none' };

  touch.point = point;

  if (!touch.moved && movedTooFar(state, touch, point)) {
    touch.moved = true;

    if (state.mode === 'pending') return drawStart(state, point);
    if (state.mode === 'multi') return pinchStart(state);
  }

  if (state.mode === 'drawing')
    return {
      type: 'draw-move',
      point,
    };

  return { type: 'none' };
};

const finishDrawing = (state: GestureState, touch: ActiveTouch): TouchEnd => {
  if (state.active.size) return { type: 'none' };
  state.mode = 'pending';

  return { type: 'draw-end', point: touch.point };
};

const tapResult = (state: GestureState, elapsed: number): TouchEnd => {
  if (state.mode === 'pending' && state.fingerCount === 1) return { type: 'tap', fingers: 1 };
  if (state.mode !== 'multi') return { type: 'none' };

  if (elapsed > state.tapMs) return { type: 'none' };
  if (state.fingerCount !== 2 && state.fingerCount !== 3) return { type: 'none' };

  return { type: 'tap', fingers: state.fingerCount };
};

const finishTap = (state: GestureState): TouchEnd => {
  clearTimer(state);
  const result = tapResult(state, Date.now() - state.gestureStartedAt);
  state.mode = 'pending';
  state.fingerCount = 0;

  return result;
};

const up = (state: GestureState, id: number): TouchEnd => {
  const touch = state.active.get(id);
  if (!touch) return { type: 'none' };

  state.active.delete(id);

  if (state.mode === 'drawing') return finishDrawing(state, touch);
  if (state.active.size) return { type: 'none' };

  return finishTap(state);
};

const reset = (state: GestureState) => {
  clearTimer(state);
  state.active.clear();
  state.mode = 'pending';
  state.fingerCount = 0;
  state.gestureStartedAt = 0;
};

const cancel = (state: GestureState, id: number) => {
  state.active.delete(id);
  clearTimer(state);

  if (state.active.size) {
    state.mode = 'invalid';
    return;
  }

  reset(state);
};

/** Creates the small state machine used by the canvas touch handlers. */
export function createTouchGestures(options: TouchGestureOptions): TouchGestures {
  const state: GestureState = {
    active: new Map(),
    mode: 'pending',
    gestureStartedAt: 0,
    fingerCount: 0,
    timer: null,
    longPressMs: options.longPressMs ?? DEFAULT_LONG_PRESS_MS,
    tapMs: options.tapMs ?? DEFAULT_TAP_MS,
    maxMove: options.maxMove ?? DEFAULT_MAX_MOVE,
    onLongPress: options.onLongPress,
  };

  return {
    down: (point) => down(state, point),
    move: (point) => move(state, point),
    up: (id) => up(state, id),
    cancel: (id) => cancel(state, id),
    reset: () => reset(state),
  };
}
