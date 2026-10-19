/**
 * The docs' table of contents: the sidebar, the previous and next links at the bottom of each page,
 * the docs home and the sitemap all read it. A page listed here exists under /docs/.
 */
export interface DocPage {
  /** Its path under /docs/, without slashes around it. */
  slug: string;
  title: string;
}

export interface DocSection {
  title: string;
  /** One line for the docs home. */
  intro: string;
  pages: DocPage[];
}

export const DOCS: DocSection[] = [
  {
    title: 'Getting started',
    intro: 'The interface, making and opening files, and where your drawings are kept.',
    pages: [
      { slug: 'getting-started/interface', title: 'The interface' },
      { slug: 'getting-started/create-and-open', title: 'Create and open files' },
      { slug: 'getting-started/files-and-saving', title: 'Files and saving' },
    ],
  },
  {
    title: 'Drawing',
    intro:
      'The pencil and the eraser, fills and gradients, shapes, selections, and the tools that rework a drawing.',
    pages: [
      { slug: 'drawing/pencil-and-eraser', title: 'Pencil and eraser' },
      { slug: 'drawing/fills-and-gradients', title: 'Fills and gradients' },
      { slug: 'drawing/shapes', title: 'Shapes' },
      { slug: 'drawing/selections', title: 'Selections' },
      { slug: 'drawing/spray-and-rework', title: 'Spray and rework' },
    ],
  },
  {
    title: 'Colors',
    intro: 'Your two colors and the eyedropper, palettes, shading along a ramp, and adjustments.',
    pages: [
      { slug: 'colors/colors-and-palettes', title: 'Colors and palettes' },
      { slug: 'colors/shade-and-lighten', title: 'Shade and lighten' },
      { slug: 'colors/adjustments', title: 'Adjustments' },
    ],
  },
  {
    title: 'Layers',
    intro: 'Layers and groups, blend modes and effects, and moving, resizing and rotating.',
    pages: [
      { slug: 'layers/layers-and-groups', title: 'Layers and groups' },
      { slug: 'layers/blend-modes-and-effects', title: 'Blend modes and effects' },
      { slug: 'layers/move-resize-rotate', title: 'Move, resize and rotate' },
    ],
  },
  {
    title: 'Components and boards',
    intro: 'A sprite drawn once and used everywhere, and several boards in one file.',
    pages: [
      { slug: 'components/components', title: 'Components' },
      { slug: 'boards/boards', title: 'Boards' },
    ],
  },
  {
    title: 'Reference',
    intro: 'Every keyboard shortcut, read from the editor itself.',
    pages: [{ slug: 'reference/shortcuts', title: 'Keyboard shortcuts' }],
  },
];

/** Every page, in reading order. */
export const DOC_PAGES: DocPage[] = DOCS.flatMap((s) => s.pages);
