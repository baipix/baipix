---
layout: ../../../layouts/DocsLayout.astro
title: Boards
description: 'Several boards in one Baipix file, like frames in a design tool: add, duplicate, move, align and delete boards, keep layers outside them, and export them all at once.'
---

A file can hold several boards side by side, each with its own size, layers and undo history: a sprite and its variants, a sheet of icons, a scene in four seasons. They share the file's palette.

<figure class="shot">
  <img class="for-light" src="../../shots/boards-light.webp" width="1440" height="900" alt="A file of four boards, Spring, Autumn, Winter and Night, side by side on the canvas, each listed in the Layers panel." loading="lazy" />
  <img class="for-dark" src="../../shots/boards-dark.webp" width="1440" height="900" alt="A file of four boards, Spring, Autumn, Winter and Night, side by side on the canvas, each listed in the Layers panel." loading="lazy" />
</figure>

## Add a board

- **File › New board** adds one beside the active board, at its size.
- Or draw one: the Board tool (<kbd>A</kbd>) draws a rectangle beside the others.
- **File › Duplicate board** copies the active board, layers and all. <kbd>Alt</kbd>-drag a board by its name to drop a copy where you let go.

## Work with boards

- **Click a board** to work on it. In the Layers panel, each board has its row; the active one shows its layers.
- **Drag a board by its name** to move it.
- **Select boards**: click a board's name, Shift-click to add more. Align them with the Align commands, move them, or delete them together with <kbd>Del</kbd>.
- Undo brings back a deleted board, and takes back a move or an alignment.

## Layers outside the boards

With the Move tool, drag a layer out of every board and let go: it stays there, visible, listed next to the boards. Drag it onto a board to put it back. A file can even have no board at all, only such layers. Only boards are exported.

## Export every board

In a file of several boards, Export has an **All boards** option: one file per board, named after it, in a .zip.
