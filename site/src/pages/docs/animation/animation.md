---
layout: ../../../layouts/DocsLayout.astro
title: Animation
description: 'Animate pixel art in Baipix: a timeline of frames under the canvas, a duration for each, onion skin, playback, and export as GIF, PNG sequence, sprite sheet or Aseprite.'
---

<figure class="shot">
  <img class="for-light" src="../../shots/animation-light.webp" width="1440" height="900" alt="The slime from the animation page in the editor, mid-jump on frame 6 of 14, the timeline open under the canvas with a row per layer, and the onion skin showing the frames before in red and after in blue." loading="lazy" />
  <img class="for-dark" src="../../shots/animation-dark.webp" width="1440" height="900" alt="The slime from the animation page in the editor, mid-jump on frame 6 of 14, the timeline open under the canvas with a row per layer, and the onion skin showing the frames before in red and after in blue." loading="lazy" />
</figure>

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

<figure class="shot">
  <img class="for-light" src="../../shots/frame-menu-light.webp" width="649" height="377" alt="Frames 6 to 9 picked in the timeline, light violet, and the frame menu open: new frame, new empty frame, copy 4 frames, paste frames, reverse frames, delete 4 frames." loading="lazy" />
  <img class="for-dark" src="../../shots/frame-menu-dark.webp" width="649" height="377" alt="Frames 6 to 9 picked in the timeline, light violet, and the frame menu open: new frame, new empty frame, copy 4 frames, paste frames, reverse frames, delete 4 frames." loading="lazy" />
</figure>

## Play

**Play** in the timeline, <kbd>Enter</kbd>, or a tap on <kbd>Space</kbd> plays the frames in a loop, each for its duration; the same again pauses. Held, <kbd>Space</kbd> still pans the view. <kbd>,</kbd> and <kbd>.</kbd> step to the previous and next frame, and **First frame** goes back to the start. The preview window plays along, at its own size.

Drawing on the canvas pauses, so you always draw on the frame you see.

## Onion skin

The ghost button in the timeline turns on the **onion skin**: the frames around the one you draw, faded under it, red for the ones before and blue for the ones after. It shows where things come from and where they go.

- **Before** and **After** set how many frames show on each side, up to five; the farther ones fade more.
- The **opacity** sets how strong the nearest ones are.
- **Loop**, the arrows next to it, is for an animation that plays in a loop: on the first frame, the last ones show before it, and on the last frame, the first ones show after it.
- A background painted on its own layer, like a sky, stays under the onion skin when it's the same on every frame.

The onion skin never ends up in an export: it's only there to draw by.

## Export a GIF

<figure class="shot">
  <img class="for-light" src="../../shots/export-gif-light.webp" width="432" height="540" alt="The Export dialog on the slime, with GIF picked as the format, at 8×." loading="lazy" />
  <img class="for-dark" src="../../shots/export-gif-dark.webp" width="432" height="540" alt="The Export dialog on the slime, with GIF picked as the format, at 8×." loading="lazy" />
</figure>

In the Export dialog, pick **GIF**: an animated image that loops forever, every frame with its duration rounded to 10 ms, at the pixel size picked. It keeps the drawing's exact colors up to 255 of them. Fully transparent pixels stay transparent, or the background fills them if you include it. See [Export](../../export/export/).

With **All boards**, each board's animation is a GIF of its own, in a .zip.

## Keep working in Aseprite

Pick **Aseprite** to open the animation there: every frame comes along with its duration, and so do the layers, groups, blend modes and the palette. A layer that stays the same from one frame to the next becomes a linked cel, as Aseprite makes them, so it stays one drawing there too.

## Export the frames apart

Pick **PNG sequence** for one PNG per frame, named in order (`slime-01.png`, `slime-02.png`…), in a .zip, at the pixel size picked, with or without the background. With **All boards**, each board's frames go in a folder of their own.

## A sprite sheet for a game

Pick **Frames + sprite sheet** for every frame on one PNG, as many to a row as the **Columns**, with a JSON in the TexturePacker format that gives each frame's place and duration. Phaser, Unity or a Godot importer play it as it is.
