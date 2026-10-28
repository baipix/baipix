---
layout: ../../../layouts/DocsLayout.astro
title: Shade and lighten
description: 'Shade and lighten pixel art along the palette in Baipix: one step darker or lighter in the same ramp, the whole palette, or outside it, with a hue shift, and a light guide to shade by.'
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

## The light guide

Shading holds together when every shape takes its light from the same side. The **Light** section of the right panel sets that side for the board: click **+**, then drag the lamp around the little sphere. Around it is the angle, from any direction; nearer the sphere is a light from high above, farther a low, grazing one. The sphere shades as the light falls on it, and its shadow stretches on the ground. With the stage focused, the arrow keys turn the light (<kbd>Shift</kbd> by 15°) and raise or lower it.

Over the canvas, the guide shows:

- **Direction on the canvas**: faint parallel lines running from the light.
- **Lit and shaded sides**: the edges of your shapes facing the light tinted warm, the ones away from it cool, so you see where highlights and shadows go. The background color doesn't count as a shape.

It's a guide, like the grid: nothing is painted with it, and it isn't exported. The light is saved with the board, each board its own, and **−** takes it away.
