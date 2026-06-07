import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HeatmapBounds, HeatmapPoint } from '../../lib/api/types';
import { EmptyState } from '../ui/EmptyState';
import { useTranslation } from '../../lib/i18n';
import { osmStyle } from './mapStyle';

type RunHeatmapProps = {
  points: HeatmapPoint[];
  bounds: HeatmapBounds | null;
};

export function RunHeatmap({ points, bounds }: RunHeatmapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapError, setMapError] = useState(false);
  const maxWeight = useMemo(() => Math.max(...points.map((point) => point.weight), 1), [points]);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) {
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
        const center = mapCenter(points, bounds);
        map = new maplibregl.Map({
          container: containerRef.current,
          style: osmStyle(),
          center,
          zoom: 11,
          attributionControl: false,
        });
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        map.on('load', () => {
          if (!map) {
            return;
          }
          map.addSource('run-heatmap', {
            type: 'geojson',
            data: heatmapGeoJson(points),
          });
          map.addLayer({
            id: 'run-heatmap-layer',
            type: 'heatmap',
            source: 'run-heatmap',
            maxzoom: 16,
            paint: {
              'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, maxWeight, 1],
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 1.8],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 14, 14, 34],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.88, 16, 0.55],
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(37, 111, 91, 0)',
                0.25,
                '#6fbf73',
                0.5,
                '#f2c94c',
                0.75,
                '#f2994a',
                1,
                '#bf3b45',
              ],
            },
          });
          map.addLayer({
            id: 'run-heatmap-points',
            type: 'circle',
            source: 'run-heatmap',
            minzoom: 12,
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['get', 'weight'], 1, 3, maxWeight, 9],
              'circle-color': '#256f5b',
              'circle-opacity': 0.42,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#ffffff',
            },
          });
          if (bounds) {
            map.fitBounds(
              [
                [bounds.west, bounds.south],
                [bounds.east, bounds.north],
              ],
              { padding: 42, maxZoom: 14 },
            );
          }
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
  }, [bounds, maxWeight, points]);

  if (points.length === 0) {
    return <EmptyState title={t('heatmap.empty')} detail={t('heatmap.emptyDetail')} />;
  }

  return (
    <div className="activity-map run-heatmap" data-testid="run-heatmap">
      <div ref={containerRef} className="activity-map-canvas" aria-label={t('map.runningHeatmap')} />
      <div className="activity-map-summary">
        <strong>{t('map.routeDensity')}</strong>
        <span>{points.length} {t('heatmap.mapCells').toLowerCase()}</span>
        {mapError ? <small>{t('map.previewUnavailable')}</small> : null}
      </div>
      <div className="heatmap-legend" aria-label={t('map.heatmapLegend')}>
        <span>{t('map.less')}</span>
        <div />
        <span>{t('map.more')}</span>
      </div>
    </div>
  );
}

function heatmapGeoJson(points: HeatmapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      properties: {
        weight: point.weight,
        activity_count: point.activity_count,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [point.lng, point.lat],
      },
    })),
  };
}

function mapCenter(points: HeatmapPoint[], bounds: HeatmapBounds | null): [number, number] {
  if (bounds) {
    return [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];
  }
  const first = points[0];
  return [first.lng, first.lat];
}

function browserSupportsMapLibre() {
  return typeof window !== 'undefined' && typeof window.URL?.createObjectURL === 'function';
}
