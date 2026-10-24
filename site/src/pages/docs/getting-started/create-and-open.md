---
layout: ../../../layouts/DocsLayout.astro
title: Create and open files
description: 'Start a new pixel art file from a size or a template, import an image, recover the real pixels of upscaled pixel art, and open .baipix files.'
---

## A new file

**File › New file…**, or Create on the files screen. Type a width and a height, or pick one of the sizes you used last, and press <kbd>Enter</kbd>. **From an image…** at the bottom starts from a picture instead.

<figure class="shot">
  <img class="for-light" src="../../shots/new-file-light.webp" width="352" height="498" alt="The New file dialog: width and height, recent sizes, and the templates with their sizes." loading="lazy" />
  <img class="for-dark" src="../../shots/new-file-dark.webp" width="352" height="498" alt="The New file dialog: width and height, recent sizes, and the templates with their sizes." loading="lazy" />
</figure>

Or start from a **template**, each with a size and a palette that suit it. Before your first drawing, the files screen shows them as cards: one click and the canvas is ready.

| Template         | Size      | Palette        | Comes with                   |
| ---------------- | --------- | -------------- | ---------------------------- |
| Icon             | 16 × 16   | Sweetie 16     |                              |
| Character sprite | 32 × 32   | PICO-8         | Left-right symmetry          |
| Game tile        | 32 × 32   | Endesga 32     | Tile preview                 |
| Portrait         | 64 × 64   | DawnBringer 32 |                              |
| Game Boy screen  | 160 × 144 | Game Boy       |                              |
| Banner           | 128 × 32  | Resurrect 64   |                              |
| Isometric tile   | 32 × 16   | Endesga 32     | Isometric grid, tile preview |
| Isometric scene  | 128 × 128 | Resurrect 64   | Isometric grid               |

You can change the size later with the W and H fields in the Board section, or **Image › Board size…** to choose which side grows.

## Import an image

**File › Import an image…**, or drop a PNG, JPG or GIF on the canvas. An image the size of the drawing comes in as a new layer of it. Any other size becomes a new file, and the message that follows offers to use it as a reference to trace over instead. On the files screen, Import always makes a new file.

### Pixel art that was scaled up

A screenshot of pixel art, or an export at 800%, has big blocks instead of pixels. Baipix notices: it finds the pixel grid, even in a cropped image, and offers to **recover the pixels**, giving you the drawing at its real size. Adjust the scale or the offset if the grid doesn't fall right, or keep the image as it is.

### A reference to trace over

**File › Reference image…** places a photo or a sketch under the layers. It's never exported. Move it, resize it and fade it like a layer, then draw over it and hide it.

## Open a .baipix file

**File › Open a .baipix file…** (<kbd>Ctrl</kbd>+<kbd>O</kbd>), or drop the file on the canvas. A .baipix file holds everything: the boards, their layers and groups, the components, the palette and the guides. It opens as a new file next to the others.

The drawings in the [gallery](../../../#gallery) can be opened the same way: their Open link takes you to the editor with the drawing ready.

## Several boards in one file

A file can hold several boards side by side, like frames in a design tool: a sprite and its variants, a scene in four seasons. **File › New board** adds one beside the active board, and **File › Duplicate board** copies it with its layers. The Board tool (<kbd>A</kbd>) draws one wherever you want.
