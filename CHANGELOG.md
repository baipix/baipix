# Changelog

Notable changes to Baipix, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Numbers in parentheses are pull requests.

## [Unreleased]

### Added

- Open a drawing from a link: the editor opens a .baipix file of baipix.app given as `?open=…`, straight in the editor. The guides' Open the editor buttons open their example, and each gallery piece has an Open link. Only files from the site itself are opened. (#433)
- Not counted in the page views: open any page of baipix.app once with `?notrack`, and this browser stops sending them, on the site and in the editor, until a page is opened with `?track`. (#427)

### Website

- A Pixel art for Figma page: the gallery's game icons in an app's inventory screen, the named groups they get once pasted in Figma, a button that copies their SVG to try it, copy and paste, what Figma doesn't do for pixel art, what works like Figma, and common questions. The footer gets columns (Baipix, Guides, Project). The guides share their hero, copy-and-paste and questions parts. (#433)
- A Pixel art to SVG page: the gallery's starfighter as an example with its numbers measured at build time (18 paths instead of 1024 squares, 85% lighter), copy and paste straight into Figma, what's in the file, how to do it in three steps, and common questions, under the home page's animated background. It's in the footer, the sitemap and llms.txt. (#431)
- baipix.app/llms.txt sums up Baipix for AI assistants: what it is, what it does, the current version and the links to read more. (#429)

## [0.7.1] - 2026-10-17

The drawing as code: a </> button next to Export gives it as a React component, SVG, CSS, JSON or ASCII, to copy or download. Dialogs stand out from the editor, and the background's hex field shows all six characters.

### Added

- The drawing as code: a </> button next to Export (or File › Code…) opens a dialog with a React component, the SVG, CSS (a background image and the colors as custom properties), JSON (named colors and the pixels) or ASCII, to read, copy or download. It follows the drawing's pixel size and gap, and can take the active layer alone. (#419)
- A 30-second video of Baipix on YouTube, linked from the top of the README with its thumbnail. (#415)

### Changed

- Dialogs stand out from the editor: a darker, slightly blurred backdrop, a hairline edge and a deeper shadow. On opening, the focus goes to the first field to type in, or to the dialog itself, instead of the first button, whose focus ring looked like a selection (Export's 1×). (#421)

### Fixed

- The background's hex field, in the Board section, shows its six characters instead of cutting the last one: color rows keep room for six wide letters, their gaps a little tighter. (#423)

### Website

- The README credits Lucide for the editor's icons (Pixelarticons only for the pixel cursors of the site's animations), and DESIGN.md describes the current interface: the violet accent, soft corners and shadows, line icons. (#417)
- The home page's Components, Isometric volumes and Several boards are cards like the others, one row of the feature grid, instead of three wide cards stacked with animations. (#413)

## [0.7.0] - 2026-10-16

Isometric volumes and boards: boxes, cylinders standing or lying, pyramids, stairs and ramps on an isometric grid, several boards in a file like frames in Figma, layers outside them, an undo history that survives a reload, and a lighter interface with line icons, violet selections and Figma-like rulers.

### Added

- The undo history survives a reload: each board's last 50 steps (undo and redo) are kept in the browser next to the drawing, every unchanged layer stored once rather than once per step. (#397)
- Floor tiles, edge by edge: with the isometric grid on, the rectangle's options choose which of a floor tile's edges get the outline (NW, NE, SW, SE), so tiles side by side share one line instead of a doubled one. (#396)
- Lying cylinders, for barrels, logs and wheels: the cylinder's options can lay it along the left or the right axis. Its round end is dragged on a wall like the shapes on an isometric plane, and its body runs back by its length, lit on top and shaded underneath. (#395)
- Isometric stairs and ramps, in the shapes menu next to the box: dragged like the box, Height tall, rising toward the corner you pick (up-left, up-right, down-right, down-left); with Steps above 0, a staircase of equal steps. Outline, face colors and the options' redraw work like the other volumes. (#394)
- Bevels on the isometric box, for crates, stone blocks and rounded tiles: a Bevel menu in its options (top, corner or both) lights the top's back edges and turns its front edges and its front corner halfway between the faces they join, in palette colors when the color is from the palette. (#393)
- Inner edges on isometric volumes: an Edges option next to Outline and Light edge draws a line in the outline's color between the faces: under the box's top and down its front corner, under the cylinder's rim, along the pyramid's ridges that show. (#392)
- A color per face on isometric volumes: three swatches in the box, cylinder and pyramid's options (top, left, right) take the current color on a click, instead of shading the sides from the palette; the outline and light edge follow. A button goes back to shading. The options bar also takes its full width instead of scrolling. (#391)
- The logo sits above the files screen's title, its pixel hopping on a calm beat like a loader, waiting for you to start a file. (#388)
- The logo's escaped pixel hops on hover, in the editor's top bar, on the files screen and on the site; nothing with reduced motion. (#386)
- The files screen gets a discreet ambient background: a grid of small squares lit by slow waves, a few twinkling in violet, quieter behind the content and still when reduced motion is on. (#380)
- Fold the Layers panel, like Figma's Minimize UI: the panel now has a header with the file's name and a button (or Ctrl/Cmd+Shift+\\) that folds it into a small pill and unfolds it again. Remembered across reloads. (#376)
- Undo (Cmd/Ctrl+Z) right after deleting boards brings them back, and Redo deletes them again, like in Figma; the same for layers outside the boards deleted all at once. Once something else is done, Undo goes back to the board's own history (the toast's Undo still works). (#360)
- Layers outside the boards, like in Figma: a layer dragged with the Move tool and let go beside every board stays there, visible, and shows in the Layers panel at the same level as the boards. Grab it again to move it, or drop it onto a board; it can be renamed, hidden or deleted, and a file with no board can still hold such layers. They're only moved for now (the tools draw on a board), and only boards export. Undo takes a layer moved across boards back to the board it left, both sides at once. (#358)
- A file can have no board: delete them all and the canvas says so, with a Create a board button (the board tool draws one too). Undo brings them back. (#356)
- Select layers with a marquee: with the Move tool, drag from an empty spot to select every layer the rectangle touches (a layer in a group takes its group), Shift to add to the selection. They move together, and Delete removes them together, even all of them: an empty layer is left to draw on. (#355)
- A layer dragged with the Move tool follows the pointer outside its board, instead of vanishing past the edge. (#354)
- With the Move tool, a click on an empty spot lets go of the selected layers, like a click on the empty canvas in Figma; the active layer stays, unframed. (#353)
- Drag a layer onto another board: with the Move tool, a layer let go over another board goes onto it, right where it was dropped, with its name, opacity, blend mode and effects. Components and their copies stay on their board for now. (#348)
- Boards in the Layers panel: in a file of several boards, each board has its row, the active one open with its layers and groups under it, like Figma. A click on a row selects the board (Shift adds it) and opens it; a double-click renames it. (#347)
- Align boards: with several boards selected (Shift-click), the Align commands (Layer menu, their Alt shortcuts, or the buttons in the board tool's bar) line them up against the box they fill together. Delete board removes them all. (#346)
- Alt-drag (Option-drag) a board, by its name or with the board tool by its body, to drop a copy of it where you let go, layers and all. With the board tool, a board can also be moved by dragging it anywhere. (#345)
- Delete (or Backspace) removes the selected boards, with an Undo toast that brings them all back. (#344)
- Select a board like a layer: click its name, or click it with the board tool (Shift adds to the selection, Escape lets go). It gets a blue frame and handles; dragging a side or a corner grows or crops the board on that side, the drawing staying where it is, in one undo step. (#343)
- The board tool is on A, like Figma, and the spray moves to P. (#341)
- Help › Report a bug… and Help › Suggest an idea… open a new GitHub issue already filled in like the repository's templates; a bug report comes with the Baipix version and the browser written in. (#340)
- A file's boards share its palette: a change on one board, undo included, is a change for all of them. With Drawing colors, each board shows the colors it uses. (#323)
- Export every board at once: in a file of several boards, Export gets an All boards option, which gives a .zip with one file per board, named after it, in PNG, SVG or Aseprite, each at its own pixel size. (#322)
- Boards, like frames in Figma: a file can hold several boards side by side, each with its own size, layers and undo history. With the Board tool (N), draw a rectangle beside them to add one; drag a board by its name to move it; click a board to work on it, and the Layers panel and the export follow. New, Duplicate and Delete board are in the File menu and the tool's options bar. A file of several boards is saved as one .baipix file; files of one board don't change. (#321)
- With the isometric grid on, Shift lays any shape on the ground, regular: a square tile (exactly a box's top), a circle, a regular triangle, star, heart or rounded square, dragged from the top corner of its diamond to the bottom one (the ellipse, across). The Plane option comes to every shape but the line: on a wall, Shift makes it as tall as wide. Without the grid, Shift keeps its usual meaning. (#317)
- Vertical lines in the isometric grid (Display, under Cell): upright lines through the diamonds' corners, to build heights; a box's upright edges fall on them. Saved with the file, like the grid. (#315)
- Layer › Sort by depth: for an isometric scene with an object per layer, the layers whose drawing reaches lowest on screen go in front. It sorts the selected layers when several are, all of them otherwise, each group's layers within their group; empty layers stay where they are. One undo step. (#314)
- Draw on an isometric plane: with the file's isometric grid on, the rectangle and the ellipse get a Plane option (Flat, Left wall, Right wall, Ground). On a wall, the shape fits in the dragged box, its top and bottom going along the wall in 2:1 steps, for windows, doors and signs. On the ground, the rectangle is a floor tile like the box's top, and the ellipse lies flat. Outlined or filled. (#312)
- An isometric cylinder and pyramid, in the shapes menu next to the box. The cylinder: drag across its top, an ellipse lying flat, and it goes down by the height, shaded like the box. The pyramid: drag its diamond base like the box's top, its apex the height above the middle; its faces are lit from the top left, and a low one shows all four, like a roof. Height, Outline and Light edge redraw the last one drawn, like the box. (#313)
- Extrude (Image › Extrude…): the selection, or what's drawn on the layer, is the top of a volume. It goes up by the height and its sides fill under it, darker on the left and darker still on the right, like the isometric box, with the same Outline and Light edge options. Set up live in the options bar; Enter applies, Escape cancels. Any floor shape becomes a building. (#311)
- Put an image on an isometric face (Image › Put on an isometric face): the selection, or what's drawn on the layer, laid onto the left side, the right side or the top of a box, kept crisp. The sides slide its columns down (or up) one pixel every two, losing nothing; the top turns it by 45° and flattens it, at twice its size so that no pixel is lost. The selection takes the face's shape, ready to move into place. (#302)
- Isometric box: a Light edge option draws the top's two front edges one step lighter, the classic highlight of isometric pixel art, next to the outline. (#301)
- An isometric ellipse: with the file's isometric grid on, Shift on the ellipse tool lays it on the ground, twice as wide as tall. It's drawn the pixel art way, its runs only getting shorter from the top toward the sides, with the two-pixel steps of the 2:1 slope. Outlined or filled. (#300)
- Export as a tileset (Format: Tileset, in Export): the drawing cut into tiles of any size (16 × 16 by default), as a .zip with the tiles on one PNG sheet at 1×, a Tiled tileset (.tsj) and a Tiled map (.tmj) that draws the drawing again. Empty and repeated tiles can be left out of the sheet; the map still rebuilds the drawing. Godot takes the PNG as it is. (#299)
- Isometric tiles: with the isometric grid on, the tile preview repeats the drawing staggered, half a tile across and down, as isometric tiles fit together, and the canvas's corners show the neighbors. Strokes that go past the diamond's edges come back in on the other side, so its corners stay empty. An Isometric tile template (32 × 16) starts that way. The isometric grid now starts from the top middle of the canvas, so its diamonds line up with the tile's. (#298)
- The isometric grid belongs to the file: it's saved in the .baipix file with its cell width, so an isometric drawing keeps it and a flat one doesn't show it. While it's on, the box sits on it (its top corner on a corner of the diamonds, its sides whole diamond edges) and the pencil's Shift-click lines keep to the isometric angles. An Isometric scene template (128 × 128) starts with it on. (#297)
- Straight lines with the pencil and the eraser: Shift-click draws (or erases) a straight line from where the last stroke on that layer ended, like in Photoshop or Aseprite. With Cmd/Ctrl too, it snaps to the line tool's angles, 2:1 included, for isometric edges. (#296)
- An isometric box, in the shapes menu: drag from the top corner of the box to the bottom one (Shift: as deep as wide). The top is the current color and the two sides are darker, taken down the palette's ramp, and an optional outline goes around it in an even darker one. Its edges are clean 2:1 steps. Right after, Width, Depth and Height in the options bar redraw it in place, in the same undo step. (#289)
- Isometric lines: with Shift, the line tool also snaps to 2:1 (two pixels across for one up) and 1:2, besides 0°, 45° and 90°. They're drawn in clean steps of exactly two pixels, with no doubled or lone pixel. (#288)
- An isometric grid (Display, or the View menu): 2:1 diamonds, the pixel art isometric angle, with lines through the pixel corners at every zoom. Pick the width of the diamonds in pixels (16 by default); they're half as tall. (#287)

### Changed

- Rulers like Figma's: what's selected (the layer framed by the Move tool, or the pixel selection) shows as a violet band on both rulers, its edges written in violet, the numbers too close to them left out; thinner ticks; the Preview window no longer covers the left ruler. (#378)
- A lighter right panel, floating like the Layers panel and as tall as what it shows: only the board, colors, layer and effects. The view settings (pixel grid, tile preview, rulers) open from a button in the top bar; symmetry gets two toggles in the drawing tools' options bar, at hand while drawing; the isometric grid, saved with the file, moves to the Board section. Export is a button at the top right that opens the export in a dialog. (#377)
- A soft violet replaces the blue for what's selected or acted on: the selection's frame and handles, the active layer and tool, the main button, menus, focus and checkboxes. Hovers are now neutral. Components move from purple to green, so they never look selected. (#375)
- Line icons: the interface's icons come from Lucide, finer and lighter than the pixel ones, 16 px in the panels and 18 px in the toolbar. (#374)
- The interface drops its pixel look: soft rounded corners and soft shadows on panels, menus, buttons and the home screen's cards, native checkboxes. The pixel style stays for the logo, the site and what you draw. (#373)
- Precise cursors: drawing tools show a thin crosshair with a light halo instead of a pixel one, the Move tool the system arrow, the eyedropper and the rotate handles line icons. (#372)
- The right panel's Canvas section is now called Board, like the board tool, and so are Board size… and the width and height fields: a file of one board is a board too. (#342)

### Fixed

- A star of an even width keeps its tip, two pixels wide, instead of losing it; the star and the triangle on the site's Draw page are drawn symmetric, like in the editor. (#405)
- Several selected layers resize and turn together by the frame's handles, each in proportion within the box they fill, in one undo step; before, the handles did nothing and the frame went away. (#390)
- The side panels' resize handles follow their panel's edge, between its rounded corners, instead of running down the whole window. (#382)
- Undo (and Redo) now covers boards moved by a drag or aligned, each drag or alignment one step, in order with boards deleted. (#364)
- Holding Space shows the hand whatever the tool (the Move tool and the eyedropper kept their own cursor), and the brush outline hides while it's held. (#362)
- A board moved or renamed no longer goes back to its old place or name when a drawing step is undone. The size in the title bar follows a canvas resize right away. (#343)
- An ellipse on a wall had a top and a bottom that alternated pixel by pixel where its curve slopes against the wall's 2:1. They're now even. (#318)
- Put on an isometric face: what landed past the canvas's edges was lost. It's now kept outside the canvas, as after a move, and without a selection the drawing already outside the canvas is laid on the face too. (#305)
- Isometric box: a color that isn't in the palette got its sides from the closest palette ramp, whatever its hue (a blue box with green sides, once the palette held only greens). The sides now come down the palette's ramp only for a palette color, and are otherwise the color itself made darker. (#304)
- In Export, the tileset's tile width and height fields were too narrow for their numbers (16 showed as 1). They now take the panel's whole width, like the canvas size. (#303)

### Website

- The home page and the README say what 0.7 brings: isometric volumes and boards join Components as wide cards across the feature grid, each with its animation from the Draw page. (#411)
- The Draw page has a Boards section: several boards in a file, arranging them, layers outside the boards and the history kept after a reload, with a tree drawn on one board and its copies turned to autumn, winter and night. (#409)
- The Draw page has an Isometric section: the grid, the box and pyramid, the cylinder, stairs and ramps, face colors and tile edges, with a courtyard that builds itself volume by volume. (#407)
- The Draw page has a bar of its sections that sticks to the top as you scroll: the one you're reading is framed in its color, and a click takes you to another. On a phone it scrolls sideways. (#403)
- The site's home page has a Screenshots section: eight shots of the editor at work (boards, isometric volumes, components, gradients, tile preview, Jumble, eyedropper, pixel gap), each with a caption. A click opens it full size with its caption over it, and the arrow keys go through the others. (#399)
- The site's hero has the editor's files screen background: small squares lit by slow waves, a few twinkling in violet, in place of the static dot grid; still with reduced motion, paused off screen. (#401)
- The site shows the new interface: the image shared with links, and the Draw page's selection frame in violet. (#385)

## [0.6.0] - 2026-10-11

Palettes and interface: each file keeps its own palette, your own palettes in every file, the two colors as chips like Photoshop, a shorter toolbar, Export at the bottom of the right panel, Cmd+Z for the palette, and an SVG export that keeps the layers.

### Added

- My palettes: keep your own palettes in the browser and use them in every file. In Manage palettes, + New palette makes one from the file's palette or from a .hex or .gpl file; each can be renamed, replaced with the file's palette or deleted. They're listed in the palette menu, after the file's own; picking one copies it into the file, its name in the header. (#279)
- Resize a layer or a selection by its sides too, not only its corners: a handle in the middle of each side, and the whole side can be grabbed. A side changes the width or the height alone, the opposite side staying put; Alt resizes from the center, Shift keeps the proportions. (#266)

### Changed

- The SVG export keeps the layers: a group per layer and per group, named as in Baipix, so they stay apart once opened in Figma or Illustrator. Opacity and blend modes come along, effects are drawn into their layer, hidden layers are left out; it looks the same as before. (#284)
- Every dialog has a × at the top right, like the floating panels: it closes it without doing anything, like Escape. Dialogs that only had a Close button (palettes, shortcuts) lose it. (#283)
- Cmd+Z (Ctrl+Z) undoes the changes made to the palette: a sort, an added or removed color, a color moved, a ramp, another palette picked. Undoing a sort gives a preset back in its own order. Undoing a drawing step still leaves the palette as it is. Sort by lightness is greyed out for Drawing colors, which are sorted already: it used to turn them into a custom palette that no longer followed the drawing. (#281)
- A + after the last swatch of the palette adds the color in use to it; it's greyed out when that color is already there. The Create a ramp and Export buttons under the palette go away: both are in its ... menu. (#280)
- A shorter toolbar, 12 tools instead of 20: like the shapes and the selections, the paint bucket and the gradient share a button, so do shade and lighten, and blur, jumble and liquify (Rework). Each button shows the last tool used of its family; single-key shortcuts don't change. A hidden layer's eye shows in the Layers panel without its lock. (#278)
- Export is a section at the bottom of the right panel, like Figma, instead of a tab: the preview of the file, its scale from 1× to 32×, its name and format, Export, Copy as SVG and Copy as PNG. The right panel has no tabs anymore. The Aseprite format is now remembered too. (#277)
- The primary and secondary colors are two overlapping chips, like Photoshop, next to the palette in one Colors section. The front one is what the tools draw with: click it for its picker (hex, opacity). A click on the one behind brings it to the front, so drawing with the secondary color no longer needs a right click; the arrows in the corner swap them (X). (#276)
- The palette belongs to the file: it's saved in the .baipix file, and switching files switches palettes. Pick a preset, or Drawing colors, the colors the drawing uses, kept up to date as you draw; a new file starts that way, and so do older files. The palette menu shows the palette in use first, then Drawing colors with its colors, then the other presets. The row of recent colors goes away, and the color choices of gradients and effects show the colors in the drawing instead. (#274)
- Gradient stops and layer effects take any color, not only the palette's: under the palette come the primary, secondary and recent colors, and a hex field. A color that isn't in the palette gets a + to add it there. (#265)

### Fixed

- In Manage palettes, the + New palette menu opened behind the dialog. It now opens above it, and Escape closes the menu without closing the dialog. (#282)
- The Layers panel no longer leaves an empty space under the rows when there are only one or two layers. (#267)
- Cmd+Z (Ctrl+Z) right after typing a size, an opacity or any number: it now undoes the change in the editor instead of the text in the field. Undoing a canvas resize puts the guides and the reference image back too. (#264)

### Website

- The home page, the Draw page and the README say what 0.6 brings to palettes: each file keeps its own, Drawing colors follow the drawing, and your own palettes are there in every file. (#286)
- On the Draw page, each tool's row shows the editor's own icon for it instead of its shortcut; the shortcuts stay together at the bottom of the page. (#261)
- The home page, the Draw page and the README catch up with 0.5: the gradient, the lasso and the magic wand, the heart, components, layer effects, groups four levels deep, export to Aseprite. The Draw page gets a Components section and a gradient animation, the home page a wide Components card closing its feature list, both with a potion whose copies fill along with it. (#259)
- The screenshots of the editor on the home page and in the README show the current interface, and `npm run screenshots` takes them again in dark and light whenever it changes. (#260)

## [0.5.0] - 2026-10-10

Components and new tools: components and instances like in Figma, layer effects, a gradient tool, the lasso and the magic wand, a repeat grid, layers you can drag into groups and copy between files, export to Aseprite, and a smaller New file dialog.

### Added

- Components, like in Figma: Ctrl+Alt+K (or the diamond button next to + in the Layers panel, a layer's right-click menu, or Layer › Create component) turns the active layer into a component, its sprite being the selection or what's drawn. Components are listed at the top of the left panel; drag one onto the canvas to place an instance. Instances follow their component as you draw on it, can't be painted on themselves, move with the Move tool, and Alt+drag copies one; Alt+drag on a component places an instance of it. A diamond marks components and instances in the Layers list. (#235, #236)
- Edit a component, detach an instance: from an instance's right-click menu or the Layer menu, Go to component makes its component the active layer, and Detach instance (Ctrl+Alt+B) turns it back into plain pixels, in one undo step. Trying to paint on an instance offers Go to component right in the message. Drawing next to a component grows its frame, and its instances show the new pixels. (#238)
- Double-click on a group with the Move tool to go into it, like in Figma: its subgroup first, then the layer under the cursor. Escape goes back out one level at a time. (#244)
- Select several layers on the canvas: with the Move tool, Shift+click adds a layer (or its group) to the selection, or takes it out; a drag moves them all. Shift+D duplicates every selected layer at once (also in their right-click menu), and Alt+drag copies what it takes, any layer or group, the copies being what moves. One undo step each. (#245)
- Copy, cut and paste whole layers: Cmd+C or Cmd+X in the Layers panel, or on the canvas with no pixels selected, takes the selected layers (or group) with their name, settings, group and component links; Cmd+V pastes them above the active layer. It goes through the system clipboard, so they paste in another file or another tab, and other apps get a PNG. Pasted in a canvas of another size, layers keep their place. An instance pasted without its component becomes plain pixels, unless the component is in that file. With pixels selected, Cmd+C still copies those pixels. (#247)
- A Gradient tool (D), the pixel art way: drag from where it starts to where it ends (Shift: by 45°), and the area of the same color under the first click (or the selection, or the whole layer) fills with palette colors only, dithered from one to the next (smooth Bayer, checker, or plain bands). Linear, radial, angular or diamond. Its stops are edited on a bar like in Figma: click to add one, drag to move it, click it to pick its color in the palette, or transparent to fade out. Reverse the colors, turn it by 90°: the last gradient follows every change, in the same undo step. Starts from the primary and secondary colors. (#248)
- Repeat in a grid (Layer menu, or a layer's right-click menu): copies of the selection, or of what's drawn on the layer, in columns and rows, with a gap between them (negative to overlap). The numbers update the copies live; Enter applies, Escape cancels, one undo step. An instance or a component repeats as instances, selected together. (#249)
- Export to Aseprite: pick Aseprite as the format in the Export tab to keep working on the drawing there. The .aseprite file has the layers with their names, visibility, lock, opacity and blend modes, the groups, and the palette, on one frame; the background color becomes Aseprite's background layer if it's included. (#250)
- Layer effects, like in Figma: an Effects section under Layer in the right panel. "+" adds an outline (outside or inside, 1 to 16 pixels, round or square corners), a drop shadow (offset in pixels) or a glow (solid next to the drawing, thinning out in dithering). Each one is drawn from the layer's pixels without changing them: tune it, hide it or remove it at any time; it shows on the canvas and in exports. Colors come from the palette. "Apply the effects to the pixels" writes them in; merging a layer does too. Saved in .baipix files. (#251)
- A heart in the shapes, next to the star: outlined or filled, drawn so it reads as a heart even at 7×6. (#255)
- Lasso and magic wand: the selection tools share a button with a menu, like the shapes (Rectangle M, Lasso Q, Magic wand Y, also in the Select menu). Draw around what to select with the lasso; click a color with the wand to select its area, or that color everywhere. Shift adds to the selection, Alt takes from it, with the rectangle too; Select › Invert selection (Ctrl+Shift+I) swaps what is and isn't selected. A selection of any shape is outlined as it is, and filling, clearing, drawing, moving, copying, flipping, turning, resizing and adjusting colors all keep to its pixels. The bucket clicked in a selection fills all of it, and a gradient covers all of it, so a magic wand selection can be repainted in one go. (#256)

### Changed

- A smaller New file dialog: the size on top, filled with the last one used and ready for Enter, with a button to swap width and height; then the last sizes used and six templates as plain rows (a name, its size, what it sets up). A click picks one, a double-click starts with it. From an image… moves to the footer. The first launch shows the same list. Avatar, Sprite sheet, Wallpaper and Commodore 64 are no longer templates. (#253)
- Layers panel drag and drop: drop a layer, an instance or a group on a group's row to put it inside, even folded. Between rows, the drop line follows the pointer: right, at the bottom of the group that ends there; left, out of it. Groups now nest four levels deep instead of two. (#246)
- The Layers panel loses its bottom bar of buttons: layers move by dragging, and duplicate, group, merge and delete are in the right-click menu (which now groups the selection too), the Layer menu and their shortcuts.

### Fixed

- After dragging a layer onto another row, the next click on a layer was ignored. (#246)
- Delete (or Backspace) removes the selected layers when no pixels are selected, wherever the focus is; before, it only worked with the focus in the Layers list. (#243)

## [0.4.0] - 2026-10-08

Layers you can group and turn: layer groups, rotation by dragging a corner, rotate counterclockwise and align, a canvas size screen, and a Draw page on the website that shows every tool.

### Added

- Rotate by dragging, like in Figma: with the Move tool, just outside a corner of the frame the cursor turns into a rotate arrow; drag to turn the layer or the selection to any angle (Shift snaps to 15°), with the angle under the frame. Pixels turn the RotSprite way, so lines stay clean and no new colors appear; right angles stay exact. One undo step. (#226)
- Layer groups, two levels deep: Ctrl+G groups the selected layers (or the button in the Layers panel), Ctrl+Shift+G ungroups. Fold and unfold them, rename them, drag layers and groups in and out. A group hides, locks, has its own opacity and blend mode (Pass through by default, each layer blending on its own), and can be duplicated, deleted with Undo, or merged into one layer. Selecting a group selects its layers: the Move tool, the arrow keys and Delete act on the whole group, and a click on the canvas with the Move tool takes the group of the layer clicked. Saved in .baipix files; older files open as they were. (#224)
- Rotate 90° counterclockwise (Alt+Shift+R) next to clockwise, and align what's drawn to the canvas: left, center or right, top, middle or bottom. In the Move and Select tools' bar, Layer › Align, and with Figma's shortcuts (Alt+A, H, D, W, V, S). With a selection, only its drawn pixels move. (#223)
- A Canvas size dialog (Image › Canvas size…, or the crop button next to W and H): drag the frame's handles to make the canvas bigger or smaller, drag the drawing to place it, or type the size and pick where the drawing goes in a 3×3 grid (centered by default). What gets cut off is kept, as with the W and H fields. One undo step. (#222)

### Changed

- Escape now lets go of the selected layer: with no pixel selection, it drops the Move tool's frame and leaves a multiple or group selection for the active layer alone, like a click beside every layer. (#232)
- The tile preview repeats the drawing as far as the view goes, instead of only the eight copies around it. (#232)

### Website

- A Draw page that goes through every drawing tool, with pictures and animations made by the editor itself. The home page follows it: its feature cards lead to the matching section, it says Baipix is free and open source, and the footer ends with a big BAIPIX in pixel art. (#227)

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

[Unreleased]: https://github.com/baipix/baipix/compare/v0.7.1...main
[0.7.1]: https://github.com/baipix/baipix/releases/tag/v0.7.1
[0.7.0]: https://github.com/baipix/baipix/releases/tag/v0.7.0
[0.6.0]: https://github.com/baipix/baipix/releases/tag/v0.6.0
[0.5.0]: https://github.com/baipix/baipix/releases/tag/v0.5.0
[0.4.0]: https://github.com/baipix/baipix/releases/tag/v0.4.0
[0.3.1]: https://github.com/baipix/baipix/releases/tag/v0.3.1
[0.3.0]: https://github.com/baipix/baipix/releases/tag/v0.3.0
[0.2.0]: https://github.com/baipix/baipix/releases/tag/v0.2.0
