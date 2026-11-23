import { flatten } from '../../src/engine/composite';
import { renderGeometry, toSvg } from '../../src/engine/export/svg';
import { fileFromJson } from '../../src/storage/fileFormat';
import hobbitFile from './art/hobbit-house.baipix?raw';

/** The hobbit house in four seasons: one file, four boards, each rendered at build time. */
export const hobbitBoards = fileFromJson(hobbitFile).map((doc) => ({
  name: doc.name,
  svg: toSvg(flatten(doc), doc.width, doc.height, renderGeometry(doc.width, doc.height, 1, 0)),
  width: doc.width,
  height: doc.height,
}));
