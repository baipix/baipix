---
layout: ../../../layouts/DocsLayout.astro
title: Colors and palettes
description: 'Colors in Baipix: the two colors you draw with, the eyedropper with its loupe, and palettes: classic presets like PICO-8 and Game Boy, the drawing’s own colors, your palettes, and .hex and .gpl files.'
---

## Your two colors

In the Colors section of the right panel, two overlapping chips: the front one is what the tools draw with on a left click, the one behind on a right click.

- Click the front chip for its picker: a color field, a hex code and an opacity.
- Click the one behind to bring it to the front, or press <kbd>X</kbd> to swap them.
- Click a swatch of the palette to draw with it.

## The eyedropper

The eyedropper (<kbd>I</kbd>) picks the color under the pointer: left click for the front color, right click for the one behind. A loupe shows the pixels around it and the color's hex code. With any drawing tool, hold <kbd>Alt</kbd> to pick a color without switching tools.

## The file's palette

<figure class="shot">
  <img class="for-light" src="../../shots/palette-menu-light.webp" width="220" height="811" alt="The palette menu: Drawing colors, then the presets with their colors, Sweetie 16, PICO-8, Endesga 32 and more, and Manage palettes." loading="lazy" />
  <img class="for-dark" src="../../shots/palette-menu-dark.webp" width="220" height="811" alt="The palette menu: Drawing colors, then the presets with their colors, Sweetie 16, PICO-8, Endesga 32 and more, and Manage palettes." loading="lazy" />
</figure>

Each file keeps its own palette, saved with it. Pick one in the menu next to the Colors title:

- **Drawing colors**: the colors the drawing uses, kept up to date as you draw.
- **Presets**: Sweetie 16 (a new file starts with it), PICO-8, Endesga 32, DawnBringer 16 and 32, Resurrect 64, AAP-64, SLSO8, Pollen8, Oil 6, Twilight 5, four Game Boy palettes, Commodore 64, CGA, ZX Spectrum and Grayscale.
- **My palettes**: your own, there in every file. Make one from the file's palette or from a palette file in **Manage palettes…**.

The **+** after the last swatch adds the current color to the palette. The palette's … menu sorts it by lightness, builds it from the drawing, makes a shade ramp, pastes colors, and opens or exports **.hex** (Lospec) and **.gpl** (GIMP, Aseprite, Krita) files. To use any palette from Lospec, paste its colors or open its .hex file.

Undo works on the palette too.
