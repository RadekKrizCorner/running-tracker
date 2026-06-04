import { useMemo, useState } from 'react';
import { RunHeatmap } from '../components/maps/RunHeatmap';
import { EmptyState } from '../components/ui/EmptyState';
import { MetricCard } from '../components/ui/MetricCard';
import { RunnerScene } from '../components/visuals/RunnerScene';
import { useRunHeatmap } from '../features/analytics/api';
import { addMonthsToIso, toIsoDate } from '../lib/date';
import { formatDate } from '../lib/format';
import { useTranslation } from '../lib/i18n';

type HeatmapRangeId = 'all' | '24m' | '12m' | '6m' | '3m' | 'custom';

const heatmapRangePresets: { id: Exclude<HeatmapRangeId, 'custom'>; months: number | null; labelKey: string }[] = [
  { id: 'all', months: null, labelKey: 'heatmap.rangeAll' },
  { id: '24m', months: 24, labelKey: 'heatmap.range24m' },
  { id: '12m', months: 12, labelKey: 'heatmap.range12m' },
  { id: '6m', months: 6, labelKey: 'heatmap.range6m' },
  { id: '3m', months: 3, labelKey: 'heatmap.range3m' },
];

export function HeatmapPage() {
  const { t } = useTranslation();
  const today = useMemo(() => toIsoDate(new Date()), []);
  const [activeRange, setActiveRange] = useState<HeatmapRangeId>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const activeRangeDates = useMemo(
    () => rangeDates(activeRange, today, customStartDate, customEndDate),
    [activeRange, customEndDate, customStartDate, today],
  );
  const heatmap = useRunHeatmap({
    start_date: activeRangeDates.startDate,
    end_date: activeRangeDates.endDate,
  });

  if (heatmap.isLoading) {
    return <div className="screen-center">{t('common.loadingHeatmap')}</div>;
  }

  if (heatmap.isError) {
    return <EmptyState title={t('heatmap.empty')} detail={heatmap.error.message} visual={<RunnerScene variant="heatmap" />} />;
  }

  const data = heatmap.data;
  const rangeSummary = formatRangeSummary(t, activeRangeDates.startDate, activeRangeDates.endDate);
  const activateCustomStartDate = (value: string) => {
    setActiveRange('custom');
    setCustomStartDate(value);
  };
  const activateCustomEndDate = (value: string) => {
    setActiveRange('custom');
    setCustomEndDate(value);
  };

  return (
    <div className="page-stack">
      <header className="visual-page-hero heatmap">
        <div>
          <p className="eyebrow">{t('heatmap.eyebrow')}</p>
          <h1>{t('heatmap.title')}</h1>
          <p>{t('heatmap.hero')}</p>
          <div className="hero-stat-row">
            <span>{data?.activity_count ?? 0} {t('heatmap.gpsRuns')}</span>
            <span>{data?.point_count ?? 0} {t('heatmap.samples')}</span>
            <span>{data?.points.length ?? 0} {t('heatmap.hotCells')}</span>
          </div>
        </div>
        <RunnerScene variant="heatmap" label={t('heatmap.title')} />
      </header>
      <section className="metric-grid">
        <MetricCard label={t('heatmap.runsWithGps')} value={`${data?.activity_count ?? 0}`} detail={t('heatmap.importedActivities')} />
        <MetricCard label={t('heatmap.gpsSamples')} value={`${data?.point_count ?? 0}`} detail={t('heatmap.aggregatedPoints')} />
        <MetricCard label={t('heatmap.hotspots')} value={`${data?.points.length ?? 0}`} detail={t('heatmap.mapCells')} />
      </section>
      <section className="panel heatmap-filter-panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">{t('heatmap.rangeEyebrow')}</p>
            <h2>{t('heatmap.rangeTitle')}</h2>
          </div>
          <span className="badge">{rangeSummary}</span>
        </div>
        <div className="heatmap-range-toolbar" aria-label={t('heatmap.rangeOptions')} role="group">
          {heatmapRangePresets.map((preset) => (
            <button
              key={preset.id}
              aria-pressed={activeRange === preset.id}
              className={`range-chip ${activeRange === preset.id ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveRange(preset.id)}
            >
              {t(preset.labelKey)}
            </button>
          ))}
        </div>
        <div className="heatmap-custom-range">
          <label>
            <span>{t('heatmap.rangeFrom')}</span>
            <input
              aria-label={t('heatmap.rangeFrom')}
              type="date"
              value={customStartDate}
              onChange={(event) => activateCustomStartDate(event.target.value)}
              onInput={(event) => activateCustomStartDate(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>{t('heatmap.rangeTo')}</span>
            <input
              aria-label={t('heatmap.rangeTo')}
              type="date"
              value={customEndDate}
              onChange={(event) => activateCustomEndDate(event.target.value)}
              onInput={(event) => activateCustomEndDate(event.currentTarget.value)}
            />
          </label>
        </div>
        <p className="helper-text">{t('heatmap.rangeHelp')}</p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t('heatmap.repeatedRoutes')}</p>
            <h2>{t('heatmap.panelTitle')}</h2>
          </div>
          {data ? <span className="badge">{data.activity_count} {t('heatmap.withGps')}</span> : null}
        </div>
        {data && data.points.length > 0 ? (
          <>
            <RunHeatmap points={data.points} bounds={data.bounds} />
            <p className="helper-text">{t('heatmap.help', { samples: data.point_count, runs: data.activity_count })}</p>
          </>
        ) : (
          <EmptyState
            title={t('heatmap.empty')}
            detail={t('heatmap.emptyDetail')}
            visual={<RunnerScene variant="heatmap" />}
          />
        )}
      </section>
    </div>
  );
}

function rangeDates(activeRange: HeatmapRangeId, today: string, customStartDate: string, customEndDate: string) {
  if (activeRange === 'custom') {
    return {
      startDate: customStartDate || undefined,
      endDate: customEndDate || undefined,
    };
  }
  const preset = heatmapRangePresets.find((item) => item.id === activeRange);
  if (!preset?.months) {
    return { startDate: undefined, endDate: undefined };
  }
  return {
    startDate: addMonthsToIso(today, -preset.months),
    endDate: today,
  };
}

function formatRangeSummary(t: (key: string, params?: Record<string, string | number | null | undefined>) => string, startDate?: string, endDate?: string) {
  if (startDate && endDate) {
    return t('heatmap.rangeShowing', { from: formatDate(startDate), to: formatDate(endDate) });
  }
  if (startDate) {
    return t('heatmap.rangeSince', { from: formatDate(startDate) });
  }
  if (endDate) {
    return t('heatmap.rangeUntil', { to: formatDate(endDate) });
  }
  return t('heatmap.rangeAllDetail');
}
