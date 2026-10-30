# Contributing to Baipix

Thanks for your interest! Here is how to get productive quickly.

## Setup

```bash
npm install
npm run dev
```

Before opening a pull request, make sure everything passes:

```bash
npm run typecheck && npm run lint && npm test && npm run e2e
```

The CI runs the same checks on every pull request.

## End-to-end tests

Playwright tests live in `e2e/playwright/`.

Install Chromium once:

```bash
npx playwright install chromium
```

Run the E2E tests:

```bash
npm run e2e
```

Run them interactively:

```bash
npm run e2e:watch
```

The Playwright config starts the local Vite server automatically. Test reports are written to `playwright-report/`, and failed test artifacts to `test-results/`.

## Picking something to work on

Ideas and bugs are tracked in [issues](https://github.com/baipix/baipix/issues). The ones labeled `good first issue` are small and a good way to start. Leave a comment on the issue when you pick it up, so two people don't end up doing the same thing.

Put `Closes #123` in your commit message or pull request description: the issue closes on its own when the change lands.

## Ground rules

- **The engine stays pure.** Nothing in `src/engine` may touch the DOM, `window` or React. This keeps it testable and reusable. Browser-specific code goes in `src/io` or `src/ui`.
- **The UI talks to the engine only through `Editor`.** Components read state with `useEditorState(selector)` and call editor methods. They never mutate documents directly.
- **Every visible string is translated.** Add the key to `src/i18n/en.ts`, then to every other language in `src/i18n/` (TypeScript will fail if one misses a key). If you can't translate it, put the English text: a native speaker will fix it later.
- **Test engine changes.** Tests live in `tests/`, next to the feature they cover.
- Code is formatted with Prettier (`npm run format`), .astro files included. CI runs `npm run format:check`.
- Add a line to `CHANGELOG.md`, under _Unreleased_, for anything people will notice.
- Interface colors come from the tokens in `src/ui/styles/tokens.css`, written once as `light-dark(light, dark)`. Add a token there rather than a color in a component or in `app.css`. The canvas reads the same tokens through `readTheme()`.
- Follow the design system for anything in the interface: [DESIGN.md](DESIGN.md) sums up the rules, and the design system page (`npm run dev`, then `/design.html`) shows every token and component.
- Changed how the editor looks? Run `npm run screenshots` (it needs Google Chrome): it takes the screenshots of the website and the README again from the current interface, in dark and light. Commit them with your change.

## Code conventions

Prettier, ESLint and TypeScript handle the form. For the rest:

- **Follow the code around you.** When in doubt, do as the nearby files do.
- **Name the logic.** A piece that computes something on its own (what to save, which board to open) goes in a named function, pure when possible, and tested when it lives in `src/engine` or `src/storage`.
- **One effect per lifecycle.** Timers, listeners and their cleanup that start and stop together stay in the same effect.
- **No magic numbers.** Delays, sizes and limits get a named constant at the top of the file (`SAVE_DEBOUNCE_MS`).
- **Early returns** rather than nested conditions.
- **Comments say why**, not what: short full sentences, only where the code can't say it itself.
- **One change per pull request**: one fix, one feature or one refactor. A refactor doesn't change behavior.

## Adding a tool

1. Create `src/engine/tools/myTool.ts` exporting a `Tool` (see `pencil.ts` for a freehand tool, `shapes.ts` for a previewed shape).
2. Add its id to `ToolId` in `src/engine/tools/types.ts` and register it in `src/engine/tools/index.ts`.
3. Add its icon, label and shortcut in `src/ui/tools.ts`, and its options in `src/ui/components/ToolOptionsBar.tsx` if it has any (they show in the bar above the toolbar).
4. Add the label and hint to the dictionaries in `src/i18n/`.
5. Write a test in `tests/editor.test.ts` that draws with it.

## Adding a language

1. Copy `src/i18n/fr.ts` to `src/i18n/xx.ts` and translate every value.
2. Register it in `src/i18n/index.ts` (`Locale`, `dictionaries` and `LOCALES`).
3. Add it to the dictionaries in `tests/i18n.test.ts`, so the test checks it keeps every placeholder (`{count}`…).

Baipix opens in the browser's language when it has it, so a new language reaches its speakers right away. Open translation issues are listed under [issues](https://github.com/baipix/baipix/issues?q=is%3Aissue+is%3Aopen+translation).

## Reporting bugs

Open an issue with the steps to reproduce, what you expected, and your browser. A `.baipix` file of the drawing helps a lot (main menu → Download as .baipix).
