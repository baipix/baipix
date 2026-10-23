import type { ComponentType, SVGProps } from 'react';
import {
  AlignCenterHorizontal,
  BookOpen,
  Bug,
  CodeXml,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpDown,
  ArrowLeftRight,
  Blend,
  Box,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Component,
  Copy,
  Crop,
  Cylinder,
  Diamond,
  Download,
  Droplet,
  Ellipsis,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Folder,
  FolderPlus,
  Frame,
  Grid3x3,
  Grid2x2,
  LayoutGrid,
  LayoutList,
  Hand,
  Heart,
  Image,
  Info,
  Lasso,
  LassoSelect,
  Layers,
  Lock,
  LockOpen,
  Menu,
  Minus,
  Moon,
  MousePointer2,
  PaintBucket,
  PanelLeft,
  Pencil,
  Pipette,
  Plus,
  Pyramid,
  Redo2,
  RotateCcw,
  RotateCw,
  Search,
  Shuffle,
  Slash,
  SlidersHorizontal,
  SprayCan,
  SquareSplitHorizontal,
  SquareSplitVertical,
  SquareDashed,
  Star,
  Sun,
  Trash2,
  Triangle,
  Undo2,
  Unlink,
  Wand,
  Waves,
  X,
} from 'lucide-react';

/** An icon: a 24×24 line drawing in the current color, its stroke width given by `Icon`. */
type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

/** An icon drawn here, in Lucide's style: 24×24, round line ends, no fill. */
function drawn(children: JSX.Element): Glyph {
  return (props) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

// Lucide's square has rounded corners: the rectangle tool gets a sharp one, the rounded one rounder.
const Rect = drawn(<rect x="3" y="3" width="18" height="18" />);
const RoundRect = drawn(<rect x="3" y="3" width="18" height="18" rx="6" />);
// Help: a question mark on its own, the button around it is its frame.
const QuestionMark = drawn(
  <>
    <path d="M8 8.5a4 4 0 1 1 5.6 3.66c-.98.43-1.6 1.2-1.6 2.24V15" />
    <path d="M12 19.5h.01" />
  </>,
);
// Stairs and ramps: steps climbing to the right.
const Ramp = drawn(<path d="M3 20h5v-5h5v-5h5V5h3" />);

/** Interface icons, from Lucide (ISC, https://lucide.dev) plus a few drawn here in the same style. */
export const ICONS = {
  // Components, like Figma's: four diamonds for a master, one for an instance.
  component: Component,
  instance: Diamond,
  detach: Unlink,
  repeat: Grid2x2,
  gradient: Blend,
  move: MousePointer2,
  hand: Hand,
  select: SquareDashed,
  pencil: Pencil,
  eraser: Eraser,
  bucket: PaintBucket,
  line: Slash,
  rect: Rect,
  roundRect: RoundRect,
  ellipse: Circle,
  triangle: Triangle,
  star: Star,
  heart: Heart,
  box: Box,
  board: Frame,
  cylinder: Cylinder,
  pyramid: Pyramid,
  ramp: Ramp,
  shade: Moon,
  lighten: Sun,
  spray: SprayCan,
  lassoFill: Lasso,
  lassoSelect: LassoSelect,
  wand: Wand,
  jumble: Shuffle,
  liquify: Waves,
  blur: Droplet,
  picker: Pipette,
  undo: Undo2,
  redo: Redo2,
  plus: Plus,
  minus: Minus,
  trash: Trash2,
  eye: Eye,
  eyeOff: EyeOff,
  lock: Lock,
  unlock: LockOpen,
  up: ChevronUp,
  down: ChevronDown,
  caret: ChevronDown,
  chevronRight: ChevronRight,
  folder: Folder,
  folderPlus: FolderPlus,
  duplicate: Copy,
  merge: ArrowDownToLine,
  more: Ellipsis,
  swap: ArrowLeftRight,
  back: ArrowLeft,
  grid: Grid3x3,
  sort: ArrowUpDown,
  gridView: LayoutGrid,
  list: LayoutList,
  menu: Menu,
  layers: Layers,
  panel: SlidersHorizontal,
  panelLeft: PanelLeft,
  close: X,
  info: Info,
  help: QuestionMark,
  docs: BookOpen,
  bug: Bug,
  search: Search,
  rotate: RotateCw,
  rotateLeft: RotateCcw,
  // Named by what moves: the drawing against the left edge, centered across, and so on.
  alignLeft: AlignStartVertical,
  alignCenterX: AlignCenterVertical,
  alignRight: AlignEndVertical,
  alignTop: AlignStartHorizontal,
  alignCenterY: AlignCenterHorizontal,
  alignBottom: AlignEndHorizontal,
  flipH: FlipHorizontal2,
  flipV: FlipVertical2,
  // Symmetry: the square split down the middle (left-right), or across it (top-bottom).
  mirrorX: SquareSplitHorizontal,
  mirrorY: SquareSplitVertical,
  image: Image,
  crop: Crop,
  download: Download,
  code: CodeXml,
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof ICONS | 'logo';

/**
 * The Baipix logo: a pixel escaping a 2×2 block, on an 8×8 grid (3×3 squares). Drawn in the text
 * color, so it is black on light and white on dark.
 */
export const LOGO = {
  width: 8,
  height: 8,
  /** The block, then the pixel escaping it (its own path, so it can hop). */
  d: 'M0 2h3v6H0zM3 5h3v3H3z',
  pixel: 'M5 0h3v3H5z',
};
