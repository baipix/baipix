---
layout: ../../../layouts/DocsLayout.astro
title: Components
description: 'Components in Baipix: draw a sprite once, place instances of it anywhere, and every copy follows when you change it. Repeat one in a grid, go to its component, or detach a copy.'
---

A component is a drawing you reuse: a tree, a tile, an icon. Its instances are copies that stay linked to it. Draw on the component, and every instance follows, live.

<figure class="shot">
  <img class="for-light" src="../../shots/components-light.webp" width="256" height="370" alt="The Layers panel with a Components section listing one component, Stars, and its layer marked with a diamond." loading="lazy" />
  <img class="for-dark" src="../../shots/components-dark.webp" width="256" height="370" alt="The Layers panel with a Components section listing one component, Stars, and its layer marked with a diamond." loading="lazy" />
</figure>

## Make one

Select part of a drawing, or pick a layer, then **Create component** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd>), from the diamond button next to Layers, a layer's right-click menu or the Layer menu. It's listed at the top of the Layers panel, and its layer gets a diamond.

## Place instances

- **Drag** the component from the Components section onto the canvas.
- Or <kbd>Alt</kbd>-drag an instance with the Move tool to drop a copy.
- **Repeat in a grid…** (a layer's right-click menu) lays out copies in columns and rows, with a gap between them. A component repeats as instances. It updates live as you set it.

An instance moves and resizes like any layer. Its pixels come from the component.

## Change them

- Draw on the **component**: every instance changes with it.
- **Go to component** (an instance's right-click menu) takes you to it.
- **Detach instance** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>B</kbd>) turns a copy into a plain layer, to change it on its own.
