---
layout: ../../../layouts/DocsLayout.astro
title: Export
description: 'Export pixel art from Baipix: PNG at 1× to 32×, clean SVG with one path per color, Aseprite files, each layer and a sprite sheet, tilesets for Godot and Tiled, every board at once, and copy as SVG or PNG.'
---

<figure class="shot">
  <img class="for-light" src="../../shots/export-light.webp" width="380" height="475" alt="The Export dialog: a preview of the sunset, its size, the pixel size from 1× to 32×, the name, the format, and Export, Copy as SVG and Copy as PNG." loading="lazy" />
  <img class="for-dark" src="../../shots/export-dark.webp" width="380" height="475" alt="The Export dialog: a preview of the sunset, its size, the pixel size from 1× to 32×, the name, the format, and Export, Copy as SVG and Copy as PNG." loading="lazy" />
</figure>

**Export** at the top right (<kbd>Ctrl</kbd>+<kbd>E</kbd>) opens the dialog: a preview of what you'll get, its size in pixels, and its options.

## Size and background

- **Pixel size**, 1× to 32×: how many screen pixels each drawing pixel becomes. A 32 × 32 sprite at 8× is a 256 × 256 image.
- The **gap** set in the Board section spaces the pixels apart, for an LED look, in the PNG and the SVG alike.
- **Include the background**: the board's background color, or a transparent image.
- **Active layer only**: just the layer you're on.

## Formats

- **PNG**: an image, sharp at the pixel size you picked.
- **SVG**: vector, light and sharp at any size. Each color is one path, neighboring pixels of the same color merged, so there are no thin lines between them. Layers and groups come out as named groups, with their opacity and blend modes. See [Pixel art to SVG](../../../pixel-art-to-svg/).
- **Aseprite**: an .aseprite file to keep working there, with the layers, groups, blend modes and the palette, on a single frame.
- **Layers + sprite sheet**: a .zip with one PNG per visible layer, named after it, and a sheet with the layers side by side, left to right from the bottom layer. Each PNG has the layer's own pixels, at full opacity, for game engines that put sprites together or swap them.
- **Tileset**: the drawing cut into tiles of W × H pixels, for a game engine. A .zip with the tiles on one PNG sheet, a Tiled tileset and a Tiled map that draws the drawing again; Godot takes the PNG as it is. **Leave out empty and repeated tiles** keeps the sheet small.

## Every board at once

In a file of several boards, **All boards** exports each one in the format you picked, named after it, in a .zip.

## Copy instead of saving

- **Copy as SVG** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>): paste the drawing straight into Figma or Illustrator, as shapes you can edit. See [Pixel art for Figma](../../../pixel-art-for-figma/).
- **Copy as PNG**: for apps that only take images.

## Save the file itself

Export makes images. To keep the drawing with its layers and boards, use **File › Download as .baipix**: see [Files and saving](../../getting-started/files-and-saving/).
