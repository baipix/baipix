---
layout: ../../../layouts/DocsLayout.astro
title: Spray and rework
description: 'Spray pixels, then rework pixel art without new colors in Baipix: Jumble shuffles pixels, Liquify pushes, expands or shrinks, and Blur can stay within the palette.'
---

## Spray

The spray (<kbd>P</kbd>) drops random pixels in a circle, like a spray can. Hold still to keep spraying, right-click to spray the color behind. **Density** sets how many pixels each puff drops, and **Random opacity** varies their transparency.

<figure class="shot">
  <img class="for-light" src="../../shots/spray-light.webp" width="662" height="116" alt="The Spray’s options: its size, density and random opacity." loading="lazy" />
  <img class="for-dark" src="../../shots/spray-dark.webp" width="662" height="116" alt="The Spray’s options: its size, density and random opacity." loading="lazy" />
</figure>

## Rework without new colors

Three tools share a button to reshape what's already drawn. Jumble and Liquify only move pixels around, so the drawing keeps its colors and its sharp edges.

- **Jumble** (<kbd>J</kbd>) shuffles the pixels under the brush: texture for foliage, rock or noise. **Strength** sets how far they move. Hold still to keep going.
- **Liquify** (<kbd>W</kbd>) warps the drawing: **Push** drags pixels along with the brush, **Expand** and **Shrink** make a part bigger or smaller.
- **Blur** (<kbd>F</kbd>) mixes neighboring pixels. With **Stay within the palette**, each pixel then takes the closest palette color; off, it makes new colors and semi-transparency. Paint again to blur more.
