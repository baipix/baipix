# Architecture

## Principles

1. **Engine / UI split.** `src/engine` is plain TypeScript with no DOM access. It can run in Node (that's how it is tested) and could later run in a Web Worker or on a server for collaboration.
2. **One entry point.** The UI only uses the `Editor` class. It exposes commands (`addLayer`, `beginStroke`, `undo`…) and emits notifications.
3. **Local-first storage behind an interface.** The app saves through a `StorageAdapter`. IndexedDB is the default; a cloud adapter can be added without touching the editor.

## Data model

- Colors are packed `uint32` values in the same byte order as `ImageData` (`0xAABBGGRR`), so pixel buffers are copied to canvases without conversion.
- A `PixelDoc` holds its layers (bottom to top), background, and render settings (exported pixel size and gap).
- Animation frames (`engine/frames.ts`) share the board's layers: only the pixels change from frame to frame. The shown frame's pixels are each layer's `pixels`, so tools, exports and everything else work on it unchanged; the other frames wait in each layer's `cels`, never changed in place, so undo steps share them. Commands that act on a whole layer (merging, applying effects, resizing the canvas) run on every frame with `eachFrame`.
- Each open file has its own `History` of snapshots. Pixel art documents are small, so full snapshots are simpler and more robust than diffs; the stack is capped by a memory budget.

## Editor notifications

| Subscription | Fired when                                   | Used by                       |
| ------------ | -------------------------------------------- | ----------------------------- |
| `subscribe`  | UI state changed (not on every pointer move) | React, via `useEditorState`   |
| `onPixels`   | Pixels or selection changed, including live  | Canvas renderer, preview      |
| `onPersist`  | Something worth saving changed               | Autosave                      |
| `onNotice`   | A message for the user (layer hidden…)       | Toasts (translated in the UI) |

During a stroke, only `onPixels` fires, so React does not re-render panels on every pointer move. The final state is committed on pointer up.

## Tools

A tool is an object with `onDown`, `onMove` and optional `onUp`, receiving a `Stroke`: the document, a copy of the layer's pixels at the start (`base`), options, colors, palette, symmetry and selection. Tools write into `stroke.layer.pixels`. Shape tools redraw from `base` on every move, which gives a live preview for free.

## Rendering

`ui/components/CanvasView.tsx` owns the canvas. On pixel changes it flattens the document into an offscreen canvas, then `ui/render/drawScene.ts` draws the scene (checkerboard, image, gap, grid, brush footprint, symmetry axes, selection). The `viewport` module handles zoom and pan per document and rounds the on-screen pixel size so every art pixel covers whole device pixels.

## File format

`.baipix` files are JSON (`storage/fileFormat.ts`). Each layer is an indexed palette plus run-length encoded indices: compact, diff-friendly and readable without an image decoder. Frames add each layer's `cels`, encoded the same way, beside the shown frame's pixels, so a version without frames still opens the shown one. The format is versioned; readers must reject newer versions.
