---
layout: ../../../layouts/DocsLayout.astro
title: The view
description: 'Find your way around a pixel art drawing in Baipix: zoom and pan, the pixel grid, tile preview for seamless textures, symmetry, rulers and guides, the preview window, and the language.'
---

## Zoom and pan

- **Zoom** with a pinch on a trackpad, the mouse wheel, or <kbd>Ctrl</kbd> with either, toward the pointer, or with <kbd>+</kbd> and <kbd>−</kbd>. **Shift+1** fits the drawing to the window, **Shift+0** shows it at 100%.
- The zoom level is at the top right: click it for the levels, double-click it to fit.
- **Pan** with two fingers on a trackpad, <kbd>Shift</kbd> with the mouse wheel for sideways, the Hand tool (<kbd>H</kbd>), or hold <kbd>Space</kbd> and drag with any tool.
- **Hide the interface** (<kbd>Tab</kbd>) to see only the drawing.

## The display options

<figure class="shot">
  <img class="for-light" src="../../shots/display-light.webp" width="273" height="185" alt="The Display popover: pixel grid, tile preview and rulers and guides." loading="lazy" />
  <img class="for-dark" src="../../shots/display-dark.webp" width="273" height="185" alt="The Display popover: pixel grid, tile preview and rulers and guides." loading="lazy" />
</figure>

The grid button at the top right opens them:

- **Pixel grid** (<kbd>Shift</kbd>+<kbd>G</kbd>): lines between the pixels when you're zoomed in, dark on light pixels and light on dark ones.
- **Tile preview** (<kbd>Shift</kbd>+<kbd>T</kbd>): the drawing repeated all around it, to see a texture as it tiles. A stroke that leaves one edge comes back on the other, so the texture repeats without a seam. **Copies** sets how visible the repeats are.
- **Rulers and guides**: rulers in pixels along the top and the left. Drag from a ruler to add a guide; with the Move tool, drag a guide to move it, or back onto its ruler to remove it.

## Symmetry

The two buttons at the right end of the options bar turn on **left-right** (<kbd>Shift</kbd>+<kbd>X</kbd>) and **top-bottom** (<kbd>Shift</kbd>+<kbd>Y</kbd>) symmetry: draw on one side, the other follows. Drag an axis by its grip, outside the board, to move it; it snaps to half pixels. Double-click a grip to center it again.

## The preview window

**View › Preview window** (<kbd>Shift</kbd>+<kbd>P</kbd>) shows the whole drawing at a fixed size while you work up close. When the canvas shows only part of the drawing, a frame marks where you are: drag it to move around. Drag the window by its title, resize it by its corner, change its zoom, or fold it.

## Language

Baipix speaks English, French, Ukrainian, Spanish and Japanese. The first time, it opens in your browser's language when it's one of them, and in English otherwise. A message then says which language it picked, with a button to switch back to English.

Change it at any time in **View › Language**. Baipix keeps your choice for next time.

Missing your language? Adding one is a good first contribution: see [Adding a language](https://github.com/baipix/baipix/blob/main/CONTRIBUTING.md#adding-a-language).
