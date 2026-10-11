/**
 * A drawing cut into tiles for game engines: one sheet of the tiles, and where each one goes to
 * draw the drawing again. Empty tiles and repeats can be left out of the sheet; the map still
 * rebuilds the drawing (an empty cell for an empty tile, the first copy for a repeat).
 */
export interface Tileset {
  tileWidth: number;
  tileHeight: number;
  /** The tiles, in reading order. */
  tiles: Uint32Array[];
  /** The sheet: the tiles in `columns` columns, as many rows as needed. */
  columns: number;
  sheet: Uint32Array;
  sheetWidth: number;
  sheetHeight: number;
  /** The drawing's cells, row by row: the index of their tile in `tiles`, or -1 for an empty one. */
  map: number[];
  mapColumns: number;
  mapRows: number;
}

export interface TilesetOptions {
  tileWidth: number;
  tileHeight: number;
  /** Leave empty tiles out of the sheet. */
  dropEmpty: boolean;
  /** Keep only the first of identical tiles. */
  dropRepeats: boolean;
}

/** Cuts `pixels` (`width` × `height`) into tiles. Cells past the edges are padded with transparency. */
export function cutTiles(pixels: Uint32Array, width: number, height: number, o: TilesetOptions): Tileset {
  const tw = Math.max(1, Math.round(o.tileWidth));
  const th = Math.max(1, Math.round(o.tileHeight));
  const mapColumns = Math.ceil(width / tw);
  const mapRows = Math.ceil(height / th);
  const tiles: Uint32Array[] = [];
  const seen = new Map<string, number>();
  const map: number[] = [];
  for (let row = 0; row < mapRows; row++)
    for (let col = 0; col < mapColumns; col++) {
      const tile = new Uint32Array(tw * th);
      let empty = true;
      for (let y = 0; y < th; y++)
        for (let x = 0; x < tw; x++) {
          const sx = col * tw + x;
          const sy = row * th + y;
          if (sx >= width || sy >= height) continue;
          const c = pixels[sy * width + sx];
          if (c >>> 24) empty = false;
          tile[y * tw + x] = c >>> 24 ? c : 0;
        }
      if (empty && o.dropEmpty) {
        map.push(-1);
        continue;
      }
      const key = o.dropRepeats ? tile.join(',') : '';
      const known = o.dropRepeats ? seen.get(key) : undefined;
      if (known !== undefined) {
        map.push(known);
        continue;
      }
      if (o.dropRepeats) seen.set(key, tiles.length);
      map.push(tiles.length);
      tiles.push(tile);
    }
  // As many columns as the drawing has, so a sheet with nothing left out is the drawing itself.
  const columns = Math.max(1, Math.min(mapColumns, tiles.length));
  const rows = Math.ceil(tiles.length / columns);
  const sheetWidth = columns * tw;
  const sheetHeight = Math.max(1, rows) * th;
  const sheet = new Uint32Array(sheetWidth * sheetHeight);
  tiles.forEach((tile, i) => {
    const ox = (i % columns) * tw;
    const oy = Math.floor(i / columns) * th;
    for (let y = 0; y < th; y++) sheet.set(tile.subarray(y * tw, (y + 1) * tw), (oy + y) * sheetWidth + ox);
  });
  return {
    tileWidth: tw,
    tileHeight: th,
    tiles,
    columns,
    sheet,
    sheetWidth,
    sheetHeight,
    map,
    mapColumns,
    mapRows,
  };
}

/** A Tiled tileset (.tsj, JSON) for the sheet `image`. */
export function tiledTileset(t: Tileset, name: string, image: string): string {
  return JSON.stringify(
    {
      type: 'tileset',
      version: '1.10',
      name,
      image,
      imagewidth: t.sheetWidth,
      imageheight: t.sheetHeight,
      tilewidth: t.tileWidth,
      tileheight: t.tileHeight,
      tilecount: t.tiles.length,
      columns: t.columns,
      margin: 0,
      spacing: 0,
    },
    null,
    2,
  );
}

/** A Tiled map (.tmj, JSON) that draws the drawing again from the tileset `tileset`. */
export function tiledMap(t: Tileset, tileset: string): string {
  return JSON.stringify(
    {
      type: 'map',
      version: '1.10',
      orientation: 'orthogonal',
      renderorder: 'right-down',
      infinite: false,
      width: t.mapColumns,
      height: t.mapRows,
      tilewidth: t.tileWidth,
      tileheight: t.tileHeight,
      nextlayerid: 2,
      nextobjectid: 1,
      tilesets: [{ firstgid: 1, source: tileset }],
      layers: [
        {
          id: 1,
          name: 'Tiles',
          type: 'tilelayer',
          width: t.mapColumns,
          height: t.mapRows,
          x: 0,
          y: 0,
          opacity: 1,
          visible: true,
          // Tiled numbers tiles from 1; 0 is an empty cell.
          data: t.map.map((i) => i + 1),
        },
      ],
    },
    null,
    2,
  );
}
