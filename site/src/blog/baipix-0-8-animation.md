---
title: 'Baipix 0.8: pixel art animation'
description: 'You can animate in Baipix now. A timeline of frames, onion skin, and GIF, PNG sequence, sprite sheet or Aseprite export. Plus Italian, Japanese, and a light to shade by.'
date: '2026-11-09'
category: news
author: Todo-bai
cover: /blog/0-8/cover.jpg
draft: true
---

Baipix 0.8 is out. Until now, a drawing in Baipix was one still picture. If you wanted it to move, you had to export each pose and put them together somewhere else.

Now you can animate right in the editor. You add frames, see the ones around the one you're drawing, play them, and take them out as a GIF or as files for a game engine. Your old drawings don't change, they're just animations with one frame.

<figure class="wide">
  <img src="/blog/0-8/ecto-1.webp" width="1072" height="944" alt="The Ecto-1 driving, its wheels turning and smoke behind it, over a simple timeline with a row per layer, from the roof rack to the speed lines, the column of the frame shown moving from 1 to 16." />
  <figcaption>16 frames of 70 ms, and its seven layers. <a href="/app/?open=/blog/0-8/ecto-1.baipix">Open it in Baipix</a> to see how it's made.</figcaption>
</figure>

Here's what's in this release.

| What                                     | In short                                                              |
| ---------------------------------------- | --------------------------------------------------------------------- |
| [Timeline](#a-timeline-under-the-canvas) | A row per layer, a column per frame, each frame with its own duration |
| [Frames](#several-frames-at-once)        | Pick several, copy and paste, reverse, start an empty one             |
| [Onion skin](#onion-skin)                | The frames before in red, after in blue, under the one you draw       |
| [GIF](#a-gif)                            | Every frame with its duration, looping, exact colors                  |
| [For game engines](#for-a-game-engine)   | A PNG sequence, or a sprite sheet with its JSON                       |
| [Aseprite](#to-keep-going-in-aseprite)   | Every frame and its duration, in an .aseprite file                    |
| [Light](#a-light-to-shade-by)            | A light for each board, and a shadow that follows it                  |
| [Remap](#remap-takes-the-background-too) | The background goes to the new palette too                            |
| [Languages](#italian-and-japanese)       | Italian and Japanese                                                  |

## A timeline under the canvas

The **Animate** button, the little film beside Export, opens a timeline under the canvas. There's a row per layer and a column per frame.

<figure class="wide">
  <img class="for-light" src="/blog/0-8/animation-light.webp" width="1440" height="900" alt="The slime in the editor, mid-jump on frame 6 of 14, the timeline open under the canvas with a row per layer, and the onion skin showing the frames before in red and after in blue." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/animation-dark.webp" width="1440" height="900" alt="The slime in the editor, mid-jump on frame 6 of 14, the timeline open under the canvas with a row per layer, and the onion skin showing the frames before in red and after in blue." loading="lazy" />
</figure>

A new frame starts as a copy of the one you're on, so you only redraw what moves. You can drag frames around to change their order.

Each frame has its own duration. The slime holds still for a moment before it jumps, then the jump goes by fast.

<figure>
  <img class="for-light" src="/blog/0-8/timeline-light.webp" width="1100" height="688" alt="The timeline: frame 6 of 14 picked, its duration set to 60 ms, and the five layers of the slime as rows: face, body, shadow, ground and sky." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/timeline-dark.webp" width="1100" height="688" alt="The timeline: frame 6 of 14 picked, its duration set to 60 ms, and the five layers of the slime as rows: face, body, shadow, ground and sky." loading="lazy" />
  <figcaption>Frame 6 lasts 60 ms, a quick one in the middle of the jump.</figcaption>
</figure>

<kbd>Enter</kbd>, or a tap on <kbd>Space</kbd>, plays the animation in a loop. <kbd>,</kbd> and <kbd>.</kbd> go back and forth one frame at a time.

On the files screen, animated drawings have a small film badge.

## Several frames at once

You can pick several frames with <kbd>Shift</kbd> or <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>-click, then right-click them. You can set their duration, copy, paste, reverse or delete them all at once.

<figure>
  <img class="for-light" src="/blog/0-8/frame-menu-light.webp" width="1100" height="688" alt="Frames 6 to 9 picked in the timeline, and the frame menu open: new frame, new empty frame, copy 4 frames, paste frames, reverse frames, delete 4 frames." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/frame-menu-dark.webp" width="1100" height="688" alt="Frames 6 to 9 picked in the timeline, and the frame menu open: new frame, new empty frame, copy 4 frames, paste frames, reverse frames, delete 4 frames." loading="lazy" />
</figure>

Reverse helps for a move that comes back. Copy the frames of the slime going up, paste them, reverse them, and it comes down.

**New empty frame** (<kbd>Alt</kbd>+<kbd>B</kbd>) keeps the scenery and empties what moves, to draw the next pose from scratch.

## Onion skin

With onion skin on, the frames before the one you're drawing show in red, and the ones after in blue, faded under it. The ghost button in the timeline turns it on and off.

<figure class="wide">
  <img class="for-light" src="/blog/0-8/onion-light.webp" width="1440" height="900" alt="The slime on frame 6, with the next frames faded in blue above it and the frames before in red below, and the timeline under the canvas with the onion skin button on, three frames before and three after, at 70%." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/onion-dark.webp" width="1440" height="900" alt="The slime on frame 6, with the next frames faded in blue above it and the frames before in red below, and the timeline under the canvas with the onion skin button on, three frames before and three after, at 70%." loading="lazy" />
  <figcaption>Where the slime was, in red, and where it's going, in blue.</figcaption>
</figure>

You can show up to five frames on each side. A sky or a ground painted on its own layer stays under it all.

## A GIF

In the Export dialog, pick **GIF**.

<figure>
  <img class="for-light" src="/blog/0-8/export-gif-light.webp" width="1100" height="688" alt="The Export dialog on the slime, with GIF picked as the format, at 8×." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/export-gif-dark.webp" width="1100" height="688" alt="The Export dialog on the slime, with GIF picked as the format, at 8×." loading="lazy" />
</figure>

You get every frame with its duration, looping, with the exact colors of your drawing. It can be transparent or on the background, at the pixel size you pick.

With **All boards** ticked, you get one GIF per board, in a .zip.

## For a game engine

Game engines usually want the frames apart. There are two ways to get them.

A **PNG sequence** gives you one PNG per frame, named in order, in a .zip. With All boards, each board gets its own folder.

<figure>
  <img class="for-light" src="/blog/0-8/export-sequence-light.webp" width="1100" height="688" alt="The Export dialog on the slime, with PNG sequence picked as the format." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/export-sequence-dark.webp" width="1100" height="688" alt="The Export dialog on the slime, with PNG sequence picked as the format." loading="lazy" />
</figure>

A **sprite sheet** puts every frame on one picture, with a JSON next to it that says where each frame is and how long it lasts. It's the TexturePacker format, which a lot of engines and their plugins read. Columns sets how many frames go on a row.

<figure>
  <img class="for-light" src="/blog/0-8/export-frames-light.webp" width="1100" height="688" alt="The Export dialog with Frames and sprite sheet picked, and the preview showing the slime's 14 frames on a grid of five columns." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/export-frames-dark.webp" width="1100" height="688" alt="The Export dialog with Frames and sprite sheet picked, and the preview showing the slime's 14 frames on a grid of five columns." loading="lazy" />
  <figcaption>The slime's 14 frames, five to a row.</figcaption>
</figure>

## To keep going in Aseprite

If you also use Aseprite, the **Aseprite** export now writes every frame, with its duration.

<figure>
  <img class="for-light" src="/blog/0-8/export-aseprite-light.webp" width="1100" height="688" alt="The Export dialog on the slime, with Aseprite picked as the format." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/export-aseprite-dark.webp" width="1100" height="688" alt="The Export dialog on the slime, with Aseprite picked as the format." loading="lazy" />
</figure>

When a layer doesn't change from one frame to the next, like the sky behind the slime, it becomes a linked cel there, which keeps the file small.

The [animation docs](/docs/animation/animation/) go through all of this in more detail.

## A light to shade by

Each board can have a light now, to shade by, in the new **Light** section on the right.

<figure class="wide">
  <img class="for-light" src="/blog/0-8/light-light.webp" width="1200" height="750" alt="The hobbit house drawing with faint diagonal lines over it and a small sun in its top left corner, and the Light section on the right: a pixel sphere lit from the top left, an angle of 135° and a height of 40°." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/light-dark.webp" width="1200" height="750" alt="The hobbit house drawing with faint diagonal lines over it and a small sun in its top left corner, and the Light section on the right: a pixel sphere lit from the top left, an angle of 135° and a height of 40°." loading="lazy" />
  <figcaption>The light comes from the top left. The lines on the canvas show its direction.</figcaption>
</figure>

You drag the lamp around the little sphere, or type its angle and height. The sphere shows which side is lit and where the shadow falls. Faint lines and a small sun on the canvas show where the light comes from, and the sun can be dragged too.

**Add a shadow that follows it** puts a drop shadow on the layer. It falls away from the light, and gets longer when the light is low. Move the light, and the shadow moves with it. It's all in the [shading docs](/docs/colors/shade-and-lighten/#the-light).

## Remap takes the background too

Remap swaps your drawing's colors for the ones of another palette. Until now it left the board's background alone, so a night scene could end up on a background from the old palette.

<figure>
  <img class="for-light" src="/blog/0-8/remap-light.webp" width="1100" height="688" alt="The Remap tab of the Adjustments panel, with Also remap the background ticked." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/remap-dark.webp" width="1100" height="688" alt="The Remap tab of the Adjustments panel, with Also remap the background ticked." loading="lazy" />
</figure>

Now the background goes to the new palette too, in the same undo. If you want to keep it as it is, untick **Also remap the background**.

## Italian and Japanese

Baipix speaks Italian and Japanese now, six languages in all. It opens in your browser's language when it knows it, and you can change it in View › Language.

<figure class="wide">
  <img class="for-light" src="/blog/0-8/japanese-light.webp" width="1440" height="900" alt="The editor in Japanese, with the ramen shop drawing open." loading="lazy" />
  <img class="for-dark" src="/blog/0-8/japanese-dark.webp" width="1440" height="900" alt="The editor in Japanese, with the ramen shop drawing open." loading="lazy" />
</figure>

## A few smaller things

**Copy goes into Figma as shapes.** When you copy a selection or some layers, Baipix also puts them on the clipboard as SVG. Paste them in Figma and you get shapes you can edit, one per color. Other apps still get the picture.

**Shift and the arrows.** In any number field, the size, the opacity, the tile size, <kbd>Shift</kbd> with the up and down arrows changes the value by 10, like in Figma.

**Export always asks.** File › Export, <kbd>Ctrl</kbd>+<kbd>E</kbd> and <kbd>Ctrl</kbd>+<kbd>S</kbd> open the Export dialog now, like the Export button. Before, they exported straight away in the last format you'd used.

The rest is in the [changelog](https://github.com/baipix/baipix/blob/main/CHANGELOG.md).

## Thanks

Several people worked on this release. Thank you.

- [@mykola-lp](https://github.com/mykola-lp) made the GIF export and the frames sprite sheet, and wrote tests that run the editor in a real browser.
- [@mrCabez](https://github.com/mrCabez) translated Baipix into Italian.
- [@rogervokma-stack](https://github.com/rogervokma-stack) translated it into Japanese, and checked it as a native speaker.
- [@jalal-sadat](https://github.com/jalal-sadat) fixed some React warnings, his first contribution.

## Try it

There's nothing to install or update. Open [the editor](/app/), your drawings are where you left them. Click the film next to Export and make something move.

If something doesn't work, or you'd like it to work differently, [tell me on GitHub](https://github.com/baipix/baipix/discussions).
