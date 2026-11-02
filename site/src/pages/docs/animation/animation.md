---
layout: ../../../layouts/DocsLayout.astro
title: Animation
description: 'Animate pixel art in Baipix: a timeline of frames under the canvas, a duration for each, onion skin, playback, and animated GIF export.'
---

## The timeline

**Animate**, the film button beside Export (<kbd>Shift</kbd>+<kbd>A</kbd>, or **View › Timeline**), opens the timeline under the canvas: a row per layer, the top one first, and a column per frame.

- A dot shows a layer drawn on that frame, a ring a layer left empty there.
- Click a cell to show its frame and draw on its layer. The frame shown is violet.
- Every layer is the same on every frame (its name, visibility, blend mode, effects): only its pixels change from one frame to the next.
- A file with frames shows a film badge on the files screen.

## Frames

- **New frame** (<kbd>Alt</kbd>+<kbd>N</kbd>, or the + in the timeline) adds a copy of the frame shown, right after it, so you only redraw what moves.
- **New empty frame** (<kbd>Alt</kbd>+<kbd>B</kbd>) keeps the scenery, the layers that are the same on every frame like a sky or the ground, and leaves the rest empty. On a board of one frame, only the active layer is left empty.
- **Drag** a frame's number to move it.
- **Delete** a frame with the trash in the timeline, or from its menu.
- **Duration**: each frame shows for as long as you set, from 10 ms to 10 s. Hold the key poses, flash the fast ones.

Right-click a frame's number for its menu: new frames, copy, paste, reverse and delete.

## Several frames at once

**Shift-click** a frame's number to pick every frame from the shown one up to it, **Ctrl-click** to add or remove one. Picked frames get a light violet. Then:

- the **duration** sets all of them;
- **Copy frames** and **Paste frames** put them after the frame shown, on this board or on another one of the same size, durations included. Each layer takes the pixels of the same layer, or of a layer with the same name on another board;
- **Reverse frames** swaps their order in the places they hold, to make a loop come back;
- **Delete** removes them all, in one step to undo.

## Play

**Play** in the timeline, <kbd>Enter</kbd>, or a tap on <kbd>Space</kbd> plays the frames in a loop, each for its duration; the same again pauses. Held, <kbd>Space</kbd> still pans the view. <kbd>,</kbd> and <kbd>.</kbd> step to the previous and next frame. The preview window plays along, at its own size.

Drawing on the canvas pauses, so you always draw on the frame you see.

## Onion skin

The ghost button in the timeline turns on the **onion skin**: the frames around the one you draw, faded under it, red for the ones before and blue for the ones after. It shows where things come from and where they go.

- **Before** and **After** set how many frames show on each side, up to five; the farther ones fade more.
- The **opacity** sets how strong the nearest ones are.
- A background painted on its own layer, like a sky, stays under the onion skin when it's the same on every frame.

The onion skin never ends up in an export: it's only there to draw by.

## Export a GIF

In the Export dialog, pick **GIF**: an animated image that loops forever, every frame with its duration rounded to 10 ms, at the pixel size picked. It keeps the drawing's exact colors up to 255 of them. Fully transparent pixels stay transparent, or the background fills them if you include it. See [Export](../../export/export/).

With **All boards**, each board's animation is a GIF of its own, in a .zip.
