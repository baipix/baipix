---
layout: ../../../layouts/DocsLayout.astro
title: Isometric
description: 'Isometric pixel art in Baipix: the 2:1 isometric grid, lines and shapes on the ground or a wall, shaded boxes, cylinders, pyramids, stairs and ramps, extrude, and isometric tiles.'
---

Baipix draws isometric pixel art the classic way: lines go two pixels across for one up, so every step is even. For an introduction with examples, see the [Isometric pixel art](../../../isometric-pixel-art/) guide.

## The isometric grid

Turn it on in the **Board** section of the right panel, or start from the Isometric tile or Isometric scene template.

- **Cell**: the width of a diamond, in pixels. A box's top falls exactly on the diamonds.
- **Vertical lines**: upright lines through the diamonds' corners, to build heights.
- The grid belongs to the file: it's saved with it.

## Lines and shapes

- The **line** snaps to 2:1 with <kbd>Shift</kbd>, besides 0°, 45° and 90°. So does the pencil's straight line (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>-click).
- With the grid on, <kbd>Shift</kbd> lays any shape on the **ground**, regular: a square tile, a circle, a star… dragged from the top corner of its diamond to the bottom one.
- The rectangle and the ellipse get a **Plane** option: Flat, Left wall, Right wall or Ground. On a wall, the shape's top and bottom follow the wall at 2:1.
- On the ground, the rectangle has **Tile edges**: leave an edge's outline out so tiles side by side share one line.

## Volumes

<figure class="shot">
  <img class="for-light" src="../../shots/iso-box-light.webp" width="984" height="116" alt="The isometric box’s options: width, depth and height, outline, light edge, edges, bevel, and the three face colors." loading="lazy" />
  <img class="for-dark" src="../../shots/iso-box-dark.webp" width="984" height="116" alt="The isometric box’s options: width, depth and height, outline, light edge, edges, bevel, and the three face colors." loading="lazy" />
</figure>

The box, cylinder, pyramid and stairs are in the shapes menu. Each comes out shaded from the current color: the top in that color, the sides one and two steps darker in the palette.

- **Box**: drag from the top corner of its top to the bottom one (<kbd>Shift</kbd>: as deep as wide). **Width**, **depth** and **height** redraw the last box.
- **Cylinder**: drag across its top, an ellipse lying flat. **Stands** can lay it along the left or the right axis, for logs, barrels and wheels.
- **Pyramid**: drag across its base; its apex is **Height** above the middle.
- **Stairs and ramp**: drag like the box. It rises toward the corner you pick, Height tall; with **Steps** above 0, it's a staircase of even steps.

Their options, shared:

- **Outline**: a dark line around the volume. **Light edge**: the top's front edges a step lighter. **Edges**: lines between the faces.
- **Bevel** (the box): light the top's back edges, turn the front corner, or both.
- **Faces**: three swatches for the top, left and right. Click one to give it the current color instead of shading from the palette.
- Change an option right after drawing: the last volume follows it.

## From flat to volume

- **Image › Extrude…**: the selection, or what's drawn on the layer, becomes the top of a volume that goes up by the height, its sides darker. <kbd>Enter</kbd> applies, <kbd>Escape</kbd> cancels.
- **Image › Put on an isometric face**: a flat drawing laid onto the left side, the right side or the top.

## Scenes and tiles

- One object per layer, then **Layer › Sort by depth**: the layers that reach lowest on screen go in front.
- With the isometric grid on, the **tile preview** repeats the drawing staggered, half a tile across and down, as isometric tiles fit together.
- **Export › Tileset** cuts a drawing into tiles for a game engine: see [Export](../../export/export/).
