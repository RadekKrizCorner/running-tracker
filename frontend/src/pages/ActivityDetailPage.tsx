import { Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ActivityMap } from '../components/maps/ActivityMap';
import { EmptyState } from '../components/ui/EmptyState';
import { MetricCard } from '../components/ui/MetricCard';
import { useActivity, useActivitySplits, useActivityStreams, useSaveNote } from '../features/activities/api';
import type { ActivitySplit, HeartRateZoneBreakdownItem, Stream } from '../lib/api/types';
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
  formatPaceSeconds,
  formatSplitDuration,
  formatSplitPercentage,
} from '../lib/format';
import { enumLabel, useTranslation } from '../lib/i18n';

export function ActivityDetailPage() {
  const { t } = useTranslation();
  const { activityId } = useParams();
  const location = useLocation();
  const activity = useActivity(activityId);
  const streams = useActivityStreams(activityId);
  const splits = useActivitySplits(activityId);
  const saveNote = useSaveNote(activityId ?? '');
  const [notes, setNotes] = useState('');
  const [highlightProgress, setHighlightProgress] = useState<number | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const chartData = useMemo(() => buildChartSeries(streams.data ?? []), [streams.data]);

  useEffect(() => {
    setNotes(activity.data?.note?.notes ?? '');
  }, [activity.data?.id, activity.data?.note?.notes]);

  useEffect(() => {
    const focusTarget = new URLSearchParams(location.search).get('focus');
    if (focusTarget !== 'notes' || !activity.data?.id) {
      return;
    }
    notesRef.current?.scrollIntoView?.({ block: 'center' });
    notesRef.current?.focus();
  }, [activity.data?.id, location.search]);

  useEffect(() => {
    if (highlightProgress === null) {
      return undefined;
    }
    function clearMapHighlight(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest('.mini-stream-chart')) {
        return;
      }
      setHighlightProgress(null);
    }
    window.addEventListener('mousemove', clearMapHighlight);
    return () => window.removeEventListener('mousemove', clearMapHighlight);
  }, [highlightProgress]);

  if (activity.isLoading) {
    return <div className="screen-center">{t('activity.loading')}</div>;
  }

  if (!activity.data) {
    return <EmptyState title={t('activity.notFound')} detail={t('activity.notFoundDetail')} />;
  }

  const run = activity.data;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{formatDate(run.start_time_utc)}</p>
          <h1>{run.name ?? t('activity.run')}</h1>
        </div>
        <span className={`badge ${run.intensity_class ?? 'unknown'}`}>{enumLabel(t, 'intensity', run.intensity_class ?? 'unknown')}</span>
      </header>

      <section className="metric-grid">
        <MetricCard label={t('common.distance')} value={formatDistance(run.distance_m)} />
        <MetricCard label={t('dashboard.movingTime')} value={formatDuration(run.moving_time_s)} />
        <MetricCard label={t('common.pace')} value={formatPace(run.distance_m, run.moving_time_s)} />
        <MetricCard label={t('activity.avgHr')} value={run.average_hr ? `${Math.round(run.average_hr)} bpm` : t('common.notAvailable')} />
        <MetricCard label={t('common.load')} value={`${Math.round(run.computed_load ?? 0)}`} detail={run.load_source ?? t('dashboard.transparentEstimate')} />
        <MetricCard label={t('common.elevation')} value={`${Math.round(run.elevation_gain_m ?? 0)} m`} detail={elevationSourceLabel(run.elevation_gain_source, t)} />
      </section>

      <section className="split-grid activity-detail-stream-layout">
        <div className="panel activity-map-panel">
          <h2>{t('activity.map')}</h2>
          <ActivityMap streams={streams.data ?? []} mapPolyline={run.map_polyline} highlightProgress={highlightProgress} />
        </div>
        <div className="panel activity-stream-panel">
          <h2>{t('activity.workoutStreams')}</h2>
          {chartData.pace.length > 0 || chartData.heartrate.length > 0 || chartData.elevation.length > 0 ? (
            <div className="stream-chart-stack">
              <MiniStreamChart
                title={`${t('common.pace')} (min/km)`}
                data={chartData.pace}
                color="#2f66d0"
                formatter={formatPaceValue}
                domainOptions={PACE_DOMAIN_OPTIONS}
                yAxisWidth={78}
                onHighlightProgress={setHighlightProgress}
              />
              <MiniStreamChart
                title={`${t('activity.avgHr')} (bpm)`}
                data={chartData.heartrate}
                color="#bf3b45"
                formatter={(value) => `${Math.round(value)} bpm`}
                domainOptions={HEART_RATE_DOMAIN_OPTIONS}
                yAxisWidth={64}
                onHighlightProgress={setHighlightProgress}
              />
              <MiniStreamChart
                title={`${t('common.elevation')} (m)`}
                data={chartData.elevation}
                color="#256f5b"
                formatter={(value) => `${Math.round(value)} m`}
                domainOptions={ELEVATION_DOMAIN_OPTIONS}
                yAxisWidth={62}
                onHighlightProgress={setHighlightProgress}
              />
            </div>
          ) : (
            <EmptyState title={t('activity.noStreams')} detail={t('activity.noStreamsDetail')} />
          )}
        </div>
      </section>

      <section className="split-grid">
        <SplitsPanel splits={splits.data?.splits ?? []} source={splits.data?.source ?? 'activity_summary'} />
        <HeartRateZonePanel zones={run.heart_rate_zone_breakdown ?? []} />
      </section>

      <TrailEffortPanel distanceM={run.distance_m} elevationGainM={run.elevation_gain_m} load={run.computed_load} />

      <section className="panel">
        <h2>{t('common.notes')}</h2>
        <textarea
          ref={notesRef}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={5}
          placeholder={t('activity.notesPlaceholder')}
        />
        <button
          className="primary-button"
          type="button"
          onClick={() => saveNote.mutate({ notes: notes.trim() ? notes : null })}
          disabled={saveNote.isPending}
        >
          <Save size={16} />
          {t('activity.saveNotes')}
        </button>
      </section>
    </div>
  );
}

