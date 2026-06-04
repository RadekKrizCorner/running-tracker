import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { useActivities } from '../features/activities/api';
import { addDaysToIso, addMonthsToIso, toIsoDate } from '../lib/date';
import { formatDate, formatDistance, formatDuration, formatPace } from '../lib/format';
import { enumLabel, useTranslation } from '../lib/i18n';

type ActivityRangeId = 'all' | '30d' | '90d' | '12m' | 'custom';
type ActivitySortKey = 'start_time' | 'distance' | 'moving_time' | 'pace' | 'average_hr' | 'computed_load' | 'elevation_gain';
type SortDirection = 'ascending' | 'descending' | null;

const activityRangePresets: { id: Exclude<ActivityRangeId, 'custom'>; labelKey: string }[] = [
  { id: 'all', labelKey: 'activities.rangeAll' },
  { id: '30d', labelKey: 'activities.range30d' },
  { id: '90d', labelKey: 'activities.range90d' },
  { id: '12m', labelKey: 'activities.range12m' },
];

export function ActivitiesPage() {
  const { t } = useTranslation();
  const [intensity, setIntensity] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('-start_time');
  const [activeRange, setActiveRange] = useState<ActivityRangeId>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const today = useMemo(() => toIsoDate(new Date()), []);
  const activeRangeDates = useMemo(
    () => activityRangeDates(activeRange, today, customStartDate, customEndDate),
    [activeRange, customEndDate, customStartDate, today],
  );
  const activities = useActivities({
    intensity_class: intensity || undefined,
    search: search.trim() || undefined,
    sort,
    start_date: activeRangeDates.startDate,
    end_date: activeRangeDates.endDate,
  });
  const hasFilters = Boolean(intensity || search.trim() || activeRange !== 'all' || sort !== '-start_time');
  const activateCustomStartDate = (value: string) => {
    setActiveRange('custom');
    setCustomStartDate(value);
  };
  const activateCustomEndDate = (value: string) => {
    setActiveRange('custom');
    setCustomEndDate(value);
  };
  const clearFilters = () => {
    setIntensity('');
    setSearch('');
    setSort('-start_time');
    setActiveRange('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t('activities.eyebrow')}</p>
          <h1>{t('activities.title')}</h1>
        </div>
      </header>
      <section className="panel activity-filter-panel">
        <div className="activity-filter-grid">
          <label className="activity-filter-field activity-search-field">
            <span>{t('activities.searchLabel')}</span>
            <div className="search-input-shell">
              <Search size={16} aria-hidden="true" />
              <input
                aria-label={t('activities.searchLabel')}
                type="search"
                value={search}
                placeholder={t('activities.searchPlaceholder')}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
          <label className="activity-filter-field">
            <span>{t('common.intensity')}</span>
            <select value={intensity} onChange={(event) => setIntensity(event.target.value)}>
              <option value="">{t('activities.allIntensities')}</option>
              <option value="easy">{t('intensity.easy')}</option>
              <option value="moderate">{t('intensity.moderate')}</option>
              <option value="hard">{t('intensity.hard')}</option>
              <option value="unknown">{t('intensity.unknown')}</option>
            </select>
          </label>
          <div className="activity-filter-field activity-range-field">
            <span>{t('activities.timeRange')}</span>
            <div className="activity-range-toolbar" aria-label={t('activities.timeRange')} role="group">
              {activityRangePresets.map((preset) => (
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
          </div>
          <div className="activity-custom-range">
            <label>
              <span>{t('activities.rangeFrom')}</span>
              <input
                aria-label={t('activities.rangeFrom')}
                type="date"
                value={customStartDate}
                onChange={(event) => activateCustomStartDate(event.target.value)}
                onInput={(event) => activateCustomStartDate(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{t('activities.rangeTo')}</span>
              <input
                aria-label={t('activities.rangeTo')}
                type="date"
                value={customEndDate}
                onChange={(event) => activateCustomEndDate(event.target.value)}
                onInput={(event) => activateCustomEndDate(event.currentTarget.value)}
              />
            </label>
          </div>
        </div>
        {hasFilters ? (
          <button className="secondary-button compact" type="button" onClick={clearFilters}>
            <X size={16} aria-hidden="true" />
            {t('activities.clearFilters')}
          </button>
        ) : null}
      </section>
      {activities.isLoading ? <div className="screen-center">{t('common.loadingActivities')}</div> : null}
      {!activities.isLoading && activities.data?.length === 0 ? (
        <EmptyState title={t('activities.noMatching')} detail={t('activities.noMatchingDetail')} />
      ) : null}
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <SortableHeader label={t('common.date')} sortKey="start_time" sort={sort} onSort={setSort} t={t} />
              <th scope="col">{t('common.name')}</th>
              <SortableHeader label={t('common.distance')} sortKey="distance" sort={sort} onSort={setSort} t={t} />
              <SortableHeader label={t('common.time')} sortKey="moving_time" sort={sort} onSort={setSort} t={t} />
              <SortableHeader label={t('common.pace')} sortKey="pace" sort={sort} onSort={setSort} t={t} defaultDirection="ascending" />
              <SortableHeader label={t('common.elevation')} sortKey="elevation_gain" sort={sort} onSort={setSort} t={t} />
              <SortableHeader label={t('activities.avgHr')} sortKey="average_hr" sort={sort} onSort={setSort} t={t} />
              <SortableHeader label={t('common.load')} sortKey="computed_load" sort={sort} onSort={setSort} t={t} />
              <th scope="col">{t('common.intensity')}</th>
            </tr>
          </thead>
          <tbody>
            {(activities.data ?? []).map((activity) => (
              <tr key={activity.id}>
                <td>{formatDate(activity.start_time_utc)}</td>
                <td>
                  <Link to={`/activities/${activity.id}`}>{activity.name ?? t('activity.run')}</Link>
                </td>
                <td>{formatDistance(activity.distance_m)}</td>
                <td>{formatDuration(activity.moving_time_s)}</td>
                <td>{formatPace(activity.distance_m, activity.moving_time_s)}</td>
                <td>{`${Math.round(activity.elevation_gain_m ?? 0)} m`}</td>
                <td>{activity.average_hr ? Math.round(activity.average_hr) : t('common.notAvailable')}</td>
                <td>{activity.computed_load ? Math.round(activity.computed_load) : 0}</td>
                <td><span className={`badge ${activity.intensity_class ?? 'unknown'}`}>{enumLabel(t, 'intensity', activity.intensity_class ?? 'unknown')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  t,
  defaultDirection = 'descending',
}: {
  label: string;
  sortKey: ActivitySortKey;
  sort: string;
  onSort: (sort: string) => void;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  defaultDirection?: Exclude<SortDirection, null>;
}) {
  const direction = sortDirectionFor(sortKey, sort);
  return (
    <th scope="col" aria-sort={direction ?? 'none'}>
      <button
        className={`sort-button ${direction ? 'active' : ''}`}
        type="button"
        onClick={() => onSort(nextSortValue(sort, sortKey, defaultDirection))}
        aria-label={t('activities.sortBy', { label })}
      >
        <span>{label}</span>
        <SortDirectionIcon direction={direction} />
      </button>
    </th>
  );
}

function SortDirectionIcon({ direction }: { direction: SortDirection }) {
  if (direction === 'ascending') {
    return <ArrowUp size={14} aria-hidden="true" />;
  }
  if (direction === 'descending') {
    return <ArrowDown size={14} aria-hidden="true" />;
  }
  return <ArrowUpDown size={14} aria-hidden="true" />;
}

function nextSortValue(currentSort: string, sortKey: ActivitySortKey, defaultDirection: Exclude<SortDirection, null>) {
  const currentDirection = sortDirectionFor(sortKey, currentSort);
  if (!currentDirection) {
    return defaultDirection === 'descending' ? `-${sortKey}` : sortKey;
  }
  return currentDirection === 'descending' ? sortKey : `-${sortKey}`;
}

function sortDirectionFor(sortKey: ActivitySortKey, sort: string): SortDirection {
  const activeKey = sort.replace(/^-/, '');
  if (activeKey !== sortKey) {
    return null;
  }
  return sort.startsWith('-') ? 'descending' : 'ascending';
}

function activityRangeDates(activeRange: ActivityRangeId, today: string, customStartDate: string, customEndDate: string) {
  if (activeRange === 'custom') {
    return {
      startDate: customStartDate || undefined,
      endDate: customEndDate || undefined,
    };
  }
  if (activeRange === '30d') {
    return { startDate: addDaysToIso(today, -30), endDate: today };
  }
  if (activeRange === '90d') {
    return { startDate: addDaysToIso(today, -90), endDate: today };
  }
  if (activeRange === '12m') {
    return { startDate: addMonthsToIso(today, -12), endDate: today };
  }
  return { startDate: undefined, endDate: undefined };
}
