---
layout: ../../../layouts/DocsLayout.astro
title: Shade and lighten
description: 'Shade and lighten pixel art along the palette in Baipix: one step darker or lighter in the same ramp, the whole palette, or outside it, with a hue shift.'
---

**Shade** (<kbd>S</kbd>) and **Lighten** (<kbd>O</kbd>) share a button. Paint over pixels to make them one step darker or lighter. Right-click does the opposite.

The **Mode** in their options says what "one step" is:

- **Same ramp** (the default): the next color of the same ramp in the palette, from its darkest to its lightest. Shadows stay in the material's colors.
- **Whole palette**: the next palette color by lightness, from any ramp.
- **Free**: the color itself made darker or lighter, outside the palette, by 1 to 3 steps (**Strength**). **Hue shift** turns the hue as it goes, highlights toward yellow and shadows toward blue-violet, the way pixel artists color.

<figure class="shot">
  <img class="for-light" src="../../shots/shade-light.webp" width="662" height="116" alt="The Shade tool’s options: the mode (same ramp, whole palette or free), and the strength." loading="lazy" />
  <img class="for-dark" src="../../shots/shade-dark.webp" width="662" height="116" alt="The Shade tool’s options: the mode (same ramp, whole palette or free), and the strength." loading="lazy" />
</figure>

Each stroke steps a pixel once, however long you paint over it: paint again for another step.
