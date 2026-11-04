# Baipix for agents

Baipix is a pixel art editor that runs in the browser. Its page exposes `window.baipix`, a JavaScript API that
drives the editor's own tools on the drawing the artist has open. It is there for the repetitive part of
their work: **variations** of a board they drew. A colorway, the whole file moved to another palette, a pose
or costume variant, a hurt or frozen state, a bigger size. The artist's board stays as they drew it; each
variation is a copy beside it, shown live in the editor, every step of it undoable.

## Steps

1. **Open the editor** on the artist's drawing: Baipix at https://baipix.app/app/, in a browser you
   control (Playwright, Puppeteer, a browser extension, DevTools), code run in the page. Run
   `baipix.help()` once: it lists every call. `baipix.state()` names the open `file` and `board`; when it
   isn't the one the artist means, `files()` lists them and `selectFile(name)` opens one. Done when
   `state()` names the file and board the artist asked about.
2. **Read the source board** before changing anything: `boards()`, `layers()`, `ascii()` (the drawing as
   text, one character per color, with its `legend`) and `png(8)` if you can see images. Done when you can
   name, for each variation, the layers, pixels or colors it changes and the ones it keeps.
3. **Duplicate** the source once per variation: `duplicateBoard('Hurt')` copies the active board, layers
   and frames included, puts the copy beside it and goes to it. Done when `boards()` lists the source plus
   one board per variation, each named after it.
4. **Rework each copy** (`selectBoard(name)` to go to one) with the recipes below. Draw on the copy only:
   the source is the artist's.
5. **Compare** each variation with the source: `ascii()` on both, or `png()`. Fix what reads wrong (draw
   over it, `plot` it, or `undo()`), then compare again. Done when each variation differs from the source
   only where you planned in step 2, and reads as the same character or object at a glance.
6. **Hand it over.** The variations are already in the artist's file, next to their board, kept by the
   browser. Tell the artist which boards you added and what changed on each. `save()` returns the
   `.baipix` file as text, if they want it as a file.

## Recipes

- **Colorway**: `remap({ palette: ['#…', …], mode: 'lightness' })`: the drawing's colors go to the given
  ones in the same order of lightness, so shadows and highlights stay where they were. It returns what
  each color became.
- **The whole file to another palette**: `remap({ palette: 'pico8', boards: 'all', replacePalette: true })`.
  `palettes()` lists the presets. With several boards, every color goes to the same new color on all of
  them. Run it on the file itself, no copy needed: the artist asked for every board to change.
- **Hurt, frozen, poisoned**: a colorway in one hue: reds for hurt, pale blues for frozen, greens for
  poisoned, darkest to lightest, with `mode: 'lightness'`. For a flash, `remap` to a single light color.
- **Pose or costume variant**: write the changed rows as a pixel map (below) and `plot` them, or redraw a
  part with the tools on its own layer.
- **Bigger size**: `resizeBoard(width, height)` makes room, then redraw at the new size with the source's
  `ascii()` as a guide. Pixel art is redrawn bigger, not stretched.

`remap` works like the Remap tab of Adjust colors: every layer (`layers: 'active'` for one), every
animation frame (`frames: 'active'` for the one shown), the background too, and inside the selection when
there is one. Each board and frame is one undo step.

## Conventions

- **Coordinates** are art pixels from the top left corner: `x` to the right, `y` down. Points are `[x, y]`
  or `{ x, y }`.
- **Colors** are `#rrggbb` or `#rrggbbaa` strings, in tool options too (`boxFaces`, `gradientStops`).
  Transparent pixels read as `null`.
- **Files, boards and layers** are referred to by index (layer 0 is the bottom one) or by name. Drawing
  calls paint on the active layer of the active board: the one last added or picked.
- **A pixel map** is one string per row, one character per pixel (`.` for empty), and a color for each
  character, as `ascii()` gives it. `plot([[x, y, color], ...])` sets the whole map in one call, one undo
  step, on the active layer; `null` clears a pixel.
- **Like a person.** A `tool`, `color` or `options` given to a drawing call stay selected afterwards, as they
  would after clicking them.
