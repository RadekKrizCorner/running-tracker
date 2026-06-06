import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RouteCandidate } from '../../lib/api/types';
import { useTranslation } from '../../lib/i18n';
import { EmptyState } from '../ui/EmptyState';

type RouteCandidateMapProps = {
  candidate: RouteCandidate | null;
};

export function RouteCandidateMap({ candidate }: RouteCandidateMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapError, setMapError] = useState(false);
  const coordinates = useMemo(() => candidate?.geometry.filter(isLatLng) ?? [], [candidate]);

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
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        map.on('load', () => {
          if (!map) {
            return;
          }
          map.addSource('route-candidate', {
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
            id: 'route-candidate-line',
            type: 'line',
            source: 'route-candidate',
            paint: {
              'line-color': '#2f66d0',
              'line-width': 4,
              'line-opacity': 0.92,
            },
          });
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
      map?.remove();
    };
  }, [coordinates]);

  if (!candidate || coordinates.length === 0) {
    return <EmptyState title={t('routes.noCandidateMap')} detail={t('routes.noCandidateMapDetail')} />;
  }

  return (
    <div className="activity-map route-candidate-map" data-testid="route-candidate-map">
      <div ref={containerRef} className="activity-map-canvas" aria-label={t('routes.candidateMap')} />
      <div className="activity-map-summary">
        <strong>{t('routes.routePreview')}</strong>
        <span>{coordinates.length} {t('routes.routePoints')}</span>
        {mapError ? <small>{t('map.previewUnavailable')}</small> : null}
      </div>
    </div>
  );
}

function isLatLng(value: unknown): value is [number, number] {
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
