# Design system

The living reference is the design system page: run `npm run dev` and open
[localhost:5173/design.html](http://localhost:5173/design.html), or see it online at
[baipix.app/app/design.html](https://baipix.app/app/design.html). It's built from the editor's own
components and stylesheets, so it can't drift from them: colors are read from the tokens, contrast is
measured live, and the logo files are generated from the same drawing as in the app.

The short version, for when you add or change something in the interface:

- **Colors.** Every color is a token, written once as `light-dark(light, dark)`: in
  `src/ui/styles/tokens.css`, and the violet accent at the top of its block in `app.css`. Don't write a
  color anywhere else. The canvas renderer reads the same tokens.
- **Violet is for what's selected or acted on** (`--glow`, `--glow-line`): the active tool and layer,
  the selection's frame, focus, the main button, menus, drops. Its fills carry white text and icons
  (`--glow-ink`). Hovers stay neutral, and so does the interface at rest. Green (`--component`) is for
  components and instances only.
- **Shapes.** Soft rounded corners (`--radius` for controls, `--radius-lg` for panels and dialogs) and
  soft shadows (`--shadow`, `--shadow-pop`, `--shadow-menu`) on what floats over the canvas. The pixel
  look is kept for the logo and the website.
- **Buttons.** `.btn` for actions in panels and dialogs, `.btn-primary` for the one main action,
  `.action-btn` for big actions on full screens (the home screen), `IconButton` for compact actions.
- **Icons.** [Lucide](https://lucide.dev) line icons, through `Icon` (16 px in the panels, 18 px in
  the toolbar, a 1.75 stroke). When one is missing, draw it in Lucide's style (24×24, round line ends, no
  fill) with `drawn()` in `src/ui/icons.tsx`.
- **Text.** Inter, 11 px in the interface. Copy is short and plain, written in English and
  translated into every language in `src/i18n`.
- **Accessibility.** Text contrast of at least 4.5:1 and lines of 3:1 in both themes (the design
  system page checks it), a label on every icon button, a visible focus, and “reduce motion” respected.
- **The logo** is the 8×8 drawing in `src/ui/icons.tsx` (`LOGO`). Scale it by multiples of 8 px and never
  smooth it. Download it from the design system page.
