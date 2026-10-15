import type { ComponentType, SVGProps } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowLeftRight,
  Blend,
  Box,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleHelp,
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
  menu: Menu,
  layers: Layers,
  panel: SlidersHorizontal,
  panelLeft: PanelLeft,
  close: X,
  info: Info,
  help: CircleHelp,
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
  grid: Grid3x3,
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof ICONS | 'logo';

/**
 * The Baipix logo: a pixel escaping a 2×2 block, on an 8×8 grid (3×3 squares). Drawn in the text
 * color, so it is black on light and white on dark.
 */
export const LOGO = {
  width: 8,
  height: 8,
  d: 'M0 2h3v6H0zM3 5h3v3H3zM5 0h3v3H5z',
};
