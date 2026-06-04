import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AerobicTrendPoint, WeeklyMetric } from '../../lib/api/types';
import { formatDuration, formatPace, formatShortDate } from '../../lib/format';
import { useTranslation } from '../../lib/i18n';

type WeeklyChartsProps = {
  weekly: WeeklyMetric[];
};

export function WeeklyLoadVolumeChart({ weekly }: WeeklyChartsProps) {
  const { t } = useTranslation();
  const data = weekly.map((week) => ({
    ...week,
    distance_km: Number(week.distance_m) / 1000,
    moving_time_h: Number(week.moving_time_s) / 3600,
  }));
  return (
    <div className="chart-box">
      <h2>{t('charts.weeklyLoadVolume')}</h2>
      <ChartLegend
        items={[
          { label: t('charts.distanceKm'), color: '#256f5b' },
          { label: t('charts.timeHours'), color: '#2f66d0' },
        ]}
      />
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week_start_date" tickFormatter={(value) => formatShortDate(String(value))} />
          <YAxis yAxisId="distance" tickFormatter={(value) => `${Number(value).toFixed(0)} km`} />
          <YAxis yAxisId="time" orientation="right" tickFormatter={(value) => `${Number(value).toFixed(1)} h`} />
          <Tooltip
            formatter={(value, name) =>
              name === t('charts.timeHours') ? `${Number(value).toFixed(1)} h` : `${Number(value).toFixed(1)} km`
            }
            labelFormatter={(value) => formatShortDate(String(value))}
          />
          <Bar yAxisId="distance" dataKey="distance_km" name={t('charts.distanceKm')} fill="#256f5b" radius={[4, 4, 0, 0]} />
          <Line yAxisId="time" type="monotone" dataKey="moving_time_h" name={t('charts.timeHours')} stroke="#2f66d0" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyLoadChart({ weekly }: WeeklyChartsProps) {
  const { t } = useTranslation();
  const data = weekly.map((week) => ({
    ...week,
    weekly_load: Number(week.load),
    baseline_load: Number(week.chronic_load) / 4,
  }));
  return (
    <div className="chart-box">
      <h2>{t('charts.loadTrend')}</h2>
      <p className="chart-note">{t('charts.loadNote')}</p>
      <ChartLegend
        items={[
          { label: t('charts.weeklyLoad'), color: '#2f66d0' },
          { label: t('charts.loadBaseline'), color: '#d17b0f' },
        ]}
      />
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week_start_date" tickFormatter={(value) => formatShortDate(String(value))} />
          <YAxis />
          <Tooltip formatter={(value) => Math.round(Number(value))} labelFormatter={(value) => formatShortDate(String(value))} />
          <Bar dataKey="weekly_load" name={t('charts.weeklyLoad')} fill="#2f66d0" radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="baseline_load" name={t('charts.loadBaseline')} stroke="#d17b0f" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyElevationChart({ weekly }: WeeklyChartsProps) {
  const { t } = useTranslation();
  const data = weekly.map((week) => ({
    ...week,
    elevation_gain_m: Number(week.elevation_gain_m),
    elevation_gain_per_km: Number(week.distance_m) > 0 ? Number(week.elevation_gain_m) / (Number(week.distance_m) / 1000) : 0,
  }));
  return (
    <div className="chart-box wide">
      <h2>{t('trends.elevationTrend')}</h2>
      <p className="chart-note">{t('charts.elevationTrendNote')}</p>
      <ChartLegend
        items={[
          { label: t('charts.gainMeters'), color: '#5d8f3f' },
          { label: t('charts.gainPerKm'), color: '#bf6b2f' },
        ]}
      />
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week_start_date" tickFormatter={(value) => formatShortDate(String(value))} />
          <YAxis yAxisId="gain" tickFormatter={(value) => `${Math.round(Number(value))} m`} />
          <YAxis yAxisId="perKm" orientation="right" tickFormatter={(value) => `${Math.round(Number(value))} m/km`} />
          <Tooltip
            formatter={(value, name) =>
              name === t('charts.gainPerKm') ? `${Math.round(Number(value))} m/km` : `${Math.round(Number(value))} m`
            }
            labelFormatter={(value) => formatShortDate(String(value))}
          />
          <Bar yAxisId="gain" dataKey="elevation_gain_m" name={t('charts.gainMeters')} fill="#5d8f3f" radius={[4, 4, 0, 0]} />
          <Line yAxisId="perKm" type="monotone" dataKey="elevation_gain_per_km" name={t('charts.gainPerKm')} stroke="#bf6b2f" strokeWidth={2} dot />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DurabilityChart({ weekly }: WeeklyChartsProps) {
  const { t } = useTranslation();
  const data = buildDurabilityChartData(weekly);
  return (
    <div className="chart-box">
      <h2>{t('trends.durability')}</h2>
      <ChartLegend
        items={[
          { label: t('charts.longestRunKm'), color: '#256f5b' },
          { label: t('charts.longRunShare'), color: '#d17b0f' },
        ]}
      />
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week_start_date" tickFormatter={(value) => formatShortDate(String(value))} />
          <YAxis yAxisId="distance" tickFormatter={(value) => `${Number(value).toFixed(0)} km`} />
          <YAxis yAxisId="share" orientation="right" tickFormatter={(value) => `${Math.round(Number(value))}%`} />
          <Tooltip
            formatter={(value, name) =>
              name === t('charts.longRunShare') ? `${Math.round(Number(value))}%` : `${Number(value).toFixed(1)} km`
            }
            labelFormatter={(value) => formatShortDate(String(value))}
          />
          <Bar yAxisId="distance" dataKey="long_run_km" name={t('charts.longestRunKm')} fill="#256f5b" radius={[4, 4, 0, 0]} />
          <Line yAxisId="share" type="monotone" dataKey="long_run_share" name={t('charts.longRunShare')} stroke="#d17b0f" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function buildDurabilityChartData(weekly: WeeklyMetric[]) {
  return weekly.map((week) => ({
    ...week,
    long_run_km: Number(week.long_run_distance_m) / 1000,
    long_run_share: Number(week.distance_m) > 0 ? (Number(week.long_run_distance_m) / Number(week.distance_m)) * 100 : 0,
  }));
}

type EasyRunEfficiencyChartProps = {
  points: AerobicTrendPoint[];
};

export function EasyRunEfficiencyChart({ points }: EasyRunEfficiencyChartProps) {
  const { t } = useTranslation();
  const data = points.map((point) => ({
    ...point,
    pace_s_per_km: Number(point.pace_s_per_km),
    average_hr: point.average_hr === null ? null : Number(point.average_hr),
    elevation_gain_per_km: Number(point.elevation_gain_per_km ?? 0),
  }));
  return (
    <div className="chart-box">
      <h2>{t('trends.easyEfficiency')}</h2>
      {data.length > 0 ? (
        <>
          <ChartLegend
            items={[
              { label: t('charts.pace'), color: '#256f5b' },
              { label: t('charts.heartRate'), color: '#bf3b45' },
            ]}
          />
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(value) => formatShortDate(String(value))} />
              <YAxis yAxisId="pace" tickFormatter={(value) => formatPace(1000, Number(value))} />
              <YAxis yAxisId="hr" orientation="right" tickFormatter={(value) => `${Math.round(Number(value))}`} />
              <Tooltip content={<EasyRunTooltip />} labelFormatter={(value) => formatShortDate(String(value))} />
              <Line yAxisId="pace" type="monotone" dataKey="pace_s_per_km" name={t('charts.pace')} stroke="#256f5b" strokeWidth={2} dot />
              <Line yAxisId="hr" type="monotone" dataKey="average_hr" name={t('charts.heartRate')} stroke="#bf3b45" strokeWidth={2} dot connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </>
      ) : (
        <p className="chart-note">{t('trends.noEasyTrendDetail')}</p>
      )}
    </div>
  );
}

function EasyRunTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: AerobicTrendPoint }[]; label?: string }) {
  const { t } = useTranslation();
  if (!active || !payload?.length) {
    return null;
  }
  const point = payload[0].payload;
  return (
    <div className="recharts-default-tooltip">
      <p className="recharts-tooltip-label">{formatShortDate(String(label))}</p>
      <p>{t('charts.pace')}: {formatPace(1000, Number(point.pace_s_per_km))}</p>
      <p>{t('charts.heartRate')}: {point.average_hr === null ? t('common.notAvailable') : Math.round(Number(point.average_hr))}</p>
      <p>{t('charts.elevationPerKm')}: {Math.round(Number(point.elevation_gain_per_km ?? 0))} m/km</p>
    </div>
  );
}

export function WeeklyDistanceChart({ weekly }: WeeklyChartsProps) {
  return <WeeklyLoadVolumeChart weekly={weekly} />;
}

export function IntensityChart({ weekly }: WeeklyChartsProps) {
  const { t } = useTranslation();
  const unknownTime = weekly.reduce((total, week) => total + (week.unknown_time_s ?? 0), 0);
  const knownTime = weekly.reduce((total, week) => total + week.easy_time_s + week.moderate_time_s + week.hard_time_s, 0);
  return (
    <div className="chart-box">
      <h2>{t('charts.intensitySplit')}</h2>
      <ChartLegend
        items={[
          { label: t('intensity.easy'), color: '#256f5b' },
          { label: t('intensity.moderate'), color: '#d17b0f' },
          { label: t('intensity.hard'), color: '#bf3b45' },
          { label: t('intensity.unknown'), color: '#8b9790' },
        ]}
      />
      {unknownTime > 0 ? (
        <p className="chart-note">
          {knownTime > 0
            ? t('charts.unknownBecause', { duration: formatDuration(unknownTime) })
            : t('charts.intensityNeeds', { duration: formatDuration(unknownTime) })}
        </p>
      ) : null}
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={weekly}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week_start_date" tickFormatter={(value) => formatShortDate(String(value))} />
          <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 3600)}h`} />
          <Tooltip formatter={(value) => `${Math.round(Number(value) / 60)} min`} labelFormatter={(value) => formatShortDate(String(value))} />
          <Bar dataKey="easy_time_s" name={t('intensity.easy')} stackId="a" fill="#256f5b" />
          <Bar dataKey="moderate_time_s" name={t('intensity.moderate')} stackId="a" fill="#d17b0f" />
          <Bar dataKey="hard_time_s" name={t('intensity.hard')} stackId="a" fill="#bf3b45" />
          <Bar dataKey="unknown_time_s" name={t('intensity.unknown')} stackId="a" fill="#8b9790" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.label}>
          <span className="legend-dot" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
