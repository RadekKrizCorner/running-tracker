import {
  DurabilityChart,
  EasyRunEfficiencyChart,
  WeeklyElevationChart,
  WeeklyLoadChart,
  WeeklyLoadVolumeChart,
} from '../components/charts/WeeklyCharts';
import { TrendSignalsPanel } from '../components/charts/TrendMetricCharts';
import { EmptyState } from '../components/ui/EmptyState';
import { RunnerScene } from '../components/visuals/RunnerScene';
import {
  useAerobicTrend,
  usePersonalRecords,
  useRecentWeeklyAnalytics,
  useTrendMetrics,
} from '../features/analytics/api';
import type { ActivitySummary, WeeklyMetric } from '../lib/api/types';
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatSplitDuration,
  formatSplitPercentage,
  percent,
} from '../lib/format';
import { useTranslation } from '../lib/i18n';

export function TrendsPage() {
  const { t } = useTranslation();
  const recentWeeks = useRecentWeeklyAnalytics(4);
  const trendWeeks = useRecentWeeklyAnalytics(13);
  const trendMetrics = useTrendMetrics(13);
  const aerobic = useAerobicTrend();
  const records = usePersonalRecords();
  const chartWeekly = trendWeeks.data ?? [];
  const trendDataLoaded = recentWeeks.isSuccess && trendWeeks.isSuccess;
  const hasTrendData = (recentWeeks.data?.length ?? 0) > 0 || chartWeekly.length > 0;

  return (
    <div className="page-stack">
      <header className="visual-page-hero trends">
        <div>
          <p className="eyebrow">{t('trends.eyebrow')}</p>
          <h1>{t('trends.title')}</h1>
          <p>{t('trends.hero')}</p>
          <div className="hero-stat-row">
            <span>{chartWeekly.length} {t('trends.weeksShown')}</span>
            <span>{t('trends.loadContext')}</span>
            <span>{t('trends.prSnapshots')}</span>
          </div>
        </div>
        <RunnerScene variant="dashboard" label={t('trends.title')} />
      </header>
      {trendDataLoaded && !hasTrendData ? (
        <EmptyState title={t('trends.noTrends')} detail={t('trends.noTrendsDetail')} visual={<RunnerScene variant="empty" />} />
      ) : null}
      <section className="chart-grid">
        <WeeklyLoadVolumeChart weekly={chartWeekly} />
        <WeeklyElevationChart weekly={chartWeekly} />
        <WeeklyLoadChart weekly={chartWeekly} />
        <EasyRunEfficiencyChart points={aerobic.data ?? []} />
      </section>
      <TrendSignalsPanel weekly={trendMetrics.data ?? []} />
      <LastFourWeeksPanel weekly={recentWeeks.data ?? []} />
      <section className="split-grid">
        <DurabilityChart weekly={chartWeekly} />
        <PersonalRecordsPanel records={records.data} />
      </section>
    </div>
  );
}

type LastFourWeeksPanelProps = {
  weekly: WeeklyMetric[];
};

function LastFourWeeksPanel({ weekly }: LastFourWeeksPanelProps) {
  const { t } = useTranslation();
  return (
    <section className="panel recent-weeks-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('trends.recentBalance')}</p>
          <h2>{t('trends.last4Weeks')}</h2>
        </div>
      </div>
      <div className="recent-weeks-list">
        {weekly.map((week) => (
          <RecentWeekRow key={week.week_start_date} week={week} />
        ))}
      </div>
    </section>
  );
}

type RecentWeekRowProps = {
  week: WeeklyMetric;
};

