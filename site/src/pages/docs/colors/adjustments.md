---
layout: ../../../layouts/DocsLayout.astro
title: Adjustments
description: 'Adjust pixel art colors in Baipix: hue, saturation and brightness, remap a drawing to another palette by nearest color or by lightness, and add an outline.'
---

<figure class="shot">
  <img class="for-light" src="../../shots/adjustments-light.webp" width="292" height="384" alt="The Adjustments panel on its Colors tab: hue, saturation and brightness, active layer or all layers, adjust the palette too." loading="lazy" />
  <img class="for-dark" src="../../shots/adjustments-dark.webp" width="292" height="384" alt="The Adjustments panel on its Colors tab: hue, saturation and brightness, active layer or all layers, adjust the palette too." loading="lazy" />
</figure>

**Image › Adjustments** (<kbd>Ctrl</kbd>+<kbd>U</kbd>) opens a panel with three tabs. You see the result on the canvas as you go, then Apply or Cancel. With a selection, only the selection changes.

## Colors

Hue, saturation and brightness, for the **active layer** or **all layers**. **Adjust the palette too** changes the palette's colors with them, so the drawing and its palette stay together.

## Remap

Move a drawing to another palette, or clean up its colors:

- **Nearest**: each color goes to the closest one of the palette. To clean up a drawing with a few stray colors.
- **By lightness**: colors go to palette colors in the same order, darkest to darkest. It recolors and keeps the shadows and highlights: a sprite in another palette, a scene at night.
- **Also replace the file's palette** switches the file to that palette at the same time.

## Outline

A one-pixel line around what's drawn on the layer, outside or inside, in the color you pick (<kbd>Shift</kbd>+<kbd>O</kbd> opens it). For an outline that stays editable, use an Outline effect on the layer instead.
