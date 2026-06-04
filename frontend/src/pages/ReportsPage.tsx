import { CalendarDays, Download, FileText, Image as ImageIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useYearlyRunningSummary } from '../features/analytics/api';
import type { YearlyRunningSummary } from '../lib/api/types';
import { downloadUrl } from '../lib/api/client';
import { weekStartIso } from '../lib/date';
import { formatDate, formatDistance, formatDuration, getFormatLocale } from '../lib/format';
import { useTranslation } from '../lib/i18n';

type ReportFormat = 'png' | 'svg';

type ReportDefinition = {
  id: string;
  titleKey: string;
  detailKey: string;
  endpointBase: string;
  defaultFormat: ReportFormat;
  formats: ReportFormat[];
};

const reportDefinitions: ReportDefinition[] = [
  {
    id: 'weekly-running',
    titleKey: 'reports.weeklyRunningTitle',
    detailKey: 'reports.weeklyRunningDetail',
    endpointBase: '/analytics/weekly-report',
    defaultFormat: 'png',
    formats: ['png', 'svg'],
  },
];

const reportFormatMeta: Record<ReportFormat, { label: string; detailKey: string }> = {
  png: { label: 'PNG', detailKey: 'reports.formatPng' },
  svg: { label: 'SVG', detailKey: 'reports.formatSvg' },
};

export function ReportsPage() {
  const { t } = useTranslation();
  const defaultWeekStart = useMemo(() => weekStartIso(), []);
  const defaultYear = useMemo(() => String(new Date().getFullYear()), []);
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [year, setYear] = useState(defaultYear);
  const [formatsByReport, setFormatsByReport] = useState<Record<string, ReportFormat>>(() =>
    Object.fromEntries(reportDefinitions.map((report) => [report.id, report.defaultFormat])),
  );
  const selectedYear = parseYear(year);
  const yearlySummary = useYearlyRunningSummary(selectedYear);

  return (
    <div className="page-stack reports-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t('reports.eyebrow')}</p>
          <h1>{t('reports.title')}</h1>
        </div>
      </header>
      <AnnualStatsPanel
        year={year}
        selectedYear={selectedYear}
        summary={yearlySummary.data}
        isLoading={yearlySummary.isLoading}
        isError={yearlySummary.isError}
        onYearChange={setYear}
      />
      <section className="reports-grid" aria-label={t('reports.availableReports')}>
        {reportDefinitions.map((report) => {
          const activeFormat = formatsByReport[report.id] ?? report.defaultFormat;
          return (
            <ReportCard
              key={report.id}
              report={report}
              activeFormat={activeFormat}
              weekStart={weekStart}
              onFormatChange={(format) =>
                setFormatsByReport((current) => ({
                  ...current,
                  [report.id]: format,
                }))
              }
              onWeekStartChange={setWeekStart}
            />
          );
        })}
      </section>
    </div>
  );
}

type AnnualStatsPanelProps = {
  year: string;
  selectedYear: number | null;
  summary: YearlyRunningSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  onYearChange: (value: string) => void;
};

function AnnualStatsPanel({
  year,
  selectedYear,
  summary,
  isLoading,
  isError,
  onYearChange,
}: AnnualStatsPanelProps) {
  const { t } = useTranslation();
  const detailYear = String(summary?.year ?? selectedYear ?? year);
  const unavailable = selectedYear === null || isError;
  const value = (formatted: string) => {
    if (unavailable) {
      return t('common.notAvailable');
    }
    return isLoading ? t('reports.loadingStats') : formatted;
  };

  return (
    <section className="annual-report-panel" aria-label={t('reports.annualStats')}>
      <div className="report-card-header">
        <div className="report-card-icon">
          <CalendarDays size={22} />
        </div>
        <div>
          <p className="eyebrow">{t('reports.annualCategory')}</p>
          <h2>{t('reports.annualStats')}</h2>
          <p>{selectedYear ? t('reports.annualDetail', { year: String(selectedYear) }) : t('reports.invalidYear')}</p>
        </div>
      </div>
      <label className="report-field annual-year-field">
        <span>
          <CalendarDays size={16} />
          {t('reports.year')}
        </span>
        <input
          aria-label={t('reports.year')}
          inputMode="numeric"
          min="1900"
          max="2200"
          type="number"
          value={year}
          onChange={(event) => onYearChange(event.target.value)}
        />
      </label>
      <dl className="annual-stats-list">
        <AnnualStat
          label={t('reports.annualDistance')}
          value={value(formatDistance(summary?.distance_m))}
          detail={t('reports.fullYear', { year: detailYear })}
        />
        <AnnualStat
          label={t('reports.annualElevation')}
          value={value(formatMeters(summary?.elevation_gain_m))}
          detail={t('reports.fullYear', { year: detailYear })}
        />
        <AnnualStat
          label={t('reports.annualTime')}
          value={value(formatDuration(summary?.moving_time_s))}
          detail={t('reports.fullYear', { year: detailYear })}
        />
      </dl>
    </section>
  );
}

