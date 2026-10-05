# Changelog

Notable changes to Baipix, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Numbers in parentheses are pull requests.

## [Unreleased]

### Added

- Rotate 90° counterclockwise (Alt+Shift+R) next to clockwise, and align what's drawn to the canvas: left, center or right, top, middle or bottom. In the Move and Select tools' bar, Layer › Align, and with Figma's shortcuts (Alt+A, H, D, W, V, S). With a selection, only its drawn pixels move. (#PR)
- A Canvas size dialog (Image › Canvas size…, or the crop button next to W and H): drag the frame's handles to make the canvas bigger or smaller, drag the drawing to place it, or type the size and pick where the drawing goes in a 3×3 grid (centered by default). What gets cut off is kept, as with the W and H fields. One undo step. (#222)

## [0.3.1] - 2026-10-05

Small fixes and polish on 0.3: Delete removes the layer clicked in the list, blend modes preview as you hover them, and the website is easier to find.

### Changed

- The blend mode menu previews each mode on the canvas as you hover it (or reach it with the arrow keys), like in Figma; only a click keeps it. Leaving the menu or Escape puts the layer back. (#215)
- Click a layer in the list, then Delete or Backspace removes it (or the selected layers, or the reference image), with Undo in the toast. On the canvas, Delete still clears the selection's pixels. (#214)

### Website

- Better found in search engines: a sitemap and robots.txt, canonical addresses, a share card made for links (1200×630) with Twitter/X tags, structured data describing Baipix as a free web app, and titles that say what it is ("Free online pixel art editor, export to SVG and Figma"). The 404 page stays out of search results. (#216)
- New screenshots of the editor, and the feature cards mention what 0.3 brought: templates and the tour, blend modes, rulers and guides, the outline, the minimap, and recovering the pixels of scaled-up images. (#210)
- The design system shows the select field and the palette picker. (#210)

## [0.3.0] - 2026-10-03

New tools and a cleaner workspace: a menu bar and a command palette, new ways to draw and rework pixels, blend modes, rulers and guides, templates, and a floating preview that doubles as a minimap.

### Added

- A short tour the first time the editor opens: seven bubbles, one at a time, on the drawing tools, the shapes, the color tools, Jumble and Liquify, the palette, the pixel gap and the export. Skip it at any step (or Escape); it doesn't come back, unless you pick Help › Take the tour. (#208)
- Importing pixel art that was scaled up (a screenshot, an export at 800%…) finds its pixel grid, even cropped or with JPEG noise, and offers to bring it back to its real pixels: a preview shows the grid over the image, and the scale and offset can be adjusted before recovering. "Keep as it is" imports it as before. (#207)
- Templates for new files: Icon (16×16, Sweetie 16), Character sprite (32×32, PICO-8, with left-right symmetry), Game tile (32×32, Endesga 32, with tile preview), Avatar (24×24, Pollen8), Portrait (64×64, DawnBringer 32), Sprite sheet (128×128, AAP-64, with the rulers and a guide every 16 px), Game Boy screen (160×144, its 4 greens), Banner (128×32, Resurrect 64) Wallpaper (160×90, SLSO8) and Commodore 64 screen (320×200, its 16 colors). In the New file dialog above the free sizes, and on the home screen at first launch: one click and the canvas is ready, palette included. (#206)
- Rulers and guides (View › Rulers and guides, or in the Display section): rulers in pixels along the whole top and left edges of the workspace, with the drawing's extent shaded; the panels move aside to leave them in view. Drag from a ruler to add a guide on a pixel edge; with the Move tool, drag a guide to move it, or back onto its ruler to remove it. The position shows on the ruler while dragging. Guides are saved with the file and follow the drawing when the canvas is resized; like the reference image, they're not part of the undo history. (#205)
- The preview window doubles as a minimap: when the canvas shows only part of the drawing, a blue frame shows which part, and a click or a drag in the preview (at its fit) moves the canvas there. (#204)
- A right-click menu on the palette's swatches: use it as the secondary color (what right-click did before), replace it with the primary color everywhere in the drawing and in the palette (one undo step, locked layers left alone), copy its hex code, or remove it from the palette. The recent colors keep right-click for the secondary color. (#202)
- Blend modes for layers, in the Layer section next to the opacity: Darken, Multiply, Color burn, Lighten, Screen, Color dodge, Overlay, Soft light, Hard light, Difference and Exclusion, like in design tools. They show on the canvas, in the preview and in exports (blended into the PNG and SVG colors), are kept by Merge down, and saved in .baipix files. The layer's Hide button becomes an eye in the section header. (#201)
- An Outline tab in the Adjustments panel (Layer › Outline…, Shift+O): a 1px line around the drawing, outside it or along its edge inside, with round or square corners, in the primary color (pick another one in the palette while it's open). Live preview, the active layer or all of them, limited to the selection if any, one undo step. (#199)
- A command palette: Ctrl+K (or the magnifier at the top right) and type to find any command of the menus, or a tool, then Enter. Accents and case don't matter, and each command shows its menu and shortcut. (#196)
- A menu bar across the top, like in desktop apps: File, Edit, Image, Layer, Select, View and Help, with each command's shortcut. The file name sits in the middle (rename it in place, ▾ for the files) and the zoom on the right. Once a menu is open, hovering another title opens it, and ←/→ move between them; on narrow windows the menus fold into ☰. New shortcuts: Shift+N new layer, Shift+D duplicate, Shift+M merge down, Alt+↑/↓ move the layer, Shift+H/V flip, Shift+R rotate, Shift+P preview window, F2 rename the file, Tab hide the interface, Ctrl+= / Ctrl+- zoom. (#195)
- Custom brushes: select something and "Make a brush from the selection" in the Pencil's … menu, then paint with it (leaves, bricks, stars…), previewed under the pointer. It paints with its own colors, or as a stencil in the current color. Brushes are saved with the preferences and can be picked or deleted in the same menu; the Lasso fill can use them too. (#192)
- In tile preview, painting wraps around: a stroke that goes past an edge continues on the opposite side, so seamless textures are easy to draw. Works with the Pencil, Eraser, shapes, Spray, Lighten, Shade and Blur. (#191)
- More dithering patterns: besides the checkerboard, dots (1 in 4), dense (3 in 4), horizontal or vertical lines and diagonals, for the Pencil, the Lasso fill (in their … menu) and the Bucket (a list in its options). (#190)
- A Liquify tool (W) that warps the drawing without adding colors: Push drags pixels along with the brush, Expand and Shrink make a part bigger or smaller (and keep going while you hold still). Size and strength options; it redraws from the pixels of the stroke's start, so the drawing stays sharp and passes don't degrade it. Works with symmetry and the selection. (#189)
- A Lasso fill tool (K), next to the Pencil: draw a shape freehand and it closes and fills when you let go. The Pencil's "Fill the shape" option stays for those who prefer it. (#188)
- Resize a layer or a selection by its corner handles with the Move tool, with sharp, nearest-neighbor pixels. Sizes snap to whole multiples (×2, ×3, ×1/2…), shown next to the size; Shift keeps the proportions, Alt resizes from the center, Cmd/Ctrl turns snapping off. One undo step; pixels pushed off the canvas are kept. (#187)
- Lasso fill: with "Fill the shape when the stroke ends" in the Pencil's "…" menu, a stroke closes back to its start when it ends and the shape it draws is filled, with the current color, dithering and symmetry. One undo step. (#186)
- The Pencil's options bar is shorter: dithering, lasso fill and Blend move to a "…" menu (Blend too for the Spray), with a blue dot on it when one of them is on. (#186)
- A Remap tab in the Adjustments panel, to move a drawing to another palette or clean it up: pick a preset or the file's palette, match colors to the nearest one or by lightness (darkest to darkest, which recolors and keeps shadows and highlights), reduce how many colors are used, and optionally replace the file's palette. Live preview, one undo step. (#184)
- A Stabilizer for the Pencil and the Eraser (0 to 10): the stroke follows the pointer on a string that many pixels long, so shaky hands, a mouse or a stylus give smooth lines. It also smooths Lighten, Shade, Blur, Spray and Jumble. Off by default. (#182)
- A Blend option for the Pencil and the Spray: a semi-transparent color mixes with the pixels underneath, like watercolor, instead of replacing them. Going over the same spot again in one stroke doesn't build it up. (#179)
- A round brush tip, next to the size in the tool options: from 3px it paints a round shape instead of a square, for the Pencil, the Eraser, shapes, Lighten, Shade and Blur. (#178)
- A Spray tool (A): it drops random pixels in a circle, like a spray can, and keeps spraying while you hold still. Options for size, density and a random opacity per pixel. Works with symmetry and the selection. (#177)
- A Jumble tool (J): it shuffles the pixels under the brush without adding any color, for texture on foliage, rock or noise, and keeps going while you hold still. Options for size and strength. (#177)
- The opacity of the copies in tile preview can be set, under the Tile preview box: at 100% they look exactly like the drawing, to see the pattern as it will repeat. (#176)
- With the Move tool, the active layer is framed like a selected object: a blue frame around its pixels with white corner handles and its size in pixels under it, following the layer while it moves. (#156)
- With the Move tool, a click beside every layer drops the active layer's frame, like clicking an empty spot in a design tool, instead of moving the active layer. A hole inside the frame still moves it, and so does Cmd/Ctrl. (#159)
- A reference image to trace over. It shows at the bottom of the Layers panel and works like a layer: select it, hide it, lock it, set its opacity, drag it with the Move tool (which takes it where no layer has a pixel) and resize it by the corners. It always stays under the layers and is never exported. Add one with the image button of the Layers panel, from the new file dialog, or with "Use as reference" after pasting or dropping an image. It's saved with the drawing in the browser, not in .baipix files. (#151)
- On phones, the colors stay in view in a strip above the toolbar: tap a swatch for the primary color, long press for the secondary one, tap a chip to open the color picker. (#146)
- A home screen: a welcome on first launch, Create and Import buttons, and your drawings as thumbnails with their last modified date, newest first. Open it from the main menu. The last file can now be deleted too, which brings back the empty home screen. (#143)

### Changed

- A new file left untouched (nothing drawn, renamed or changed) goes away when you move to another file or create one, isn't listed on the home screen, and isn't saved. (#206)
- The palette picker shows each palette's colors and how many there are, instead of a list of names. (#203)
- The editor starts in English, even when the browser is in French. French is one click away in View › Language, and the choice is remembered. (#198)
- The left panel is lighter: the Files list is gone (the home screen lists the drawings), and a button next to the file name opens the recent files, this file's actions, a new file and all files. The panel is as tall as its layers, up to the window, and the main menu (the logo) no longer repeats the file commands, which are all in the files menu. On phones, the file name in the top bar opens it. (#193)
- The preview is now a small floating window over the canvas: drag it by its title, resize it by its corner, fold or close it (the main menu brings it back). It has its own zoom, from fit to 1000%: pick it in its menu or use the mouse wheel (or pinch) over it, toward the pointer; drag to pan when zoomed, double-click to fit again. Its place, size and zoom are remembered. (#193)
- Layer and file thumbnails follow the drawing's proportions (up to 2:1 either way), so a wide drawing shows as a wide thumbnail instead of a thin strip in a square. (#185)
- "Adjust colors" becomes the Adjustments panel, ready for more kinds of adjustments. Besides the main menu and Ctrl+U, it opens from a button in the Layer section and from the layer right-click menu, starting on the active layer. (#183)
- With "Adjust the palette too" checked, the palette now previews the adjustment live, and undoing the adjustment puts back the palette along with the pixels, so they stay in step. (#183)
- The opacity of the colors can be scrubbed like the canvas fields: drag its ◐ label left or right. For the background, one drag is one undo step. (#181)
- The Primary and Secondary labels next to the colors are gone, to give the fields more room: hovering the swatch says which is which, and which click paints with it. (#181)
- The brush outline under the pointer is dark with a white edge, so it shows on black pixels too. (#177)
- Moving a layer off the canvas keeps its pixels: move it back, or make the canvas bigger, and they come back. Making the canvas smaller keeps what it cuts off too. The part outside is saved with the drawing in the browser, not in .baipix files, and is never exported. (#154)
- The Move tool takes the layer under the pointer: drag any pixel to move its layer, with its outline shown on hover. Cmd/Ctrl keeps the active layer. The tool has a pixel arrow as icon and cursor. (#148)
- The pixel grid stays visible on any drawing: its lines are dark on light pixels and light on dark ones, instead of following the app theme. (#145)
- The eyedropper cursor is the pixel pipette of the toolbar, with a white edge so it shows on any color. (#144)
- A new pixel look for the editor: pixel art icons, side panels floating over the canvas, notched corners and hard shadows, key-style buttons like on the website, pixel checkboxes, and a sky blue for hovers and the main button. The dark theme is now neutral gray. (#131)

### Fixed

- The Eraser erased nothing when the Blend option was on (it's shared with the Pencil and the Spray). (#200)
- A key with no name could switch to the rounded rectangle, because tools without a shortcut matched it. (#176)
- In the light theme, muted text, menu shortcuts and the blue focus lines now meet the contrast minimum (4.5:1 for text, 3:1 for lines). (#175)
- Long file and layer names no longer make the left panel scroll sideways: they're cut with an ellipsis, with the full name on hover. Names and sizes now use the whole row, and the action icons show over the end of it on hover. (#153)
- On iPhone, editing a file name or any field no longer zooms the whole interface. (#149)

### Website

- New screenshots of the editor on the home page, with the menu bar and the floating preview, and feature cards for what's new: the command palette, Remap, the Lasso fill, Spray and custom brushes, Liquify and Jumble, seamless tiles, the reference image. (#197)
- The design system shows the tabs. (#184)
- The design system shows the color row (swatch, hex and opacity). (#181)
- The design system shows the segmented icon buttons (like the brush tip choice). (#179)
- A design system page at /app/design.html: the logo with SVG and PNG downloads, every color token in light and dark, type, shapes, icons, the components in their states, and a live contrast check. DESIGN.md sums up the rules for contributors. (#175)
- The screenshot on the home page and in the README shows the new pixel look, in a pixel frame with notched corners and a solid side like the buttons. (#132)

- Page view counts with Cloudflare Web Analytics, without cookies, on the site and the editor. Drawings and what you do in the editor are never sent. (#130)
- A new screenshot of the editor on the home page, in light or dark to match the site theme. (#128)
- Nine features on the home page instead of six, and three new gallery pieces: a starfighter sprite, Mount Fuji at dawn and an isometric ramen shop. (#126)

## [0.2.0] - 2026-09-28

Everyday comfort: small things that make daily use smoother.

### Added

- The drawing's size, number of layers and number of colors next to the cursor coordinates. (#125)
- A hand tool (H) in the toolbar to move around the canvas, also with one finger on touch screens. (#118)
- Select several layers at once with Shift+click and Cmd/Ctrl+click, then drag, delete or merge them together. Flatten image in the layer menu. (#115)
- Drag the symmetry axes anywhere on the canvas, snapped to half pixels. Double-click a grip to recenter. (#116)
- Open and export palette files in .hex (Lospec) and .gpl (GIMP, Aseprite, Krita), or drop one on the canvas. 14 more preset palettes, and Manage palettes to choose which ones show in the menu. (#112)
- A live preview of the exported image in the Export tab, with its final size, 1× to 32× buttons, the file name, and an option to leave the background out. (#109)
- Design and Export tabs in the right panel. (#108)
- Reorder the palette by dragging its swatches. (#107)
- A loupe for the eyedropper, with the hex code of the picked color. (#106)
- Lighten and shade can stay in the color's ramp (the new default), use the whole palette, or change the lightness freely, with an optional hue shift. (#104)
- Tool options in a bar right above the toolbar. (#56)
- Recent colors under the primary and secondary colors. (#51)
- A right-click menu on layers, and Merge visible layers. (#52)
- Lock a layer, and Alt+click its eye to show only that one. (#50)
- Collapsible sections in the panels. (#49)
- Undo in the toast after deleting a layer or a file, instead of a confirmation. (#42)
- Animated marching ants around the selection. (#41)
- Double-click the zoom level to fit the drawing to the screen. (#40)
- A visible button for the keyboard shortcuts. (#37)
- The version number in the main menu, with a link to this changelog.

### Changed

- The pixel gap is set in the Canvas section and always shown on the canvas. (#114)
- The dark theme has a slight ink tint, and the symmetry axes are pink. (#58)
- The palette menu shows either Add or Remove the primary color, and its items are grouped more clearly. (#112)
- Toasts are light in the dark theme, so they stand out from the canvas. (#123)

### Website

- The website and the editor move to [baipix.app](https://baipix.app). The old address redirects there.
- A pixel art 404 page. (#111)
- Light and dark mode, with a toggle. (#46)
- Pixel style buttons. (#48)
- The features mention the familiar interface and the movable symmetry axes. (#54, #116)

### Thanks

- [@QvarcY](https://github.com/QvarcY) for the first community contributions: the shortcuts button, fitting the drawing from the zoom level, and the marching ants. (#37, #40, #41)

## [0.1.0]

The first public version.

- A pixel art editor in the browser: pencil with pixel-perfect mode, eraser, paint bucket, selection and move, eyedropper, lines and shapes, palette-aware shade, lighten and blur.
- Layers, several files, symmetry, tile preview, checkerboard dithering, rotation and flips.
- Preset palettes, Lospec palettes by pasting, palettes built from the drawing, hue-shifted ramps.
- Exports to PNG, clean SVG (one path per color), copy as SVG or PNG, .baipix project files, with a pixel size and a gap between pixels.
- Everything saved in the browser, English and French, light and dark themes.
- The website, with a gallery of drawings rendered by the editor itself.

[Unreleased]: https://github.com/baipix/baipix/compare/v0.3.1...main
[0.3.1]: https://github.com/baipix/baipix/releases/tag/v0.3.1
[0.3.0]: https://github.com/baipix/baipix/releases/tag/v0.3.0
[0.2.0]: https://github.com/baipix/baipix/releases/tag/v0.2.0
