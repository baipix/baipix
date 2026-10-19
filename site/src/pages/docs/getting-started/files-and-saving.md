---
layout: ../../../layouts/DocsLayout.astro
title: Files and saving
description: "Where Baipix keeps your pixel art (in your browser, saved as you draw), how undo survives a reload, and how to keep a copy as a .baipix file."
---

## Saved as you draw

There's no Save button. Every change is saved a moment later, in your browser's storage on your device. Close the tab, come back tomorrow: your files are on the files screen, and the last one opens where you left it.

Nothing is uploaded. Your drawings never leave your device, and there's no account to make.

## Undo after a reload

Each board keeps its last 50 steps of undo and redo along with the drawing. Reload the page, and <kbd>Ctrl</kbd>+<kbd>Z</kbd> still goes back.

## Keep a copy

Your browser's storage is safe from one day to the next, but it isn't a backup: it goes away if you clear the site's data, and a private window forgets everything once it's closed. To keep a drawing for good, or to move it to another computer:

- **File › Download as .baipix** saves the whole file: its boards, layers, groups, components and palette.
- **File › Open a .baipix file…** opens it again, anywhere.

To use the drawing elsewhere, export it instead: see Export, or the code button next to it.

## Manage your files

On the files screen, or in the File menu:

- **Rename file** (<kbd>F2</kbd>), **Duplicate file**, **Delete file**. A deleted file comes back with Undo in the message that follows.
- **File › Recent** switches between your last files.
- A new file you never drew in goes away when you open another one, so tries don't pile up.

## Page views

baipix.app counts page views without cookies, with Cloudflare Web Analytics. Nothing about your drawings or what you do in the editor is sent. To not be counted at all, open any page once with `?notrack` at the end of its address, for example `baipix.app/?notrack`. Open one with `?track` to be counted again.

## Run it on your own computer

Baipix is open source. Clone [the repository](https://github.com/baipix/baipix) and run `npm install`, then `npm run dev`: you get the same editor, and a local copy sends nothing at all.
