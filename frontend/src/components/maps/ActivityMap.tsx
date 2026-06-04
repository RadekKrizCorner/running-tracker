import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '../ui/EmptyState';
import type { Stream } from '../../lib/api/types';
import { decodePolyline, type LatLng } from '../../lib/polyline';
import { useTranslation } from '../../lib/i18n';

type ActivityMapProps = {
  streams: Stream[];
  mapPolyline: string | null | undefined;
  highlightProgress?: number | null;
};

export function ActivityMap({ streams, mapPolyline, highlightProgress = null }: ActivityMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const highlightMarkerRef = useRef<MapLibreMarker | null>(null);
  const [mapError, setMapError] = useState(false);
  const coordinates = useMemo(() => routeCoordinates(streams, mapPolyline), [streams, mapPolyline]);
  const highlightCoordinate = useMemo(() => coordinateForProgress(coordinates, highlightProgress), [coordinates, highlightProgress]);

  useEffect(() => {
    if (!containerRef.current || coordinates.length === 0) {
      return undefined;
    }
    let map: MapLibreMap | null = null;
    let cancelled = false;
    async function renderMap() {
      if (!browserSupportsMapLibre()) {
        setMapError(true);
        return;
      }
      try {
        const maplibregl = (await import('maplibre-gl')).default;
        if (cancelled || !containerRef.current) {
          return;
        }
        const line = coordinates.map(([lat, lng]) => [lng, lat] as [number, number]);
        map = new maplibregl.Map({
          container: containerRef.current,
          style: osmStyle(),
          center: line[0],
          zoom: 12,
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        map.on('load', () => {
          if (!map) {
            return;
          }
          map.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: line,
              },
            },
          });
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            paint: {
              'line-color': '#256f5b',
              'line-width': 4,
              'line-opacity': 0.92,
            },
          });
          new maplibregl.Marker({ color: '#256f5b' }).setLngLat(line[0]).addTo(map);
          new maplibregl.Marker({ color: '#bf3b45' }).setLngLat(line[line.length - 1]).addTo(map);
          const bounds = line.reduce((nextBounds, point) => nextBounds.extend(point), new maplibregl.LngLatBounds(line[0], line[0]));
          map.fitBounds(bounds, { padding: 38, maxZoom: 15 });
        });
        setMapError(false);
      } catch (_error) {
        if (!cancelled) {
          setMapError(true);
        }
      }
    }
    void renderMap();
    return () => {
      cancelled = true;
      highlightMarkerRef.current?.remove();
      highlightMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [coordinates]);

  useEffect(() => {
    let cancelled = false;
    async function updateHighlightMarker() {
      const map = mapRef.current;
      if (!map || !highlightCoordinate) {
        highlightMarkerRef.current?.remove();
        highlightMarkerRef.current = null;
        return;
      }
      try {
        const maplibregl = (await import('maplibre-gl')).default;
        if (cancelled) {
          return;
        }
        const lngLat: [number, number] = [highlightCoordinate[1], highlightCoordinate[0]];
        if (highlightMarkerRef.current) {
          highlightMarkerRef.current.setLngLat(lngLat);
          return;
        }
        const markerElement = document.createElement('div');
        markerElement.className = 'activity-map-highlight';
        highlightMarkerRef.current = new maplibregl.Marker({ element: markerElement, anchor: 'center' }).setLngLat(lngLat).addTo(map);
      } catch (_error) {
        if (!cancelled) {
          highlightMarkerRef.current?.remove();
          highlightMarkerRef.current = null;
        }
      }
    }
    void updateHighlightMarker();
    return () => {
      cancelled = true;
    };
  }, [highlightCoordinate]);

  if (coordinates.length === 0) {
    return <EmptyState title={t('map.noGps')} detail={t('map.noGpsDetail')} />;
  }

  return (
    <div className="activity-map" data-testid="activity-map">
      <div ref={containerRef} className="activity-map-canvas" aria-label={t('map.activityRoute')} />
      <div className="activity-map-summary">
        <strong>{t('map.routeMap')}</strong>
        <span>{coordinates.length} {t('map.gpsPoints')}</span>
        {mapError ? <small>{t('map.previewUnavailable')}</small> : null}
      </div>
    </div>
  );
}

export function coordinateForProgress(coordinates: LatLng[], progress: number | null | undefined): LatLng | null {
  if (coordinates.length === 0 || typeof progress !== 'number' || !Number.isFinite(progress)) {
    return null;
  }
  const boundedProgress = Math.min(1, Math.max(0, progress));
  const coordinateIndex = Math.round(boundedProgress * (coordinates.length - 1));
  return coordinates[coordinateIndex] ?? null;
}

export function routeCoordinates(streams: Stream[], mapPolyline: string | null | undefined): LatLng[] {
  const latlng = streams.find((stream) => stream.stream_type === 'latlng');
  if (Array.isArray(latlng?.data)) {
    const coordinates = latlng.data.filter(isLatLng);
    if (coordinates.length > 0) {
      return coordinates;
    }
  }
  return decodePolyline(mapPolyline);
}

function isLatLng(value: unknown): value is LatLng {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function browserSupportsMapLibre() {
  return typeof window !== 'undefined' && typeof window.URL?.createObjectURL === 'function';
}

function osmStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
      },
    ],
  };
}
