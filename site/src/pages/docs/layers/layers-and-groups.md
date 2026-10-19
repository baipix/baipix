---
layout: ../../../layouts/DocsLayout.astro
title: Layers and groups
description: 'Layers in Baipix, the pixel art editor that works like a design tool: add, duplicate, merge, hide, lock and reorder layers, select several, group them four levels deep, and copy layers between files.'
---

Each part of a drawing can have its own layer: the sky, the background, each character. Change one without touching the others.

<figure class="shot">
  <img class="for-light" src="../../shots/layer-menu-light.webp" width="256" height="518" alt="A layer’s right-click menu: rename, duplicate, repeat in a grid, group, create component, merge, adjust, lock, show only this layer, delete." loading="lazy" />
  <img class="for-dark" src="../../shots/layer-menu-dark.webp" width="256" height="518" alt="A layer’s right-click menu: rename, duplicate, repeat in a grid, group, create component, merge, adjust, lock, show only this layer, delete." loading="lazy" />
</figure>

## Layers

- **Add** a layer with the **+** next to Layers (<kbd>Shift</kbd>+<kbd>N</kbd>). It goes above the active one.
- **Duplicate** (<kbd>Shift</kbd>+<kbd>D</kbd>), **Merge down** (<kbd>Shift</kbd>+<kbd>M</kbd>), **Merge visible layers** and **Flatten image** are in a layer's right-click menu and the Layer menu.
- **Hide** a layer with its eye. <kbd>Alt</kbd>-click the eye to show only that one.
- **Lock** a layer so nothing draws on it by mistake.
- **Reorder** by dragging a row, or with <kbd>Alt</kbd>+<kbd>↑</kbd> and <kbd>Alt</kbd>+<kbd>↓</kbd>.
- **Delete**: <kbd>Del</kbd> with nothing selected on the canvas, or Delete layer in its menu. The message that follows has an Undo.

## Several at once

Shift-click a row to select a range, Ctrl-click to add or remove one. With the Move tool, Shift-click on the canvas adds the layer under the pointer, and dragging from an empty spot selects every layer the rectangle touches. Selected layers move, merge, group and delete together.

## Groups

<figure class="shot">
  <img class="for-light" src="../../shots/groups-light.webp" width="256" height="317" alt="Two layers in a group, Group 1, open in the Layers panel." loading="lazy" />
  <img class="for-dark" src="../../shots/groups-dark.webp" width="256" height="317" alt="Two layers in a group, Group 1, open in the Layers panel." loading="lazy" />
</figure>

- **Group selection** (<kbd>Ctrl</kbd>+<kbd>G</kbd>) puts the selected layers in a group. **Ungroup** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>) takes them out.
- Groups go four levels deep. Drop a layer on a group's row to put it inside.
- The arrow folds a group. A group has its own visibility, lock, blend mode and opacity, like a layer.
- With the Move tool, a click picks a layer's group; double-click to go into it.
- **Merge group** turns it into one layer.

## Between files

With nothing selected on the canvas, <kbd>Ctrl</kbd>+<kbd>C</kbd> in the Layers panel copies the selected layers, whole. Paste them in another file with <kbd>Ctrl</kbd>+<kbd>V</kbd>: they keep their names, blend modes and effects.

## Reference image

**File › Reference image…**, or the image button next to Layers, places a picture under every layer, to trace over. It shows at the bottom of the panel: select it to move, resize or fade it. It's never exported.

## For isometric scenes

**Layer › Sort by depth** puts the layers whose drawing reaches lowest on screen in front: with one object per layer, the closest ones end up on top.
