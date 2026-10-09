import type { SVGProps } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowBarDown,
  ArrowsHorizontal,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleInfo,
  CircleQuestion,
  Close,
  Copy,
  Crop,
  CursorMinimal,
  Eraser,
  Eye,
  Folder,
  FolderPlus,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Lasso,
  Image,
  Lock,
  Menu,
  Minus,
  Moon,
  MoreHorizontal,
  Pencil,
  Pipette,
  Plus,
  Redo,
  Reload,
  Search,
  Sliders,
  Square,
  Shuffle,
  SquareSharp,
  SprayCan,
  Star,
  Sun,
  Trash,
  Undo,
  Unlock,
  Waves,
} from 'pixelarticons/react';

type PixelGlyph = (props: SVGProps<SVGSVGElement>) => JSX.Element;

/**
 * An icon drawn on a 12×12 grid ('#' filled, '.' empty), scaled ×2 into the same 24×24 box as
 * Pixelarticons so both kinds line up.
 */
function drawn(rows: string[]): PixelGlyph {
  const d = rows
    .flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `M${x * 2} ${y * 2}h2v2h-2z` : '')))
    .join('');
  return (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d={d} />
    </svg>
  );
}

// Pixelarticons has no equivalent for these tools: drawn by hand on the same grid.
const Select = drawn([
  '............',
  '.##..##..##.',
  '.#........#.',
  '............',
  '............',
  '.#........#.',
  '.#........#.',
  '............',
  '............',
  '.#........#.',
  '.##..##..##.',
  '............',
]);
const Bucket = drawn([
  '............',
  '....#.......',
  '...#.#......',
  '..#...#.....',
  '.#.....#....',
  '#########.#.',
  '.#######.###',
  '..#####..###',
  '...###....#.',
  '....#.......',
  '............',
  '............',
]);
const Line = drawn([
  '............',
  '..........#.',
  '.........#..',
  '........#...',
  '.......#....',
  '......#.....',
  '.....#......',
  '....#.......',
  '...#........',
  '..#.........',
  '.#..........',
  '............',
]);
const Triangle = drawn([
  '............',
  '.....##.....',
  '.....##.....',
  '....#..#....',
  '....#..#....',
  '...#....#...',
  '...#....#...',
  '..#......#..',
  '..#......#..',
  '.#........#.',
  '.##########.',
  '............',
]);
const Drop = drawn([
  '............',
  '.....##.....',
  '....#..#....',
  '....#..#....',
  '...#....#...',
  '..#......#..',
  '..#......#..',
  '..#......#..',
  '..#......#..',
  '...#....#...',
  '....####....',
  '............',
]);
const Layers = drawn([
  '............',
  '.....##.....',
  '...##..##...',
  '.##......##.',
  '...##..##...',
  '.#...##...#.',
  '..##....##..',
  '....####....',
  '............',
  '............',
  '............',
  '............',
]);

// Components, like Figma's: a filled diamond for a master, an outlined one for an instance.
const Component = drawn([
  '.....##.....',
  '....####....',
  '...######...',
  '..########..',
  '.##########.',
  '############',
  '############',
  '.##########.',
  '..########..',
  '...######...',
  '....####....',
  '.....##.....',
]);
const Instance = drawn([
  '.....##.....',
  '....#..#....',
  '...#....#...',
  '..#......#..',
  '.#........#.',
  '#..........#',
  '#..........#',
  '.#........#.',
  '..#......#..',
  '...#....#...',
  '....#..#....',
  '.....##.....',
]);

// Repeat grid: one square drawn, its copies outlined.
const Repeat = drawn([
  '#####..#####',
  '#####..#...#',
  '#####..#...#',
  '#####..#...#',
  '#####..#####',
  '............',
  '............',
  '#####..#####',
  '#...#..#...#',
  '#...#..#...#',
  '#...#..#...#',
  '#####..#####',
]);

// Detach: the instance's diamond broken open, like Figma's.
const Detach = drawn([
  '.....##.....',
  '....#..#....',
  '...#....#...',
  '..#.........',
  '.#..........',
  '#...........',
  '...........#',
  '..........#.',
  '.........#..',
  '...#....#...',
  '....#..#....',
  '.....##.....',
]);

/** Interface icons, from Pixelarticons (MIT, https://pixelarticons.com) plus a few drawn here. */
export const ICONS = {
  component: Component,
  instance: Instance,
  detach: Detach,
  repeat: Repeat,
  move: CursorMinimal,
  hand: Hand,
  select: Select,
  pencil: Pencil,
  eraser: Eraser,
  bucket: Bucket,
  line: Line,
  rect: SquareSharp,
  // Pixelarticons' square has notched corners: it reads as the rounded one next to the sharp one.
  roundRect: Square,
  ellipse: Circle,
  triangle: Triangle,
  star: Star,
  shade: Moon,
  lighten: Sun,
  spray: SprayCan,
  lassoFill: Lasso,
  jumble: Shuffle,
  liquify: Waves,
  blur: Drop,
  picker: Pipette,
  undo: Undo,
  redo: Redo,
  plus: Plus,
  minus: Minus,
  trash: Trash,
  eye: Eye,
  eyeOff: EyeOff,
  lock: Lock,
  unlock: Unlock,
  up: ChevronUp,
  down: ChevronDown,
  caret: ChevronDown,
  chevronRight: ChevronRight,
  folder: Folder,
  folderPlus: FolderPlus,
  duplicate: Copy,
  merge: ArrowBarDown,
  more: MoreHorizontal,
  swap: ArrowsHorizontal,
  menu: Menu,
  layers: Layers,
  panel: Sliders,
  close: Close,
  info: CircleInfo,
  help: CircleQuestion,
  search: Search,
  rotate: Reload,
  // The same arrow, mirrored: a turn the other way.
  rotateLeft: (props) => <Reload {...props} style={{ ...props.style, transform: 'scaleX(-1)' }} />,
  // Named by what moves: the drawing against the left edge, centered across, and so on.
  alignLeft: AlignStartVertical,
  alignCenterX: AlignCenterVertical,
  alignRight: AlignEndVertical,
  alignTop: AlignStartHorizontal,
  alignCenterY: AlignCenterHorizontal,
  alignBottom: AlignEndHorizontal,
  flipH: FlipHorizontal2,
  flipV: FlipVertical2,
  image: Image,
  crop: Crop,
} satisfies Record<string, PixelGlyph>;

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