function HeartRateZonePanel({ zones }: { zones: HeartRateZoneBreakdownItem[] }) {
  const { t } = useTranslation();
  const totalSeconds = zones.reduce((total, zone) => total + zone.seconds, 0);
  return (
    <section className="panel hr-zone-breakdown-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('activity.hrZoneBreakdown')}</p>
          <h2>{t('activity.hrZones')}</h2>
        </div>
        {zones.length > 0 ? <span className="badge">{formatSplitDuration(totalSeconds)}</span> : null}
      </div>
      {zones.length > 0 ? (
        <>
          <div className="hr-zone-breakdown-bar" aria-label={t('activity.hrZoneBreakdown')}>
            {zones.map((zone) => (
              <span
                key={zone.zone_index}
                style={{
                  width: `${Math.max(zone.percentage, zone.seconds > 0 ? 3 : 0)}%`,
                  ...heartRateZoneStyle(zone.zone_index),
                }}
              />
            ))}
          </div>
          <div className="hr-zone-breakdown-list">
            {zones.map((zone) => (
              <div className="hr-zone-breakdown-row" key={zone.zone_index}>
                <span className="legend-dot" style={heartRateZoneStyle(zone.zone_index)} />
                <strong>{zone.name} {zone.min_hr}-{zone.max_hr} bpm</strong>
                <span className="hr-zone-breakdown-time">{formatSplitDuration(zone.seconds)}</span>
                <span className="hr-zone-breakdown-percent">{formatSplitPercentage(zone.percentage)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title={t('activity.noHrZones')} detail={t('activity.noHrZonesDetail')} />
      )}
    </section>
  );
}

function SplitsPanel({ splits, source }: { splits: ActivitySplit[]; source: string }) {
  const { t } = useTranslation();
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{source === 'streams' ? t('activity.streamBased') : t('activity.summaryBased')}</p>
          <h2>{t('activity.splits')}</h2>
        </div>
      </div>
      {splits.length > 0 ? (
        <div className="responsive-table compact">
          <table>
            <thead>
              <tr>
                <th>{t('activity.splits')}</th>
                <th>{t('common.distance')}</th>
                <th>{t('common.time')}</th>
                <th>{t('common.pace')}</th>
                <th>HR</th>
                <th>{t('dashboard.gain')}</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((split) => (
                <tr key={split.split_index}>
                  <td>{split.split_index}</td>
                  <td>{formatDistance(split.distance_m)}</td>
                  <td>{formatDuration(split.duration_s)}</td>
                  <td>{split.pace_s_per_km ? formatPaceValue(split.pace_s_per_km / 60) : 'n/a'}</td>
                  <td>{split.average_hr ? `${Math.round(split.average_hr)} bpm` : t('common.notAvailable')}</td>
                  <td>{Math.round(split.elevation_gain_m)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={t('activity.noSplits')} detail={t('activity.noSplitsDetail')} />
      )}
    </section>
  );
}

function TrailEffortPanel({
  distanceM,
  elevationGainM,
  load,
}: {
  distanceM: number | null | undefined;
  elevationGainM: number | null | undefined;
  load: number | null | undefined;
}) {
  const { t } = useTranslation();
  const distanceKm = (distanceM ?? 0) / 1000;
  const gainPerKm = distanceKm > 0 ? (elevationGainM ?? 0) / distanceKm : 0;
  const adjustmentFactor = Math.min(0.35, Math.max(0, gainPerKm / 150));
  const adjustedLoad = (load ?? 0) * (1 + adjustmentFactor);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('activity.elevationContext')}</p>
          <h2>{t('activity.elevationAdjustedEffort')}</h2>
        </div>
        <span className="badge">{Math.round(gainPerKm)} m/km</span>
      </div>
      <div className="event-prep-snapshot">
        <MetricCard label={t('activity.climbDensity')} value={`${Math.round(gainPerKm)} m/km`} />
        <MetricCard label={t('activity.adjustedLoad')} value={`${Math.round(adjustedLoad)}`} detail={t('dashboard.transparentEstimate')} />
      </div>
      <p className="helper-text">{t('activity.elevationEstimateHelp')}</p>
    </section>
  );
}

type ChartPoint = {
  index: number;
  progress: number;
  value: number;
};

type VelocityPaceSample = {
  index: number;
  progress: number;
  speed: number;
};

type ChartDomainOptions = {
  minSpan: number;
  clipOutliers?: boolean;
};

const PACE_DOMAIN_OPTIONS = { minSpan: 1, clipOutliers: true } satisfies ChartDomainOptions;
const HEART_RATE_DOMAIN_OPTIONS = { minSpan: 8 } satisfies ChartDomainOptions;
const ELEVATION_DOMAIN_OPTIONS = { minSpan: 8 } satisfies ChartDomainOptions;
// Keep pace charts focused on plausible running samples instead of GPS or pause artifacts.
const MIN_READABLE_PACE_MIN_PER_KM = 2;
const MAX_READABLE_PACE_MIN_PER_KM = 30;
const PACE_SMOOTHING_WINDOW = 15;
const MAX_PACE_CHART_POINTS = 320;

export function buildChartSeries(streams: Stream[]) {
  const byType = new Map(streams.map((stream) => [stream.stream_type, Array.isArray(stream.data) ? stream.data : []]));
  return {
    pace: paceSeries(byType.get('distance') ?? [], byType.get('time') ?? [], byType.get('velocity_smooth') ?? [], byType.get('moving') ?? []),
    heartrate: numericSeries(byType.get('heartrate') ?? []),
    elevation: numericSeries(byType.get('elevation_corrected') ?? byType.get('altitude') ?? []),
  };
}

function elevationSourceLabel(source: string | null | undefined, t: (key: string) => string) {
  if (source === 'dem_corrected') {
    return t('activity.elevationCorrected');
  }
  if (source === 'strava') {
    return t('activity.elevationProvider');
  }
  return t('activity.elevationRecorded');
}

function numericSeries(values: unknown[]): ChartPoint[] {
  return values
    .map((value, index) => ({ index, progress: progressForIndex(index, values.length), value }))
    .filter((point): point is ChartPoint => typeof point.value === 'number' && Number.isFinite(point.value));
}

function paceSeries(distance: unknown[], time: unknown[], velocity: unknown[], moving: unknown[]): ChartPoint[] {
  const velocitySamples = velocityPaceSamples(distance, velocity, moving);
  if (velocitySamples.length > 0) {
    return limitPacePoints(smoothedVelocityPacePoints(readableVelocitySamples(velocitySamples)));
  }
  if (distance.length > 1 && time.length > 1) {
    const totalDistance = distanceTotal(distance);
    const deltaPoints = distance
      .map((value, index) => {
        if (
          index === 0 ||
          !isMovingSample(moving, index) ||
          typeof value !== 'number' ||
          typeof distance[index - 1] !== 'number' ||
          typeof time[index] !== 'number' ||
          typeof time[index - 1] !== 'number'
        ) {
          return null;
        }
        const deltaKm = (value - Number(distance[index - 1])) / 1000;
        const deltaSeconds = Number(time[index]) - Number(time[index - 1]);
        if (deltaKm <= 0 || deltaSeconds <= 0) {
          return null;
        }
        return { index, progress: totalDistance > 0 ? value / totalDistance : progressForIndex(index, distance.length), value: deltaSeconds / 60 / deltaKm };
      })
      .filter((point): point is ChartPoint => point !== null);
    return limitPacePoints(smoothedPacePoints(readablePacePoints(deltaPoints)));
  }
  return [];
}

function velocityPaceSamples(distance: unknown[], velocity: unknown[], moving: unknown[]): VelocityPaceSample[] {
  const totalDistance = distanceTotal(distance);
  return velocity
    .map((value, index) => {
      if (!isMovingSample(moving, index) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
      }
      return { index, progress: progressForStreamIndex(distance, index, velocity.length, totalDistance), speed: value };
    })
    .filter((sample): sample is VelocityPaceSample => sample !== null);
}

function readablePacePoints(points: ChartPoint[]): ChartPoint[] {
  const filtered = points.filter((point) => point.value >= MIN_READABLE_PACE_MIN_PER_KM && point.value <= MAX_READABLE_PACE_MIN_PER_KM);
  return filtered.length > 0 ? filtered : points;
}

function readableVelocitySamples(samples: VelocityPaceSample[]): VelocityPaceSample[] {
  const filtered = samples.filter((sample) => {
    const pace = paceMinutesPerKmForSpeed(sample.speed);
    return pace >= MIN_READABLE_PACE_MIN_PER_KM && pace <= MAX_READABLE_PACE_MIN_PER_KM;
  });
  return filtered.length > 0 ? filtered : samples;
}

function smoothedVelocityPacePoints(samples: VelocityPaceSample[]): ChartPoint[] {
  const radius = Math.floor(PACE_SMOOTHING_WINDOW / 2);
  return samples.map((sample, index) => {
    const [start, end] = smoothingBounds(index, samples.length, radius);
    let speedTotal = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      speedTotal += samples[sampleIndex].speed;
    }
    return {
      index: sample.index,
      progress: sample.progress,
      value: paceMinutesPerKmForSpeed(speedTotal / (end - start)),
    };
  });
}

function smoothedPacePoints(points: ChartPoint[]): ChartPoint[] {
  const radius = Math.floor(PACE_SMOOTHING_WINDOW / 2);
  return points.map((point, index) => {
    const [start, end] = smoothingBounds(index, points.length, radius);
    let paceTotal = 0;
    for (let pointIndex = start; pointIndex < end; pointIndex += 1) {
      paceTotal += points[pointIndex].value;
    }
    return { ...point, value: paceTotal / (end - start) };
  });
}

function smoothingBounds(index: number, length: number, radius: number): [number, number] {
  return [Math.max(0, index - radius), Math.min(length, index + radius + 1)];
}

function limitPacePoints(points: ChartPoint[]): ChartPoint[] {
  if (points.length <= MAX_PACE_CHART_POINTS) {
    return points;
  }
  const step = Math.ceil(points.length / MAX_PACE_CHART_POINTS);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
}

function paceMinutesPerKmForSpeed(speedMps: number) {
  return 1000 / speedMps / 60;
}

function isMovingSample(moving: unknown[], index: number) {
  return moving[index] !== false;
}

function progressForStreamIndex(distance: unknown[], index: number, length: number, totalDistance: number) {
  const distanceValue = distance[index];
  if (totalDistance > 0 && typeof distanceValue === 'number' && Number.isFinite(distanceValue)) {
    return distanceValue / totalDistance;
  }
  return progressForIndex(index, length);
}

function progressForIndex(index: number, length: number) {
  if (length <= 1) {
    return 0;
  }
  return index / (length - 1);
}

function distanceTotal(distance: unknown[]) {
  const numericDistance = distance.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numericDistance.length < 2) {
    return 0;
  }
  return Math.max(0, numericDistance[numericDistance.length - 1] - numericDistance[0]);
}

export function chartValueDomain(data: ChartPoint[], options: ChartDomainOptions): [number, number] {
  const values = data.map((point) => point.value).filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (values.length === 0) {
    return [0, options.minSpan];
  }
  const [lowerValue, upperValue] = options.clipOutliers ? clippedOutlierBounds(values) : [values[0], values[values.length - 1]];
  const span = upperValue - lowerValue;
  if (span < options.minSpan) {
    const center = (lowerValue + upperValue) / 2;
    return [roundDomainValue(Math.max(0, center - options.minSpan / 2)), roundDomainValue(center + options.minSpan / 2)];
  }
  const padding = span * 0.1;
  return [roundDomainValue(Math.max(0, lowerValue - padding)), roundDomainValue(upperValue + padding)];
}

function clippedOutlierBounds(values: number[]): [number, number] {
  const median = percentile(values, 0.5);
  const lowerValue = median > 0 && values[0] < median * 0.45 ? percentile(values, 0.1) : values[0];
  const upperValue = median > 0 && values[values.length - 1] > median * 1.8 ? percentile(values, 0.9) : values[values.length - 1];
  return [lowerValue, upperValue];
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 1) {
    return values[0];
  }
  const boundedPercentile = Math.min(1, Math.max(0, percentileValue));
  const position = boundedPercentile * (values.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) {
    return values[lowerIndex];
  }
  const ratio = position - lowerIndex;
  return values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * ratio;
}

function roundDomainValue(value: number) {
  return Math.round(value * 100) / 100;
}

function heartRateZoneStyle(index: number) {
  const colors = ['#256f5b', '#5d8f3f', '#d17b0f', '#bf6b2f', '#bf3b45'];
  return { background: colors[index] ?? '#8b9790' };
}

function MiniStreamChart({
  title,
  data,
  color,
  formatter,
  domainOptions,
  yAxisWidth,
  onHighlightProgress,
}: {
  title: string;
  data: ChartPoint[];
  color: string;
  formatter: (value: number) => string;
  domainOptions: ChartDomainOptions;
  yAxisWidth: number;
  onHighlightProgress: (progress: number | null) => void;
}) {
  const { t } = useTranslation();
  const domain = useMemo(() => chartValueDomain(data, domainOptions), [data, domainOptions]);
  return (
    <div className="mini-stream-chart" onMouseLeave={() => onHighlightProgress(null)}>
      <div className="chart-legend compact">
        <span className="legend-dot" style={{ background: color }} />
        <strong>{title}</strong>
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart
            data={data}
            margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
            onMouseLeave={() => onHighlightProgress(null)}
            onMouseMove={(state) => {
              const index = Number(state.activeTooltipIndex);
              const point = Number.isFinite(index) ? data[index] : null;
              if (isChartPoint(point)) {
                onHighlightProgress(point.progress);
              }
            }}
          >
            <XAxis dataKey="index" hide />
            <YAxis
              width={yAxisWidth}
              domain={domain}
              allowDataOverflow={Boolean(domainOptions.clipOutliers)}
              tickCount={4}
              tickFormatter={(value) => formatter(Number(value))}
              tickMargin={8}
            />
            <Tooltip formatter={(value) => formatter(Number(value))} labelFormatter={() => title} />
            <Line dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <small>{t('activity.noStreamFor', { name: title })}</small>
      )}
    </div>
  );
}

function isChartPoint(value: unknown): value is ChartPoint {
  return typeof value === 'object' && value !== null && 'progress' in value && typeof (value as ChartPoint).progress === 'number';
}

function formatPaceValue(value: number) {
  return formatPaceSeconds(value * 60);
}
