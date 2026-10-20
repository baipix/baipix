---
layout: ../../../layouts/DocsLayout.astro
title: Fills and gradients
description: 'Fill pixel art in Baipix: the paint bucket on one area or a whole color, the lasso fill, and gradients in palette colors with smooth or checker dithering.'
---

## Paint bucket

The bucket (<kbd>G</kbd>) fills the area of the same color under the pointer. In its options:

- **Contiguous area only** (on by default): only the pixels that touch. Off, it replaces that color everywhere on the layer.
- In a selection, it fills the whole selection.

## Lasso fill

The lasso fill (<kbd>K</kbd>) draws a shape freehand and fills it with the color when you let go. Right-click fills with the color behind. It's the quickest way to block in a shape before the details.

## Gradient

<figure class="shot">
  <img class="for-light" src="../../shots/gradient-light.webp" width="700" height="116" alt="The Gradient’s options: shape, the bar of color stops, reverse and turn, dithering." loading="lazy" />
  <img class="for-dark" src="../../shots/gradient-dark.webp" width="700" height="116" alt="The Gradient’s options: shape, the bar of color stops, reverse and turn, dithering." loading="lazy" />
</figure>

The gradient (<kbd>D</kbd>) shares a button with the bucket. Drag from where it starts to where it ends (Shift: by 45°). It fills the area of the same color under the first click, or the selection.

- **Shape**: linear, radial, angular or diamond.
- **Stops**: the bar in its options shows the colors. Click it to add a stop, drag a stop to move it, click a stop to change its color: any color, with the same square, hue and opacity as your colors' picker, or one of the palette's, or transparent. It starts from your two colors.
- **Dithering**: between two colors, pixels alternate in a pattern instead of a new color: **smooth** (an ordered pattern, the classic Bayer), **checker**, or **bands** with no dithering at all.
- The gradient only uses its stops' colors: pick them from the palette, and it stays within it.
- Change the options right after drawing: the last gradient follows them.
