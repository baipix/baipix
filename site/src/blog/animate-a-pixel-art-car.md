---
title: Animate a pixel art car in 16 frames
description: 'A pixel art animation, step by step, in Baipix, free in your browser: a layer for each part, turning wheels, a bouncing body, smoke, a jump, and a GIF.'
date: '2026-11-26'
category: tutorial
author: Todo-bai
cover: /blog/animate-a-car/ecto-1.gif
draft: false
---

This is the Ecto-1 from Ghostbusters, driving. It's 16 frames of 70 ms, about a second, and it loops. [Open it in Baipix](/app/?open=/blog/animate-a-car/ecto-1.baipix) to look at every frame.

Below is how it's made, step by step, from the still drawing to the GIF. You can follow along with the same car: [open the still drawing](/app/?open=/blog/animate-a-car/ecto-1-still.baipix). Or use your own car, the method is the same. On a Mac, <kbd>Ctrl</kbd> is <kbd>Cmd</kbd>.

## The plan

Most of what moves in this animation repeats: the wheels turn, the body goes up and down, the road slides by. All of it comes back to where it started after 4 frames. So we'll make a loop of 4 frames first, copy it to get 16, and then add a jump on frames 9 to 16 to make it a bit funny.

Each part that moves gets its own layer:

| Layer       | What it does                                             |
| ----------- | -------------------------------------------------------- |
| Roof rack   | Follows the body one frame late                          |
| Wheels      | The two front wheels, turning                            |
| Body        | Bounces up and down                                      |
| Far wheels  | The wheels on the other side, turning behind the body    |
| Smoke       | Puffs out of the exhaust                                 |
| Road        | The ground line, and dashes that slide to the left       |
| Speed lines | White lines in the sky that slide faster, at 70% opacity |

A layer only changes its pixels from one frame to the next. So moving a part is just moving its layer by a pixel or two on a frame.

## 1. Make room for the smoke

The car starts close to the left edge, and the smoke needs room behind it. Open **Image › Board size…** ([more on board size](/docs/getting-started/create-and-open/)), type **134** in W, and click the middle square on the right of the position grid. The board grows on the left, and the car stays where it is.

<figure>
  <img class="for-light" src="/blog/animate-a-car/board-size-light.webp" width="1100" height="688" alt="The Board size dialog: W set to 134, H 84, the drawing pinned to the right in the position grid, and the preview showing the new room on the left of the car. Under the fields: 116 × 84 px to 134 × 84 px." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/board-size-dark.webp" width="1100" height="688" alt="The Board size dialog: W set to 134, H 84, the drawing pinned to the right in the position grid, and the preview showing the new room on the left of the car. Under the fields: 116 × 84 px to 134 × 84 px." loading="lazy" />
</figure>

## 2. One layer for each part

Right now the whole car is on one layer. We'll cut it into pieces.

Take the **Rectangle select** (<kbd>M</kbd>) and drag a box around the roof rack, from the tip of the antenna down to just above the roof line.

<figure class="wide">
  <img class="for-light" src="/blog/animate-a-car/select-rack-light.webp" width="1440" height="900" alt="The still Ecto-1 zoomed in, a dashed selection of 47 × 15 pixels around the roof rack: the siren, the boxes and the lights, stopping just above the roof." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/select-rack-dark.webp" width="1440" height="900" alt="The still Ecto-1 zoomed in, a dashed selection of 47 × 15 pixels around the roof rack: the siren, the boxes and the lights, stopping just above the roof." loading="lazy" />
</figure>

Press <kbd>Ctrl</kbd>+<kbd>X</kbd>, then <kbd>Ctrl</kbd>+<kbd>V</kbd>. The rack lands on a new layer, exactly where it was ([Selections](/docs/drawing/selections/) has the other ways to pick pixels). Right-click the layer and rename it **Roof rack**.

Do the same for the ground line under the car: select it, cut, paste, and name the layer **Road**. Then rename the layer that's left **Body**.

