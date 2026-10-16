import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import {
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
  it('names colors plainly, most used first, without twins', () => {
    expect(colorName(INK)).toBe('ink');
    expect(colorName(pack(255, 255, 255))).toBe('paper');
    expect(colorName(RED)).toBe('red');
    expect(colorName(pack(59, 93, 201))).toBe('blue');
    expect(namedColors(pixels).map((c) => c.name)).toEqual(['ink', 'red']);
    const twins = namedColors(Uint32Array.from([RED, pack(230, 60, 70)]));
    expect(twins.map((c) => c.name)).toEqual(['red', 'red-2']);
  });

  it('makes names fit for a component and a class', () => {
    expect(componentName('My knight 2')).toBe('MyKnight2');
    expect(componentName('2 tiles')).toBe('Sprite2Tiles');
    expect(componentName('')).toBe('Sprite');
    expect(className('My knight 2')).toBe('my-knight-2');
    expect(className('Été 2026')).toBe('ete-2026');
    expect(className('')).toBe('sprite');
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

  it('gives the SVG as it is', () => {
    expect(codeOf('svg', { ...input, svg: '<svg/>' })).toBe('<svg/>');
  });
});