type AnnualStatProps = {
  label: string;
  value: string;
  detail: string;
};

function AnnualStat({ label, value, detail }: AnnualStatProps) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <small>{detail}</small>
    </div>
  );
}

type ReportCardProps = {
  report: ReportDefinition;
  activeFormat: ReportFormat;
  weekStart: string;
  onFormatChange: (format: ReportFormat) => void;
  onWeekStartChange: (value: string) => void;
};

function ReportCard({
  report,
  activeFormat,
  weekStart,
  onFormatChange,
  onWeekStartChange,
}: ReportCardProps) {
  const { t } = useTranslation();
  const hasWeekStart = /^\d{4}-\d{2}-\d{2}$/.test(weekStart);
  const href = hasWeekStart ? reportDownloadHref(report, weekStart, activeFormat) : undefined;

  return (
    <article className="report-card">
      <div className="report-card-header">
        <div className="report-card-icon">
          <FileText size={22} />
        </div>
        <div>
          <p className="eyebrow">{t('reports.weeklyCategory')}</p>
          <h2>{t(report.titleKey)}</h2>
          <p>{t(report.detailKey)}</p>
        </div>
      </div>
      <div className="report-control-grid">
        <label className="report-field">
          <span>
            <CalendarDays size={16} />
            {t('reports.week')}
          </span>
          <input
            aria-label={t('reports.week')}
            type="date"
            value={weekStart}
            onChange={(event) => onWeekStartChange(event.target.value ? weekStartIso(event.target.value) : '')}
          />
        </label>
        <div className="report-field">
          <span>
            <ImageIcon size={16} />
            {t('reports.format')}
          </span>
          <div className="segmented-control" role="group" aria-label={t('reports.format')}>
            {report.formats.map((format) => (
              <button
                key={format}
                aria-pressed={activeFormat === format}
                className={activeFormat === format ? 'active' : ''}
                type="button"
                onClick={() => onFormatChange(format)}
              >
                {reportFormatMeta[format].label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <dl className="report-meta-list">
        <div>
          <dt>{t('reports.week')}</dt>
          <dd>{hasWeekStart ? formatDate(weekStart) : t('common.notAvailable')}</dd>
        </div>
        <div>
          <dt>{t('reports.output')}</dt>
          <dd>{t(reportFormatMeta[activeFormat].detailKey)}</dd>
        </div>
      </dl>
      <div className="report-action-row">
        <a className={hasWeekStart ? 'primary-button' : 'primary-button disabled'} href={href} aria-disabled={!hasWeekStart} download>
          <Download size={17} />
          {t('reports.downloadFormat', { format: reportFormatMeta[activeFormat].label })}
        </a>
      </div>
    </article>
  );
}

function reportDownloadHref(report: ReportDefinition, weekStart: string, format: ReportFormat) {
  const params = new URLSearchParams({ week_start_date: weekStart });
  return downloadUrl(`${report.endpointBase}.${format}?${params.toString()}`);
}

function parseYear(value: string) {
  if (!/^\d{4}$/.test(value)) {
    return null;
  }
  const year = Number(value);
  if (year < 1900 || year > 2200) {
    return null;
  }
  return year;
}

function formatMeters(meters: number | null | undefined) {
  const formatted = new Intl.NumberFormat(getFormatLocale())
    .format(Math.round(meters ?? 0))
    .replace(/[\u00a0\u202f]/g, ' ');
  return `${formatted} m`;
}