Add four empty layers with <kbd>Shift</kbd>+<kbd>N</kbd>: **Wheels**, **Far wheels**, **Smoke** and **Speed lines**. Set Speed lines to 70% opacity, so they stay in the background. The wheels get drawn on theirs in the next step.

Drag the layers into this order, top to bottom ([Layers](/docs/layers/layers-and-groups/) has the rest of what they do):

<figure>
  <img class="for-light" src="/blog/animate-a-car/layers-light.webp" width="1100" height="688" alt="The Layers panel with seven layers, top to bottom: Roof rack, Wheels, Body, Far wheels, Smoke, Road, and Speed lines at 70%." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/layers-dark.webp" width="1100" height="688" alt="The Layers panel with seven layers, top to bottom: Roof rack, Wheels, Body, Far wheels, Smoke, Road, and Speed lines at 70%." loading="lazy" />
</figure>

The order matters. The front wheels sit above the body, so the body never hides them. The far wheels sit under it, so you only see their bottom, as in the drawing.

## 3. Redraw the wheels whole

In the still drawing, the dark outline around each tire belongs to the body. As soon as the body moves up, it takes that outline with it, and the wheels look cut in half.

So erase the wheels from the Body layer, and draw them again, whole, on the **Wheels** layer:

- a round shape about 11 pixels wide, with a dark outline all around;
- the tire inside, 2 to 3 pixels thick;
- a light hubcap in the middle, about 5 pixels wide;
- two lighter marks on the tire, opposite each other, and two darker dots on the hubcap. These are what will show the wheel turning.

Where the wheels were, paint the body dark: that's the inside of the wheel arch. When the body goes up, you'll see that dark gap above the wheel instead of the background.

<figure class="wide">
  <img class="for-light" src="/blog/animate-a-car/wheel-light.webp" width="1440" height="900" alt="A front wheel up close, on the Wheels layer: a round dark outline, a dark green tire, a white hubcap with two grey dots, and two slate marks on the tire, left and right. Behind it, the dark wheel arch on the Body layer." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/wheel-dark.webp" width="1440" height="900" alt="A front wheel up close, on the Wheels layer: a round dark outline, a dark green tire, a white hubcap with two grey dots, and two slate marks on the tire, left and right. Behind it, the dark wheel arch on the Body layer." loading="lazy" />
</figure>

Do the same for the wheels on the other side, on **Far wheels**, a little higher and to the right, with a darker hubcap since they're in the shade.

If you'd rather skip ahead, here's [the car cut into its seven layers](/app/?open=/blog/animate-a-car/ecto-1-layers.baipix).

## 4. Open the timeline and make 4 frames

