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
import type { TrendMetricWeek } from '../../lib/api/types';
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
  formatShortDate,
  formatSplitPercentage,
} from '../../lib/format';
import { useTranslation } from '../../lib/i18n';

const ZONE_COLORS = ['#256f5b', '#5d8f3f', '#d17b0f', '#bf6b2f', '#bf3b45'];

type TrendSignalsPanelProps = {
  weekly: TrendMetricWeek[];
};

export function TrendSignalsPanel({ weekly }: TrendSignalsPanelProps) {
  const { t } = useTranslation();
  return (
    <section className="trend-signals-section">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('trends.trainingSignalsEyebrow')}</p>
          <h2>{t('trends.trainingSignals')}</h2>
        </div>
      </div>
      <div className="trend-signal-grid">
        <ZoneBreakdownTrendChart weekly={weekly} />
        <EasyPaceTrendChart weekly={weekly} />
        <TrendSummaryPanel weekly={weekly} />
        <ZonePacePanel weekly={weekly} />
        <PlanRealityPanel weekly={weekly} />
        <CoachEffectPanel weekly={weekly} />
      </div>
    </section>
  );
}

function ZoneBreakdownTrendChart({ weekly }: TrendSignalsPanelProps) {
  const { t } = useTranslation();
  const data = weekly.map((week) => ({
    week_start_date: week.week_start_date,
    z1_h: (week.zone_seconds[0] ?? 0) / 3600,
    z2_h: (week.zone_seconds[1] ?? 0) / 3600,
    z3_h: (week.zone_seconds[2] ?? 0) / 3600,
    z4_h: (week.zone_seconds[3] ?? 0) / 3600,
    z5_h: (week.zone_seconds[4] ?? 0) / 3600,
  }));
  return (
    <div className="chart-box">
      <h2>{t('trends.hrZonesOverTime')}</h2>
      <TrendZoneLegend />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week_start_date" tickFormatter={(value) => formatShortDate(String(value))} />
          <YAxis tickFormatter={(value) => `${Number(value).toFixed(1)} h`} />
          <Tooltip
            formatter={(value) => `${Number(value).toFixed(1)} h`}
            labelFormatter={(value) => formatShortDate(String(value))}
          />
          <Bar dataKey="z1_h" name="Z1" stackId="zones" fill={ZONE_COLORS[0]} />
          <Bar dataKey="z2_h" name="Z2" stackId="zones" fill={ZONE_COLORS[1]} />
          <Bar dataKey="z3_h" name="Z3" stackId="zones" fill={ZONE_COLORS[2]} />
          <Bar dataKey="z4_h" name="Z4" stackId="zones" fill={ZONE_COLORS[3]} />
          <Bar dataKey="z5_h" name="Z5" stackId="zones" fill={ZONE_COLORS[4]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EasyPaceTrendChart({ weekly }: TrendSignalsPanelProps) {
  const { t } = useTranslation();
  const data = weekly.map((week) => ({
    week_start_date: week.week_start_date,
    easy_pace_s_per_km: week.easy_pace_s_per_km,
  }));
  return (
    <div className="chart-box">
      <h2>{t('trends.easyPace')}</h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week_start_date" tickFormatter={(value) => formatShortDate(String(value))} />
          <YAxis tickFormatter={(value) => formatPace(1000, Number(value))} />
          <Tooltip
            formatter={(value) => formatPace(1000, Number(value))}
            labelFormatter={(value) => formatShortDate(String(value))}
          />
          <Line
            type="monotone"
            dataKey="easy_pace_s_per_km"
            name={t('trends.easyPace')}
            stroke="#256f5b"
            strokeWidth={2}
            dot
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendSummaryPanel({ weekly }: TrendSignalsPanelProps) {
  const { t } = useTranslation();
  const latest = latestActiveWeek(weekly);
  const rows = [
    {
      label: t('trends.longRunShareMetric'),
      value: latest ? formatSplitPercentage(latest.long_run_share) : t('common.notAvailable'),
    },
    {
      label: t('trends.runDays'),
      value: latest ? `${latest.run_day_count}` : t('common.notAvailable'),
    },
    {
      label: t('trends.gainPerKm'),
      value: latest ? `${Math.round(latest.elevation_gain_per_km)} m/km` : t('common.notAvailable'),
    },
    {
      label: t('trends.monotony'),
      value: latest?.monotony === null || latest === undefined ? t('common.notAvailable') : latest.monotony.toFixed(2),
    },
  ];
  return (
    <div className="chart-box">
      <h2>{t('trends.latestWeekSignals')}</h2>
      <div className="trend-summary-list">
        {rows.map((row) => (
          <div className="trend-summary-row" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ZonePacePanel({ weekly }: TrendSignalsPanelProps) {
  const { t } = useTranslation();
  const latest = latestActiveWeek(weekly);
  const paces = latest?.zone_paces_s_per_km ?? [];
  return (
    <div className="chart-box">
      <h2>{t('trends.paceByHrZone')}</h2>
      <p className="chart-note">
        {latest
          ? t('trends.paceByZonePeriod', { date: formatDate(latest.week_start_date) })
          : t('trends.noRunningTime')}
      </p>
      <div className="zone-pace-list">
        {[0, 1, 2, 3, 4].map((index) => (
          <div className="zone-pace-row" key={index}>
            <span className="legend-dot" style={{ background: ZONE_COLORS[index] }} />
            <strong>Z{index + 1}</strong>
            <span>{paces[index] ? formatPace(1000, paces[index]) : t('common.notAvailable')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanRealityPanel({ weekly }: TrendSignalsPanelProps) {
  const { t } = useTranslation();
  const data = weekly.map((week) => ({
    week_start_date: week.week_start_date,
    planned_km: week.planned_distance_m / 1000,
    completed_km: week.completed_distance_m / 1000,
    distance_adherence: week.distance_adherence,
  }));
  const latest = latestActiveWeek(weekly);
  return (
    <div className="chart-box wide">
      <h2>{t('trends.planVsReality')}</h2>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week_start_date" tickFormatter={(value) => formatShortDate(String(value))} />
          <YAxis yAxisId="distance" tickFormatter={(value) => `${Number(value).toFixed(0)} km`} />
          <YAxis yAxisId="adherence" orientation="right" tickFormatter={(value) => `${Math.round(Number(value))}%`} />
          <Tooltip
            formatter={(value, name) =>
              name === t('trends.distanceAdherence')
                ? `${Number(value).toFixed(1)}%`
                : `${Number(value).toFixed(1)} km`
            }
            labelFormatter={(value) => formatShortDate(String(value))}
          />
          <Bar
            yAxisId="distance"
            dataKey="planned_km"
            name={t('trends.plannedDistance')}
            fill="#8b9790"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            yAxisId="distance"
            dataKey="completed_km"
            name={t('trends.completedDistance')}
            fill="#256f5b"
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="adherence"
            type="monotone"
            dataKey="distance_adherence"
            name={t('trends.distanceAdherence')}
            stroke="#d17b0f"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      {latest ? (
        <p className="chart-note">
          {t('trends.latestPlanSummary', {
            completed: formatDistance(latest.completed_distance_m),
            planned: formatDistance(latest.planned_distance_m),
            time: formatDuration(latest.completed_time_s),
          })}
        </p>
      ) : null}
    </div>
  );
}

function CoachEffectPanel({ weekly }: TrendSignalsPanelProps) {
  const { t } = useTranslation();
  const latest = latestActiveWeek(weekly);
  if (!latest) {
    return (
      <div className="chart-box wide coach-effect-panel">
        <h2>{t('trends.coachEffect')}</h2>
        <p className="chart-note">{t('trends.noRunningTime')}</p>
      </div>
    );
  }
  const rows = [
    {
      label: t('trends.coachIntent'),
      value: t(`coachIntent.${latest.coach_intent}`),
      tone: coachTone(latest.coach_intent),
    },
    {
      label: t('trends.coachStimulus'),
      value: t(`coachStimulus.${latest.coach_stimulus}`),
      tone: coachTone(latest.coach_stimulus),
    },
    {
      label: t('trends.coachResponse'),
      value: t(`coachResponse.${latest.coach_response}`),
      tone: coachTone(latest.coach_response),
    },
  ];
  return (
    <div className="chart-box wide coach-effect-panel">
      <h2>{t('trends.coachEffect')}</h2>
      <p className="chart-note">{t('trends.coachEffectHelp')}</p>
      <div className="coach-effect-grid">
        {rows.map((row) => (
          <div className="coach-effect-row" key={row.label}>
            <span>{row.label}</span>
            <strong className={`status-pill ${row.tone}`}>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="coach-recommendation">
        <span>{t('trends.coachRecommendation')}</span>
        <strong>{t(`coachRecommendation.${latest.coach_recommendation}`)}</strong>
      </div>
    </div>
  );
}

function coachTone(code: string) {
  if (['positive', 'on_target', 'base', 'keep_plan'].includes(code)) {
    return 'success';
  }
  if (['too_high', 'fatigue_risk', 'reduce_load'].includes(code)) {
    return 'warning';
  }
  if (['too_low', 'watch', 'improve_adherence', 'quality'].includes(code)) {
    return 'moderate';
  }
  return 'neutral';
}

function TrendZoneLegend() {
  return (
    <div className="chart-legend compact">
      {[0, 1, 2, 3, 4].map((index) => (
        <span key={index}>
          <span className="legend-dot" style={{ background: ZONE_COLORS[index] }} />
          Z{index + 1}
        </span>
      ))}
    </div>
  );
}

function latestActiveWeek(weekly: TrendMetricWeek[]) {
  return [...weekly].reverse().find((week) => week.moving_time_s > 0 || week.planned_distance_m > 0);
}
