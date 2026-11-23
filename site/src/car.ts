import { flattenFrame } from '../../src/engine/composite';
import { DEFAULT_DURATION, frameCount } from '../../src/engine/frames';
import { renderGeometry, toSvg } from '../../src/engine/export/svg';
import { fileFromJson } from '../../src/storage/fileFormat';
import carFile from './art/car.baipix?raw';

/** The car of the animation guide: 16 frames, rendered at build time. */
export const [car] = fileFromJson(carFile);

export const carFrames = Array.from({ length: frameCount(car) }, (_, f) => ({
  svg: toSvg(flattenFrame(car, f), car.width, car.height, renderGeometry(car.width, car.height, 1, 0)),
  duration: car.frames?.[f].duration ?? DEFAULT_DURATION,
}));
