import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import {
  CODE_EXTENSIONS,
  CODE_LANGUAGES,
  className,
  codeOf,
  colorName,
  componentName,
  namedColors,
  type CodeInput,
} from '../src/engine/export/code';
import { renderGeometry, toSvg } from '../src/engine/export/svg';

const INK = pack(26, 28, 44);
const RED = pack(228, 59, 68);
const _ = 0;
// A 3 × 2 drawing: ink on top, red under it, one empty pixel.
const pixels = Uint32Array.from([INK, INK, INK, RED, RED, _]);
const flatSvg = toSvg(pixels, 3, 2, renderGeometry(3, 2, 1, 0));
const input: CodeInput = { name: 'My knight 2', width: 3, height: 2, pixels, svg: flatSvg, flatSvg };

describe('code export', () => {
  it('keeps the supported languages and file extensions aligned', () => {
    expect(CODE_LANGUAGES).toEqual(['react', 'svg', 'css', 'json', 'ascii']);
    expect(Object.keys(CODE_EXTENSIONS)).toEqual(CODE_LANGUAGES);
    expect(CODE_EXTENSIONS).toEqual({ react: 'tsx', svg: 'svg', css: 'css', json: 'json', ascii: 'txt' });
  });

  it('names colors plainly, most used first, without twins', () => {
    expect(colorName(INK)).toBe('ink');
    expect(colorName(pack(255, 255, 255))).toBe('paper');
    expect(colorName(RED)).toBe('red');
    expect(colorName(pack(59, 93, 201))).toBe('blue');
    expect(namedColors(pixels).map((c) => c.name)).toEqual(['ink', 'red']);
    const twins = namedColors(Uint32Array.from([RED, pack(230, 60, 70)]));
    expect(twins.map((c) => c.name)).toEqual(['red', 'red-2']);
  });

  it('keeps transparent pixels out and preserves first-seen order for ties', () => {
    const first = pack(220, 40, 40);
    const second = pack(40, 40, 220);

    expect(namedColors(Uint32Array.from([0, first, second]))).toEqual([
      { name: 'red', color: first },
      { name: 'blue', color: second },
    ]);
  });

  it('names neutral and light or dark colors consistently', () => {
    expect(colorName(pack(50, 50, 50))).toBe('dark-gray');
    expect(colorName(pack(128, 128, 128))).toBe('gray');
    expect(colorName(pack(220, 220, 220))).toBe('light-gray');
    expect(colorName(pack(20, 180, 40))).toBe('green');
    expect(colorName(pack(20, 30, 100))).toBe('dark-blue');
    expect(colorName(pack(150, 210, 250))).toBe('light-sky');
  });

  it('makes names fit for a component and a class', () => {
    expect(componentName('My knight 2')).toBe('MyKnight2');
    expect(componentName('2 tiles')).toBe('Sprite2Tiles');
    expect(componentName('')).toBe('Sprite');
    expect(className('My knight 2')).toBe('my-knight-2');
    expect(className('Été 2026')).toBe('ete-2026');
    expect(className('')).toBe('sprite');
    expect(componentName('---')).toBe('Sprite');
    expect(className(' 2_tiles ')).toBe('sprite-2-tiles');
  });

  it('writes a React component that takes its props', () => {
    const code = codeOf('react', input);
    expect(code).toContain('export function MyKnight2(props: SVGProps<SVGSVGElement>)');
    expect(code).toContain('shapeRendering="crispEdges" {...props}>');
    expect(code).not.toContain('shape-rendering');
    expect(code).not.toContain('xmlns');
    expect(code).toContain('<path fill="#1a1c2c"');
  });

  it('writes CSS with a background image and the colors as properties', () => {
    const code = codeOf('css', input);
    expect(code).toContain('--my-knight-2-ink: #1a1c2c;');
    expect(code).toContain('.my-knight-2 {');
    expect(code).toContain('width: 3px;');
    expect(code).toMatch(/url\("data:image\/svg\+xml,%3Csvg /);
    expect(code).not.toMatch(/url\("[^"]*[#<>]/);
  });

  it('uses input dimensions when the flat SVG has no explicit size', () => {
    const code = codeOf('css', {
      ...input,
      width: 7,
      height: 5,
      flatSvg: '<svg viewBox="0 0 7 5"></svg>',
    });

    expect(code).toContain('width: 7px;');
    expect(code).toContain('height: 5px;');
  });

  it('preserves alpha in generated color values and escapes JSON names', () => {
    const color = pack(1, 2, 3, 128);
    const named = { ...input, name: 'A "quoted" sprite', pixels: Uint32Array.from([color]) };

    expect(codeOf('css', named)).toContain('#01020380');

    expect(JSON.parse(codeOf('json', named)).name).toBe('A "quoted" sprite');
    expect(JSON.parse(codeOf('json', named)).colors).toEqual([{ name: 'ink', value: '#01020380' }]);
  });

  it('writes JSON that parses, with the pixels as color numbers', () => {
    const data = JSON.parse(codeOf('json', input));
    expect(data.width).toBe(3);
    expect(data.colors).toEqual([
      { name: 'ink', value: '#1a1c2c' },
      { name: 'red', value: '#e43b44' },
    ]);
    expect(data.pixels).toEqual([
      [1, 1, 1],
      [2, 2, 0],
    ]);
  });

  it('draws the sprite in characters, with a legend', () => {
    const code = codeOf('ascii', input);
    expect(code).toContain('# #1a1c2c ink');
    expect(code).toContain('@ #e43b44 red');
    expect(code.trim().split('\n').slice(-2)).toEqual(['###', '@@.']);
  });

  it('uses the final glyph for colors beyond the legend capacity', () => {
    const pixels = Uint32Array.from({ length: 80 }, (_, i) => pack(i + 1, i * 3, i * 5));
    const code = codeOf('ascii', { ...input, width: 80, height: 1, pixels });

    expect(code.trim().split('\n').at(-1)).toHaveLength(80);
    expect(code.trim().split('\n').at(-1)?.at(-1)).toBe('9');
  });

  it('gives the SVG as it is', () => {
    expect(codeOf('svg', { ...input, svg: '<svg/>' })).toBe('<svg/>');
  });
});
