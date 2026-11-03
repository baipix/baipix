# Baipix for agents

Baipix is a pixel art editor that runs in the browser. Its page exposes `window.baipix`, a JavaScript API that
drives the editor's own tools: what you draw shows live in the editor, every step can be undone, and the
drawing is kept in the browser as a person's would be.

## Steps

1. **Open the editor.** Load https://baipix.app/app/ in a browser you control (Playwright, Puppeteer, a
   browser extension, DevTools) and run code in the page. Done when `typeof baipix === 'object'`. Run
   `baipix.help()` once: it lists every call.
2. **Plan** before drawing. Pick:
   - a canvas size: 16 to 32 px for an icon or a character, up to 64 px for a scene;
   - a palette of 4 to 16 colors: a dark outline, and two or three shades per material, lit from the top
     left;
   - a **pixel map**: one string per canvas row, one character per pixel (`.` for empty), and a color for
     each character. For a symmetric subject, write the left half and mirror it.

   Done when the map has `height` rows of exactly `width` characters, and every character has a color.

3. **Create the file**: `baipix.newFile(width, height, name)`, then `baipix.setPalette([...colors])`.
4. **Draw**, one layer per part (`baipix.addLayer('Sky')`, `baipix.addLayer('Hero')`), back to front:
   - large areas with the tools: `fill(x, y, { color })` (bucket), `rect` and `ellipse` (add
     `options: { filled: true }`), `line`, and `stroke(points, { tool })` for anything else;
   - the pixel map with `plot([[x, y, color], ...])`: the whole map in one call, one undo step;
   - finishing touches with tools a person would use on pixel art: `shade`, `lighten`, `spray`, `blur`.
5. **Look** at what you drew, and compare it with the plan:
   - `baipix.ascii()` returns `{ rows, legend }`: the drawing as text, one character per color;
   - `baipix.png(8)` returns a PNG data URL, each pixel 8 px wide, to view if you can see images.

   Fix what reads wrong (draw over it, `plot` it, or `undo()`), then look again. Done when the rows match your
   map and the image reads as the subject at a glance.

6. **Hand it over.** `baipix.save()` returns the `.baipix` file as text: save it as `name.baipix`, and it
   opens in Baipix with File › Open, layers included. `baipix.png(scale)` gives the image. The drawing also
   stays in that browser's Baipix, in its list of files.

## Example

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

## Conventions

- **Coordinates** are art pixels from the top left corner: `x` to the right, `y` down. Points are `[x, y]`
  or `{ x, y }`.
- **Colors** are `#rrggbb` or `#rrggbbaa` strings, in tool options too (`boxFaces`, `gradientStops`).
  Transparent pixels read as `null`.
- **Layers** are referred to by index (0 is the bottom one) or by name. Drawing calls paint on the active
  layer: the one last added or picked with `selectLayer`.
- **Like a person.** A `tool`, `color` or `options` given to a drawing call stay selected afterwards, as they
  would after clicking them.
- **Options: per stroke, or a tweak.** `options` given to a drawing call are for that stroke only. On its
  own, `setOptions` does what changing an option does for a person: with a volume tool or the gradient
  selected, it redraws the last box or gradient drawn.
- **Refusals throw**, with the reason: drawing on a hidden or locked layer throws `layerHidden` or
  `layerLocked`, an unknown tool or option throws its name.
- **A selection** limits every tool, `plot` included. `deselect()` lets go of it.

## Tools

`stroke(points, { tool })` is one whole gesture with any tool: down on the first point, through the
others, up on the last. `baipix.tools()` lists them. Freehand tools (`pencil`, `eraser`, `spray`, `shade`,
`lighten`…) join the points, so a line's corners are enough. Shapes (`line`, `rect`, `ellipse`, `triangle`,
`star`, `heart`) go from the first point to the last, both corners included. `down`, `move` and `up` give
the raw pointer, for a gesture built step by step.

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