- **Options: per stroke, or a tweak.** `options` given to a drawing call are for that stroke only. On its
  own, `setOptions` does what changing an option does for a person: with a volume tool or the gradient
  selected, it redraws the last box or gradient drawn.
- **Refusals throw**, with the reason: drawing on a hidden or locked layer throws `layerHidden` or
  `layerLocked`, an unknown tool, option, board or palette throws its name.
- **A selection** limits every tool, `plot` and `remap` included. `deselect()` lets go of it.

## Tools

`stroke(points, { tool })` is one whole gesture with any tool: down on the first point, through the
others, up on the last. `baipix.tools()` lists them. Freehand tools (`pencil`, `eraser`, `spray`, `shade`,
`lighten`…) join the points, so a line's corners are enough. Shapes (`line`, `rect`, `ellipse`, `triangle`,
`star`, `heart`) go from the first point to the last, both corners included. `fill(x, y, { color })` is
the bucket. `down`, `move` and `up` give the raw pointer, for a gesture built step by step.

## Drawing from scratch

When the artist asks for a new drawing rather than a variation, plan it before drawing: a canvas of 16 to
32 px for an icon or a character, up to 64 px for a scene; a palette of 4 to 16 colors (a dark outline, two
or three shades per material, lit from the top left); and the pixel map, `height` rows of exactly `width`
characters. Then `newFile(width, height, name)`, `setPalette([...])`, one layer per part with
`addLayer(name)`, back to front, and steps 5 and 6 above.

```js
baipix.newFile(16, 16, 'Mushroom');
baipix.setPalette(['#222034', '#d95763', '#ffffff', '#eec39a', '#8f563b']);

const map = [
  '................',
  '.....KKKKKK.....',
  '...KKRRRRRRKK...',
  '..KRRWWRRRRRRK..',
  '.KRRRWWRRRWWRRK.',
  '.KRRRRRRRRWWRRK.',
  '.KRWWRRRRRRRRRK.',
  '.KRWWRRRRRWWRRK.',
  '..KKKKKKKKKKKK..',
  '.....KSSSSK.....',
  '.....KSSSSK.....',
  '.....KSSBSK.....',
  '.....KSSSSK.....',
  '......KKKK......',
  '................',
  '................',
];
const colors = { K: '#222034', R: '#d95763', W: '#ffffff', S: '#eec39a', B: '#8f563b' };
const pixels = [];
map.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && pixels.push([x, y, colors[ch]])));

baipix.addLayer('Mushroom');
baipix.plot(pixels);
baipix.ascii().rows; // matches the map
```

## Isometric

The volume tools (`box`, `cylinder`, `pyramid`, `ramp`) draw from one drag, already shaded. A box drags from
the top corner of its top face to its bottom corner: a box `w` steps wide and `d` deep, its top corner at
`[x, y]`, is the drag `[x, y]` → `[x + 2(w − d), y + w + d]`. Its height in pixels is `boxHeight`,
`boxFaces` colors its `top`, `left` and `right` faces, and `boxOutline` draws its outline.

```js
baipix.stroke(
  [
    [32, 20],
    [36, 30],
  ],
  {
    tool: 'box',
    options: {
      boxHeight: 8,
      boxOutline: true,
      boxFaces: { top: '#a3adbd', left: '#7f8a9c', right: '#5d6677' },
    },
  },
);
```

Build a figure from boxes in painter's order: back to front, then bottom to top, so each box covers only
what is behind it. A box with no depth (`d = 0`) is a flat panel on the plane of a left face, for details
such as a face or a logo.

## Anything else

`baipix.editor` is the editor itself, with every command the interface uses (effects, components, boards,
exports): see [its source](https://github.com/baipix/baipix/blob/main/src/engine/editor.ts).

Without a browser, the same API runs in Node from the source: clone https://github.com/baipix/baipix, run
`npm ci`, and call `createAgentApi(new Editor())` from `src/agent/api.ts` in a script run with
`npx vite-node`. Pass a `png` hook to it to get images: Node has no canvas.
