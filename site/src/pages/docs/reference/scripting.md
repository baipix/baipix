---
layout: ../../../layouts/DocsLayout.astro
title: Scripting
description: 'Drive the Baipix editor from code with its JavaScript API: make variations of a board, remap every board to another palette, with the same tools and undo as by hand.'
---

The editor's page has a JavaScript API, `window.baipix`. It drives the same tools you use, on the file you have open, so a script, or an assistant you trust with it, can take on the repetitive part of the work: variations of a board you drew.

- **Colorways**: a copy of a board in other colors, shadows and highlights kept in place.
- **Another palette**: every board of the file remapped at once, each color going to the same new color everywhere.
- **States and variants**: a hurt or frozen state, a pose or costume change, a board resized to redraw it bigger.

Each variation is a new board beside yours, which stays as you drew it. Everything shows live on the canvas, and every change is an undo step like any other.

## Use it

Open the editor, then the browser's console (or any tool that runs code in a page), and type `baipix.help()`: it lists every call.

```js
baipix.duplicateBoard('Frozen');
baipix.remap({ palette: ['#0b1a33', '#2f5d8a', '#7fb2e0', '#d8f0ff', '#ffffff'], mode: 'lightness' });
```

The [agent guide](../../../agent.md) explains it all, step by step: point an assistant at it. Like the rest of Baipix, the API runs in your browser and sends your drawings nowhere.
