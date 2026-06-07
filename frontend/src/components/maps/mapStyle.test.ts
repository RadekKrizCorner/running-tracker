import { describe, expect, test } from 'vitest';
import { osmStyle } from './mapStyle';

describe('osmStyle', () => {
  test('uses the default OpenStreetMap raster tile source', () => {
    const style = osmStyle();

    expect(style.sources.osm).toMatchObject({
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      attribution: '© OpenStreetMap contributors',
    });
  });
});