Press <kbd>Shift</kbd>+<kbd>A</kbd>, or the film button next to Export. The [timeline](/docs/animation/animation/#the-timeline) opens under the canvas, with a row for each layer.

Press <kbd>Alt</kbd>+<kbd>N</kbd> three times. You now have 4 frames, all copies of the first one. Click a frame's number to show it, or a dot to show that frame and draw on that layer.

<figure class="wide">
  <img class="for-light" src="/blog/animate-a-car/loop-light.webp" width="1440" height="900" alt="The editor with the timeline open under the canvas: 4 frames, frame 2 shown in violet, and a row for each of the seven layers, Wheels picked." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/loop-dark.webp" width="1440" height="900" alt="The editor with the timeline open under the canvas: 4 frames, frame 2 shown in violet, and a row for each of the seven layers, Wheels picked." loading="lazy" />
</figure>

## 5. Turn the wheels

On each frame, the wheels turn by an eighth of a turn, clockwise since the car drives to the right. So move the two marks on the tire by an eighth of the circle, and the two dots on the hubcap too.

<figure>
  <img src="/blog/animate-a-car/wheel-turn.png" width="1032" height="224" alt="A front wheel on frames 1 to 4, side by side. The two marks on the tire and the two dots on the hubcap move an eighth of a turn clockwise from one frame to the next." loading="lazy" />
  <figcaption>Frames 1 to 4. The body moves too, we'll get to it.</figcaption>
</figure>

After 4 eighths, a wheel has made half a turn. Since the marks come in pairs, opposite each other, half a turn looks exactly like frame 1. That's why the loop can be 4 frames long.

Do it for both front wheels, and for the far wheels.

## 6. Bounce the body

Press <kbd>V</kbd> for the [Move tool](/docs/layers/move-resize-rotate/#the-move-tool). In the Layers panel, click **Body**, then <kbd>Ctrl</kbd>-click **Roof rack** to pick both (<kbd>Shift</kbd>-click would take Wheels too, it's in between). The arrow keys now move them by 1 pixel, on the frame shown only.

<figure class="wide">
  <img class="for-light" src="/blog/animate-a-car/move-light.webp" width="1440" height="900" alt="Frame 2 of 4 with the Move tool: Body and Roof rack picked in the Layers panel, and a frame of 99 × 35 pixels around both on the canvas." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/move-dark.webp" width="1440" height="900" alt="Frame 2 of 4 with the Move tool: Body and Roof rack picked in the Layers panel, and a frame of 99 × 35 pixels around both on the canvas." loading="lazy" />
</figure>

- Frame 2: press <kbd>↑</kbd> once.
- Frame 3: press <kbd>↑</kbd> once.
- Frame 4: leave it.

The body is up on frames 2 and 3, and down on 1 and 4. One pixel is enough, more would look like a jump.

Now the roof rack. It's loaded with stuff, so it lags behind the body by one frame. Pick only **Roof rack**:

- Frame 2: press <kbd>↓</kbd> once. The body went up, the rack hasn't followed yet.
- Frame 4: press <kbd>↑</kbd> once. The body came back down, the rack is still up.

| Frame     | 1    | 2    | 3    | 4    |
| --------- | ---- | ---- | ---- | ---- |
| Body      | rest | up 1 | up 1 | rest |
| Roof rack | rest | rest | up 1 | up 1 |

It's only one frame late, and the car looks heavier and a bit wobbly for it. The same trick works for an antenna, hair or a cape.

## 7. Slide the road and the sky

The car doesn't actually move. The ground slides to the left under it.

On the **Road** layer, draw grey dashes under the ground line: 5 pixels long, one every 16 pixels, across the whole width. A second row a bit lower, 3 pixels long, also every 16 pixels, makes it look like a road.

Then, on each frame, move the Road layer 4 pixels further to the left than the frame before, with the arrow keys: <kbd>←</kbd> 4 times on frame 2, 8 times on frame 3, 12 on frame 4. A gap opens at the right edge as the dashes slide: draw the bits of dashes coming in, every 16 pixels as before.

4 pixels a frame for 4 frames makes 16, one dash. So frame 5 would look like frame 1, and the loop holds.

The **Speed lines** layer works the same way: a few white lines in the sky, 5 to 10 pixels long, one every 32 pixels, moving 8 pixels a frame. They go faster than the road, so they read as wind.

## 8. Flash the siren

On the **Body** and **Roof rack** layers, the lights take turns, two frames each:

- frames 1 and 2: the orange lights turn yellow, the blue ones stay blue;
- frames 3 and 4: the orange lights stay orange, the blue ones turn light cyan.

The **Pencil** (<kbd>B</kbd>) is enough, it's a handful of pixels.

If you have the patience, the windows can do something similar: the light diagonal stripes on the glass move 4 pixels to the left on each frame, like reflections of the street going by. Skip it if you want, the animation works without it.

## 9. Smoke

A puff of smoke lives for 8 frames. It comes out of the exhaust small and white, grows, drifts about 3 pixels left and 1 pixel up on each frame, turns grey, and shrinks before it's gone.

<figure>
  <img src="/blog/animate-a-car/puff.png" width="1552" height="180" alt="One puff of smoke over its 8 frames: a tiny white diamond, then a bigger white blob with a dark outline and a grey underside, growing up to frame 6 where it turns grey, then shrinking." loading="lazy" />
  <figcaption>One puff, frame by frame. Grey from frame 6.</figcaption>
</figure>

A new puff starts every 4 frames, so on any frame there are two: a young one near the exhaust, and an older one further left. In our loop of 4 frames:

| Frame | Young puff    | Old puff      |
| ----- | ------------- | ------------- |
| 1     | its 1st frame | its 5th frame |
| 2     | its 2nd frame | its 6th frame |
| 3     | its 3rd frame | its 7th frame |
| 4     | its 4th frame | its 8th frame |

Turn on the [onion skin](/docs/animation/animation/#onion-skin), the ghost button in the timeline, with Before and After at 1. The frame before shows in red and the one after in blue, so you can see where each puff comes from and where it's going.

<figure class="wide">
  <img class="for-light" src="/blog/animate-a-car/smoke-light.webp" width="1440" height="900" alt="Frame 3 of 4 on the Smoke layer, zoomed on the back of the car: two puffs, and the same puffs faded in red on the frame before and in blue on the frame after. The onion skin button is on, Before 1 and After 1." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/smoke-dark.webp" width="1440" height="900" alt="Frame 3 of 4 on the Smoke layer, zoomed on the back of the car: two puffs, and the same puffs faded in red on the frame before and in blue on the frame after. The onion skin button is on, Before 1 and After 1." loading="lazy" />
</figure>

Press <kbd>Enter</kbd> to play. The car should already drive. Here's [the 4-frame loop](/app/?open=/blog/animate-a-car/ecto-1-loop.baipix) if you want to compare.

## 10. Copy it to 16 frames

Click frame 1's number, then <kbd>Shift</kbd>-click frame 4: the four are picked ([several frames at once](/docs/animation/animation/#several-frames-at-once)). Right-click one of them and choose **Copy 4 frames**.

<figure>
  <img class="for-light" src="/blog/animate-a-car/copy-frames-light.webp" width="1100" height="688" alt="Frames 1 to 4 picked in the timeline, and the frame menu open: New frame, New empty frame, Copy 4 frames, Paste frames, Reverse frames, Delete 4 frames." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/copy-frames-dark.webp" width="1100" height="688" alt="Frames 1 to 4 picked in the timeline, and the frame menu open: New frame, New empty frame, Copy 4 frames, Paste frames, Reverse frames, Delete 4 frames." loading="lazy" />
</figure>

Now click frame 4, right-click it and choose **Paste frames**: the copies go after it, as frames 5 to 8. Do it again from frame 8, then from frame 12. You have 16 frames, the loop four times over.

<figure>
  <img class="for-light" src="/blog/animate-a-car/sixteen-light.webp" width="1100" height="688" alt="The timeline with 16 frames and the seven layers as rows, every cell drawn." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/sixteen-dark.webp" width="1100" height="688" alt="The timeline with 16 frames and the seven layers as rows, every cell drawn." loading="lazy" />
</figure>

## 11. The jump

The second half is where it gets funny. On frame 9 the car squashes down, backfires, and jumps. It lands on frame 14, squashes again, and drives on.

Pick the layers in the left column (<kbd>Ctrl</kbd>-click to add Far wheels to Wheels), and press the arrows on each frame:

| Frame                 | 9   | 10  | 11  | 12  | 13  | 14  | 15  | 16  |
| --------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wheels and Far wheels |     | ↑ 2 | ↑ 4 | ↑ 4 | ↑ 2 |     |     |     |
| Body                  | ↓ 1 | ↑ 2 | ↑ 5 | ↑ 6 | ↑ 4 | ↓ 1 | ↓ 2 |     |
| Roof rack             |     | ↑ 2 | ↑ 4 | ↑ 5 | ↑ 5 | ↑ 1 | ↓ 1 | ↓ 2 |

These are the presses from where each layer already is after the paste, not from the rest position. The body goes up faster than the wheels, so the springs stretch in the air, and the rack still lags a pixel behind.

<figure class="wide">
  <img class="for-light" src="/blog/animate-a-car/jump-light.webp" width="1440" height="900" alt="Frame 11 of 16, the car at the top of its jump, the wheels off the ground and the body high above them. The onion skin shows two frames before in red and two after in blue." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/jump-dark.webp" width="1440" height="900" alt="Frame 11 of 16, the car at the top of its jump, the wheels off the ground and the body high above them. The onion skin shows two frames before in red and two after in blue." loading="lazy" />
  <figcaption>Frame 11, the top of the jump, with the onion skin on two frames each side.</figcaption>
</figure>

A few details finish it:

- **Squash.** On frames 9 and 15 the body sits a pixel lower than usual, and the top of the front wheels pokes over the arch. Erase that row of the wheels on those two frames.
- **Shadow.** On the Road layer, when the wheels are in the air, draw a short dark line on the ground under each one: 6 pixels on frames 10 and 13, 4 pixels on 11 and 12, when the car is higher.
- **Antenna.** On the Roof rack layer, bend the tip of the antenna a pixel back when the car goes up, and a pixel forward when it lands.

## 12. The backfire

On the Smoke layer, frame 9: a flash at the exhaust, white in the middle, then yellow, then orange, pointing back, with a few orange sparks around. On frame 10, the same flash, smaller. On frame 11 it's gone.

The puff that starts on frame 9 is bigger than the others, by about a third, and drifts a little higher.

<figure class="wide">
  <img class="for-light" src="/blog/animate-a-car/backfire-light.webp" width="1440" height="900" alt="Frame 9 on the Smoke layer: the back of the car squashed down, a yellow and orange flash at the exhaust with a white center, and a few orange sparks below it." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/backfire-dark.webp" width="1440" height="900" alt="Frame 9 on the Smoke layer: the back of the car squashed down, a yellow and orange flash at the exhaust with a white center, and a few orange sparks below it." loading="lazy" />
</figure>

## 13. Timing

Click frame 1, <kbd>Shift</kbd>-click frame 16, and type **70** in **Duration**. All 16 frames last 70 ms, so the loop takes a bit more than a second.

<figure>
  <img class="for-light" src="/blog/animate-a-car/durations-light.webp" width="1100" height="688" alt="The 16 frames picked in the timeline, light violet, and the Duration field above them set to 70 ms." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/durations-dark.webp" width="1100" height="688" alt="The 16 frames picked in the timeline, light violet, and the Duration field above them set to 70 ms." loading="lazy" />
</figure>

Press <kbd>Enter</kbd> to play it, and <kbd>,</kbd> and <kbd>.</kbd> to go through it one frame at a time. If something jumps where it shouldn't, it's usually a layer moved one pixel too many on a frame.

## 14. Export a GIF

Open [Export](/docs/export/export/) (<kbd>Ctrl</kbd>+<kbd>E</kbd>), pick **GIF** and a pixel size. At 5×, the car makes a GIF of 670 × 420 that loops forever, every frame with its 70 ms.

<figure>
  <img class="for-light" src="/blog/animate-a-car/export-gif-light.webp" width="1100" height="688" alt="The Export dialog on the Ecto-1, with GIF picked as the format." loading="lazy" />
  <img class="for-dark" src="/blog/animate-a-car/export-gif-dark.webp" width="1100" height="688" alt="The Export dialog on the Ecto-1, with GIF picked as the format." loading="lazy" />
</figure>

That's it. [Open the finished car](/app/?open=/blog/animate-a-car/ecto-1.baipix) to compare with yours. The [Animation docs](/docs/animation/animation/) have every detail of the timeline, the [keyboard shortcuts](/docs/reference/shortcuts/) are all on one page, and there's more on [pixel art animation in Baipix](/pixel-art-animation/).
