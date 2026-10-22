---
layout: ../../../layouts/DocsLayout.astro
title: The interface
description: 'A tour of the Baipix editor: the menu bar, the Layers panel, the toolbar and its options, the right panel, and the floating preview.'
---

Baipix is laid out like a design tool. The canvas fills the window, and everything else floats around it.

<figure class="shot">
  <img class="for-light" src="../../shots/interface-light.webp" width="1440" height="900" alt="The Baipix editor with a pixel art sunset, its parts numbered from 1 to 6." loading="lazy" />
  <img class="for-dark" src="../../shots/interface-dark.webp" width="1440" height="900" alt="The Baipix editor with a pixel art sunset, its parts numbered from 1 to 6." loading="lazy" />
  <figcaption>1 The menus · 2 The Layers panel · 3 The toolbar · 4 The tool’s options · 5 The right panel · 6 The preview</figcaption>
</figure>

## The menu bar

Across the top, from left to right:

- **The menus**: File, Edit, Image, Layer, Select, View and Help. Every command is in one of them, with its shortcut.
- **The file's name**, in the middle, and the board's size. Click the name to rename the file, or the arrow next to it to switch to a recent file.
- **The display options** (the grid button): the pixel grid, the tile preview, symmetry, rulers.
- **The zoom**. Click it for the zoom levels, or double-click it to fit the drawing to the window.
- **The command palette** (the magnifier, or <kbd>Ctrl</kbd>+<kbd>K</kbd>): type a few letters to find any command.
- **The code button** (`</>`): the drawing as a React component, SVG, CSS, JSON or ASCII.
- **Export**: PNG, SVG, Aseprite or a tileset.

On a Mac, <kbd>Ctrl</kbd> is <kbd>Cmd</kbd> everywhere in Baipix.

## The Layers panel

<figure class="shot">
  <img class="for-light" src="../../shots/layers-light.webp" width="256" height="285" alt="The Layers panel: the file’s name, the Layers header with its buttons, and five layers, Middle clouds selected." loading="lazy" />
  <img class="for-dark" src="../../shots/layers-dark.webp" width="256" height="285" alt="The Layers panel: the file’s name, the Layers header with its buttons, and five layers, Middle clouds selected." loading="lazy" />
</figure>

On the left. It lists the drawing's layers, top first, with their groups. Above them come the file's components, if it has any. In a file of several boards, each board has its own row, the active one open.

- Click a layer to work on it. Shift-click or Ctrl-click to select several.
- Drag a layer to reorder it, or onto a group to put it inside.
- The buttons next to Layers add a reference image, turn the selection into a component, or add a layer.
- Right-click a layer for everything else: duplicate, merge, group, lock, rename.

The button at the top right of the panel folds it into a small pill (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>\\</kbd>), to give the canvas the whole window.

## The toolbar and its options

<figure class="shot">
  <img class="for-light" src="../../shots/toolbar-light.webp" width="666" height="116" alt="The Pencil’s options above the toolbar: size, square or round tip, stabilizer, pixel perfect." loading="lazy" />
  <img class="for-dark" src="../../shots/toolbar-dark.webp" width="666" height="116" alt="The Pencil’s options above the toolbar: size, square or round tip, stabilizer, pixel perfect." loading="lazy" />
</figure>

At the bottom. Tools of the same family share a button, and the button shows the last one you used: the small arrow next to it opens the others. Each tool also has a single key, listed in [Keyboard shortcuts](../../reference/shortcuts/).

Just above the toolbar, the **options bar** shows the current tool's settings: the pencil's size, pixel perfect and stabilizer, the gradient's shape and dithering, a shape's outline or fill, and so on. The <span>…</span> button holds the less common ones.

Undo and redo are at the right end of the toolbar.

## The right panel

<figure class="shot">
  <img class="for-light" src="../../shots/right-panel-light.webp" width="264" height="469" alt="The right panel: Board, Colors, Layer and Effects." loading="lazy" />
  <img class="for-dark" src="../../shots/right-panel-dark.webp" width="264" height="469" alt="The right panel: Board, Colors, Layer and Effects." loading="lazy" />
</figure>

What's selected, in four sections:

- **Board**: the width and height, the gap between pixels, the isometric grid, and the background color. Its picker has an eyedropper: click the canvas to take the background's color from the drawing.
- **Colors**: the two colors you draw with, as overlapping chips, and the file's palette. Click the front chip to change it, the one behind to bring it to the front, or press <kbd>X</kbd> to swap them.
- **Layer**: the active layer's name, visibility, blend mode and opacity.
- **Effects**: an outline, a shadow or a glow on the layer.

## The canvas

- **Pan** with the Hand tool (<kbd>H</kbd>), or hold <kbd>Space</kbd> and drag with any tool.
- **Zoom** with a pinch on a trackpad, the mouse wheel, or <kbd>Ctrl</kbd> with either, toward the pointer.
- On a trackpad, **two fingers pan** in any direction.
- In the top right corner: the drawing's size, its number of layers and colors, and the pointer's coordinates.

## The preview

<figure class="shot">
  <img class="for-light" src="../../shots/preview-light.webp" width="234" height="200" alt="The floating preview, showing the whole sunset at 2×." loading="lazy" />
  <img class="for-dark" src="../../shots/preview-dark.webp" width="234" height="200" alt="The floating preview, showing the whole sunset at 2×." loading="lazy" />
</figure>

A small floating window with the whole drawing at a fixed size, so you see it as it will be while you work up close. When the canvas shows only part of the drawing, a frame marks where you are: drag it to move around. Drag the window by its title, resize it by its corner, or fold it.

## The files screen

<figure class="shot">
  <img class="for-light" src="../../shots/files-light.webp" width="1440" height="900" alt="The files screen: the logo, Create and Import, and recent drawings as cards." loading="lazy" />
  <img class="for-dark" src="../../shots/files-dark.webp" width="1440" height="900" alt="The files screen: the logo, Create and Import, and recent drawings as cards." loading="lazy" />
</figure>

Baipix opens on your files, newest first, with Create and Import buttons. Come back to it with File › Recent › All files. See [Create and open files](../create-and-open/).
