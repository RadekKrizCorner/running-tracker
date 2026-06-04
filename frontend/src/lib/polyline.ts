export type LatLng = [number, number];

export function decodePolyline(value: string | null | undefined): LatLng[] {
  if (!value) {
    return [];
  }
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates: LatLng[] = [];

  while (index < value.length) {
    const latChange = decodeChunk(value, index);
    index = latChange.nextIndex;
    const lngChange = decodeChunk(value, index);
    index = lngChange.nextIndex;
    latitude += latChange.value;
    longitude += lngChange.value;
    coordinates.push([latitude / 1e5, longitude / 1e5]);
  }

  return coordinates;
}

function decodeChunk(value: string, startIndex: number) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte = 0;

  do {
    byte = value.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < value.length);

  return {
    value: result & 1 ? ~(result >> 1) : result >> 1,
    nextIndex: index,
  };
}
