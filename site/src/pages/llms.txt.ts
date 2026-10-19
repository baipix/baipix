import type { APIRoute } from 'astro';
import pkg from '../../../package.json';
import { APP_URL, REPO_URL } from '../links';

/**
 * A short summary of Baipix for AI assistants and the search tools behind them (llmstxt.org):
 * what it is, what it does, and where to read more. Plain Markdown, kept to facts.
 */
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const url = (path: string) => new URL(`${base}${path}`, site).href;
  const text = `# Baipix

> Baipix is a free, open source pixel art editor that runs in the browser, with the interface of a modern design tool (layers, components, a command palette). No account and no install: drawings are saved in the browser. It exports clean SVG that pastes straight into Figma or Illustrator, PNG, Aseprite files, tilesets and code. Current version: ${pkg.version}. License: MIT.

Baipix is made for pixel artists, game developers and designers who want pixel art in their projects.

## What it does

- Drawing: a pixel-perfect pencil with a stabilizer, eraser, lasso fill, spray, paint bucket, gradients in palette colors with dithering (checkerboard, Bayer and more), shapes (line, rectangle, ellipse, triangle, star, heart), selections (rectangle, lasso, magic wand).
- Colors: each file keeps its own palette (presets like PICO-8, Game Boy, Sweetie 16, Endesga 32, or the drawing's own colors), shade and lighten along palette ramps, remap a drawing to another palette, .hex and .gpl palette files, any Lospec palette.
- Rework without new colors: liquify, jumble, blur that stays within the palette.
- Isometric: a 2:1 isometric grid, and boxes, cylinders, pyramids, stairs and ramps drawn in one drag, already shaded, with bevels and a color per face.
- Layers like a design tool: groups, blend modes, effects (outline, shadow, glow), components and instances, several boards (artboards) in one file.
- Symmetry, rulers and guides, seamless tile preview, a reference image to trace over.
- Export: PNG from 1× to 32×, SVG (one path per color, layers kept), copy as SVG for Figma, Aseprite (.aseprite), tilesets for Godot and Tiled, every board at once, and code: a React component, CSS, JSON or ASCII.
- Privacy: drawings never leave the browser. Page views are counted without cookies.

## Links

- [Open the editor](${new URL(APP_URL, site).href}): free, in the browser.
- [Home page](${url('')}): features, screenshots and a gallery of drawings made with Baipix.
- [Draw](${url('draw/')}): every tool explained, with the key that picks it.
- [Pixel art to SVG](${url('pixel-art-to-svg/')}): how Baipix turns pixel art into clean vector, with a measured example.
- [Source code on GitHub](${REPO_URL}): README, how to run it locally, how to contribute.
- [Changelog](${REPO_URL}/blob/main/CHANGELOG.md): what each version brought.
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