function RecentWeekRow({ week }: RecentWeekRowProps) {
  const { t } = useTranslation();
  const unknownTime = week.unknown_time_s ?? 0;
  const totalIntensity = week.easy_time_s + week.moderate_time_s + week.hard_time_s + unknownTime;
  const insights = weekInsights(week, totalIntensity, t);
  return (
    <div className="recent-week-row">
      <div className="recent-week-summary">
        <strong>{t('trends.weekOf', { date: formatDate(week.week_start_date) })}</strong>
        <span>
          {formatDistance(week.distance_m)} · {formatDuration(week.moving_time_s)}
        </span>
        <div className="insight-tags">
          {insights.map((insight) => (
            <span className={`status-pill ${insight.tone}`} key={insight.label}>{insight.label}</span>
          ))}
        </div>
      </div>
      <div className="intensity-mini" aria-label={`Intensity split for ${week.week_start_date}`}>
        <div className="intensity-mini-bar" aria-hidden="true">
          <span className="easy" style={{ width: percent(week.easy_time_s, totalIntensity) }} />
          <span className="moderate" style={{ width: percent(week.moderate_time_s, totalIntensity) }} />
          <span className="hard" style={{ width: percent(week.hard_time_s, totalIntensity) }} />
          <span className="unknown" style={{ width: percent(unknownTime, totalIntensity) }} />
        </div>
        <div className="intensity-mini-breakdown">
          {totalIntensity > 0 ? (
            intensityBreakdownRows(week, totalIntensity, t).map((row) => (
              <div className="intensity-mini-row" key={row.key}>
                <span className={`legend-dot ${row.key}`} />
                <strong>{row.label}</strong>
                <span className="intensity-mini-time">{formatSplitDuration(row.seconds)}</span>
                <span className="intensity-mini-percent">{formatSplitPercentage(row.percentage)}</span>
              </div>
            ))
          ) : (
            <span>{t('trends.noRunningTime')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function intensityBreakdownRows(week: WeeklyMetric, totalIntensity: number, t: (key: string) => string) {
  const unknownTime = week.unknown_time_s ?? 0;
  return [
    {
      key: 'easy',
      label: t('intensity.easy'),
      seconds: week.easy_time_s,
      percentage: intensityPercentage(week.easy_time_s, totalIntensity),
    },
    {
      key: 'moderate',
      label: t('intensity.moderate'),
      seconds: week.moderate_time_s,
      percentage: intensityPercentage(week.moderate_time_s, totalIntensity),
    },
    {
      key: 'hard',
      label: t('intensity.hard'),
      seconds: week.hard_time_s,
      percentage: intensityPercentage(week.hard_time_s, totalIntensity),
    },
    ...(unknownTime > 0
      ? [
          {
            key: 'unknown',
            label: t('intensity.unknown'),
            seconds: unknownTime,
            percentage: intensityPercentage(unknownTime, totalIntensity),
          },
        ]
      : []),
  ];
}

function intensityPercentage(seconds: number, totalIntensity: number) {
  if (totalIntensity <= 0) {
    return 0;
  }
  return (seconds / totalIntensity) * 100;
}

type PersonalRecordsPanelProps = {
  records:
    | {
        five_k_activity: ActivitySummary | null;
        ten_k_activity: ActivitySummary | null;
        half_marathon: ActivitySummary | null;
        marathon: ActivitySummary | null;
      }
    | undefined;
};

function PersonalRecordsPanel({ records }: PersonalRecordsPanelProps) {
  const { t } = useTranslation();
  const rows = [
    ['5K', records?.five_k_activity ?? null],
    ['10K', records?.ten_k_activity ?? null],
    [t('eventType.half_marathon'), records?.half_marathon ?? null],
    [t('eventType.marathon'), records?.marathon ?? null],
  ] as const;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('trends.prEyebrow')}</p>
          <h2>{t('trends.personalRecords')}</h2>
        </div>
      </div>
      <div className="list-stack">
        {rows.map(([label, activity]) => (
          <div className="activity-row" key={label}>
            <div>
              <strong>{label}</strong>
              <span>{activity?.name ?? t('trends.noResult')}</span>
            </div>
            <small>{activity ? `${formatDuration(activity.moving_time_s)} · ${formatDate(activity.start_time_utc)}` : t('common.notAvailable')}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function weekInsights(week: WeeklyMetric, totalIntensity: number, t: (key: string) => string) {
  const insights: { label: string; tone: string }[] = [];
  if ((week.ramp_ratio ?? 0) > 1.5) {
    insights.push({ label: t('trends.highIncrease'), tone: 'warning' });
  } else if ((week.ramp_ratio ?? 0) >= 1.25) {
    insights.push({ label: t('trends.increasing'), tone: 'moderate' });
  } else if ((week.ramp_ratio ?? 0) >= 0.75) {
    insights.push({ label: t('trends.steady'), tone: 'success' });
  }
  if (totalIntensity > 0 && week.easy_time_s / totalIntensity >= 0.7) {
    insights.push({ label: t('trends.mostlyEasy'), tone: 'easy' });
  }
  if ((week.unknown_time_s ?? 0) > 0) {
    insights.push({ label: t('trends.unknownIntensity'), tone: 'neutral' });
  }
  return insights;
}
