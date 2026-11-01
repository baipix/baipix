import { flattenFrame } from '../../src/engine/composite';
import { DEFAULT_DURATION, frameCount } from '../../src/engine/frames';
import { renderGeometry, toSvg } from '../../src/engine/export/svg';
import { fileFromJson } from '../../src/storage/fileFormat';
import slimeFile from './art/slime.baipix?raw';

/** The slime's jump (docs/slime.baipix's twin): one board, 14 frames, rendered at build time. */
export const [slime] = fileFromJson(slimeFile);

export const slimeFrames = Array.from({ length: frameCount(slime) }, (_, f) => ({
  svg: toSvg(
    flattenFrame(slime, f),
    slime.width,
    slime.height,
    renderGeometry(slime.width, slime.height, 1, 0),
  ),
  duration: slime.frames?.[f].duration ?? DEFAULT_DURATION,
}));
