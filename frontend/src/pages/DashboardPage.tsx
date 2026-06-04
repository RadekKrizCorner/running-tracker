import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Mountain, Route, TrendingUp } from 'lucide-react';
import { IntensityChart, WeeklyDistanceChart, WeeklyLoadChart } from '../components/charts/WeeklyCharts';
import { EmptyState } from '../components/ui/EmptyState';
import { MetricCard } from '../components/ui/MetricCard';
import { ProgressMeter } from '../components/ui/ProgressMeter';
import { StatusPill } from '../components/ui/StatusPill';
import { RunnerScene } from '../components/visuals/RunnerScene';
import {
  useStravaStatus,
  useStravaSync,
  useStravaSyncJob,
  stravaConnectUrl,
  syncStatusIsActive,
} from '../features/connections/api';
import { useDashboard } from '../features/dashboard/api';
import { useHeartRateZones, useUserPreferences } from '../features/profile/api';
import type { StravaSyncJobStatus, SyncProgress, WeekPlanComparison, WeekPlanRow } from '../lib/api/types';
import { formatDate, formatDistance, formatDuration, formatWeekdayDate, formatWeekRange } from '../lib/format';
import { enumLabel, useTranslation } from '../lib/i18n';

type DashboardMode = 'simple' | 'advanced';

export function DashboardPage() {
  const { t } = useTranslation();
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const dashboard = useDashboard('week', selectedWeekStart ?? undefined);
  const strava = useStravaStatus();
  const hrZones = useHeartRateZones();
  const preferences = useUserPreferences();
  const sync = useStravaSync();
  const dashboardMode: DashboardMode = preferences.data?.dashboard_mode ?? 'advanced';
  const activeJobId = syncJobId ?? strava.data?.active_job_id ?? null;
  const syncJob = useStravaSyncJob(activeJobId);
  const syncJobStatus = syncJob.data?.status;
  const syncActive = sync.isPending || Boolean(activeJobId && !syncJobStatus) || syncStatusIsActive(syncJobStatus);
  const syncButtonLabel = syncButtonText(sync.isPending, syncJobStatus, activeJobId, t);
  const syncMessage = syncStatusText(sync.isPending, syncJob.data?.detail ?? sync.data?.detail, syncJob.data?.error, strava.data?.last_error, t);

  useEffect(() => {
    if (strava.data?.active_job_id) {
      setSyncJobId(strava.data.active_job_id);
    }
  }, [strava.data?.active_job_id]);

  if (dashboard.isLoading || strava.isLoading || preferences.isLoading) {
    return <div className="screen-center">{t('common.loadingDashboard')}</div>;
  }

  const data = dashboard.data;
  const noActivities = !data || data.recent_activities.length === 0;

  return (
    <div className="page-stack dashboard-page">
      <section className="metric-grid">
        <MetricCard label={t('common.distance')} value={formatDistance(data?.this_week.distance_m)} detail={t('dashboard.thisWeek')} />
        <MetricCard label={t('dashboard.movingTime')} value={formatDuration(data?.this_week.moving_time_s)} detail={t('dashboard.thisWeek')} />
        <MetricCard label={t('dashboard.runs')} value={`${data?.this_week.run_count ?? 0}`} detail={t('common.completed')} />
        <MetricCard label={t('dashboard.longestRun')} value={formatDistance(data?.this_week.longest_run_m)} detail={t('dashboard.thisWeek')} />
        {dashboardMode === 'advanced' ? (
          <>
            <MetricCard label={t('common.load')} value={`${Math.round(data?.this_week.load ?? 0)}`} detail={t('dashboard.transparentEstimate')} />
            <MetricCard label={t('common.elevation')} value={`${Math.round(data?.this_week.elevation_gain_m ?? 0)} m`} detail={t('dashboard.gain')} />
          </>
        ) : null}
      </section>

      {strava.data?.connected ? (
        <div className="header-actions dashboard-sync-actions">
          <button
            className="primary-button"
            type="button"
            disabled={syncActive}
            onClick={() =>
              sync.mutate({ mode: 'recent' }, {
                onSuccess: (result) => setSyncJobId(result.job_id),
              })
            }
          >
            {syncButtonLabel}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={syncActive}
            onClick={() =>
              sync.mutate({ mode: 'history' }, {
                onSuccess: (result) => setSyncJobId(result.job_id),
              })
            }
          >
            {t('dashboard.syncHistory')}
          </button>
          {syncMessage && !syncActive ? <small className="sync-status">{syncMessage}</small> : null}
        </div>
      ) : null}

      {!strava.data?.connected ? (
        <EmptyState
          title={t('dashboard.connectTitle')}
          detail={t('dashboard.connectDetail')}
          action={<a className="primary-button" href={stravaConnectUrl()}>{t('settings.connectStrava')}</a>}
          visual={<RunnerScene variant="settings" />}
        />
      ) : null}

      {noActivities ? (
        <EmptyState
          title={t('dashboard.noActivities')}
          detail={t('dashboard.noActivitiesDetail')}
          visual={<RunnerScene variant="empty" />}
          action={
            <button
              className="secondary-button"
              type="button"
              disabled={syncActive}
              onClick={() =>
                  sync.mutate({ mode: 'recent' }, {
                    onSuccess: (result) => setSyncJobId(result.job_id),
                  })
                }
            >
              {syncButtonLabel === t('dashboard.syncStrava') ? t('dashboard.runSync') : syncButtonLabel}
            </button>
          }
        />
      ) : null}

      {activeJobId || sync.data?.detail || strava.data?.last_error ? (
        <SyncProgressBanner job={syncJob.data} fallbackDetail={syncMessage} />
      ) : null}

      <OnboardingChecklist
        stravaConnected={Boolean(strava.data?.connected)}
        hasActivities={!noActivities}
        hasHrZones={Array.isArray(hrZones.data) && hrZones.data.length > 0}
        hasPlan={Boolean(data?.week_plan?.planned_sessions || data?.upcoming_workouts?.length)}
        syncDisabled={syncActive}
        onHistorySync={() =>
          sync.mutate({ mode: 'history' }, {
            onSuccess: (result) => setSyncJobId(result.job_id),
          })
        }
      />

      {data?.week_plan ? (
        <WeekPlanPanel
          weekPlan={data.week_plan}
          isShifted={selectedWeekStart !== null}
          onPreviousWeek={() => setSelectedWeekStart(addWeeksIso(data.week_plan.week_start_date, -1))}
          onCurrentWeek={() => setSelectedWeekStart(null)}
          onNextWeek={() => setSelectedWeekStart(addWeeksIso(data.week_plan.week_start_date, 1))}
        />
      ) : null}

      {dashboardMode === 'advanced' ? (
        <>
          <section className="chart-grid">
            <WeeklyDistanceChart weekly={data?.weekly ?? []} />
            <WeeklyLoadChart weekly={data?.weekly ?? []} />
            <IntensityChart weekly={data?.weekly ?? []} />
          </section>
          <AnalyticsGlossary />
        </>
      ) : null}

      <section className="split-grid">
        <div className="panel">
          <h2>{t('dashboard.recentActivities')}</h2>
          <div className="list-stack">
            {(data?.recent_activities ?? []).map((activity) => (
              <a className="activity-row" key={activity.id} href={`/activities/${activity.id}`}>
                <Route size={18} />
                <div>
                  <strong>{activity.name ?? t('activity.run')}</strong>
                  <span>{formatDistance(activity.distance_m)} · {formatDuration(activity.moving_time_s)}</span>
                </div>
                <small>{enumLabel(t, 'intensity', activity.intensity_class ?? 'unknown')}</small>
              </a>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>{t('dashboard.upcomingWorkouts')}</h2>
          <div className="list-stack">
            {(data?.upcoming_workouts ?? []).map((workout) => (
              <div className="activity-row" key={workout.id ?? `${workout.scheduled_date}-${workout.title}`}>
                <Clock size={18} />
                <div>
                  <strong>{workout.title}</strong>
                  <span>{formatDate(workout.scheduled_date)} · {enumLabel(t, 'intensity', workout.target_intensity ?? 'free')}</span>
                </div>
                <small>{enumLabel(t, 'status', workout.status)}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="insight-strip">
        <TrendingUp size={18} />
        <span>{t('dashboard.rampInsight')}</span>
        <Activity size={18} />
        <span>{t('dashboard.intensityInsight')}</span>
        <Mountain size={18} />
        <span>{t('dashboard.elevationInsight')}</span>
      </section>
    </div>
  );
}

function OnboardingChecklist({
  stravaConnected,
  hasActivities,
  hasHrZones,
  hasPlan,
  syncDisabled,
  onHistorySync,
}: {
  stravaConnected: boolean;
  hasActivities: boolean;
  hasHrZones: boolean;
  hasPlan: boolean;
  syncDisabled: boolean;
  onHistorySync: () => void;
}) {
  const { t } = useTranslation();
  const items = [
    {
      label: t('settings.connectStrava'),
      detail: t('dashboard.connectDetail'),
      complete: stravaConnected,
      action: <a className="secondary-button compact" href={stravaConnectUrl()}>{t('settings.connectStrava')}</a>,
    },
    {
      label: t('dashboard.importHistory'),
      detail: t('dashboard.importHistoryDetail'),
      complete: hasActivities,
      action: <button className="secondary-button compact" type="button" disabled={syncDisabled || !stravaConnected} onClick={onHistorySync}>{t('dashboard.syncHistory')}</button>,
    },
    {
      label: t('dashboard.configureHr'),
      detail: t('dashboard.configureHrDetail'),
      complete: hasHrZones,
      action: <a className="secondary-button compact" href="/settings">{t('settings.hrZones')}</a>,
    },
    {
      label: t('dashboard.createWeekPlan'),
      detail: t('dashboard.createWeekPlanDetail'),
      complete: hasPlan,
      action: <a className="secondary-button compact" href="/plans">{t('nav.plans')}</a>,
    },
  ];
  const doneCount = items.filter((item) => item.complete).length;
  if (doneCount === items.length) {
    return null;
  }
  return (
    <section className="panel onboarding-checklist">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('dashboard.startHere')}</p>
          <h2>{t('dashboard.setupChecklist')}</h2>
        </div>
        <span className="badge">{doneCount}/{items.length} {t('dashboard.complete')}</span>
      </div>
      <div className="checklist-grid">
        {items.map((item) => (
          <article className={item.complete ? 'checklist-item complete' : 'checklist-item'} key={item.label}>
            {item.complete ? <CheckCircle2 size={20} /> : <Circle size={20} />}
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </div>
            {!item.complete ? item.action : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function AnalyticsGlossary() {
  const { t } = useTranslation();
  return (
    <section className="panel analytics-glossary">
      <h2>{t('dashboard.analyticsGlossary')}</h2>
      <div className="glossary-grid">
        <p><strong>{t('common.load')}</strong> {t('dashboard.loadGlossary')}</p>
        <p><strong>{t('dashboard.rampRatioLabel')}</strong> {t('dashboard.rampGlossary')}</p>
        <p><strong>{t('charts.intensitySplit')}</strong> {t('dashboard.intensityGlossary')}</p>
      </div>
    </section>
  );
}

type WeekPlanPanelProps = {
  weekPlan: WeekPlanComparison;
  isShifted: boolean;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
};

function WeekPlanPanel({ weekPlan, isShifted, onPreviousWeek, onCurrentWeek, onNextWeek }: WeekPlanPanelProps) {
  const { t } = useTranslation();
  const hasRows = weekPlan.rows.length > 0;
  return (
    <section className="panel week-plan-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('dashboard.weekVsPlan')}</p>
          <h2>{t('dashboard.weekCommandCenter')}</h2>
          <span className="subtle-heading">{t('dashboard.currentProgress')}</span>
        </div>
        <span className="badge">
          {formatWeekRange(weekPlan.week_start_date, weekPlan.week_end_date)}
        </span>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onPreviousWeek}>
            <ChevronLeft size={16} />
            {t('common.previousWeek')}
          </button>
          <button className="secondary-button" type="button" onClick={onCurrentWeek} disabled={!isShifted}>
            {t('common.currentWeek')}
          </button>
          <button className="secondary-button" type="button" onClick={onNextWeek}>
            {t('common.nextWeek')}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="plan-overview">
        <PlanProgress
          label={t('common.distance')}
          completed={formatDistance(weekPlan.completed_distance_m)}
          planned={formatDistance(weekPlan.planned_distance_m)}
          detail={t('dashboard.planWaiting', { value: formatDistance(weekPlan.remaining_distance_m), delta: formatSignedDistance(weekPlan.distance_delta_m) })}
          percent={progressPercent(weekPlan.completed_distance_m, weekPlan.planned_distance_m)}
        />
        <PlanProgress
          label={t('common.time')}
          completed={formatDuration(weekPlan.completed_time_s)}
          planned={formatDuration(weekPlan.planned_time_s)}
          detail={t('dashboard.planWaiting', { value: formatDuration(weekPlan.remaining_time_s), delta: formatSignedDuration(weekPlan.duration_delta_s) })}
          percent={progressPercent(weekPlan.completed_time_s, weekPlan.planned_time_s)}
        />
        <PlanProgress
          label={t('common.load')}
          completed={`${Math.round(weekPlan.completed_load)}`}
          planned={`${Math.round(weekPlan.planned_load)}`}
          detail={t('dashboard.loadVsPlan', { delta: formatSignedNumber(weekPlan.load_delta) })}
          percent={progressPercent(weekPlan.completed_load, weekPlan.planned_load)}
        />
        <PlanProgress
          label={t('common.sessions')}
          completed={`${weekPlan.completed_sessions}`}
          planned={`${weekPlan.planned_sessions}`}
          detail={t('dashboard.sessionsDetail', { waiting: weekPlan.remaining_sessions, missed: weekPlan.missed_sessions, extra: weekPlan.extra_sessions })}
          percent={progressPercent(weekPlan.completed_sessions, weekPlan.planned_sessions)}
        />
      </div>
      {hasRows ? (
        <>
          <div className="adherence-summary">
            <StatusPill tone={weekPlan.remaining_sessions > 0 ? 'warning' : 'success'}>{weekPlan.remaining_sessions} {t('common.waiting')}</StatusPill>
            <StatusPill tone={weekPlan.extra_sessions > 0 ? 'moderate' : 'neutral'}>{weekPlan.extra_sessions} {t('common.extra')}</StatusPill>
            <StatusPill tone={weekPlan.missed_sessions > 0 ? 'hard' : 'neutral'}>{weekPlan.missed_sessions} {t('common.missed')}</StatusPill>
          </div>
          <div className="adherence-list">
            {weekPlan.rows.map((row) => (
              <WeekPlanRowItem key={`${row.date}-${row.planned_workout_id ?? row.activity_id}`} row={row} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="adherence-summary">
            <StatusPill tone={weekPlan.remaining_sessions > 0 ? 'warning' : 'success'}>{weekPlan.remaining_sessions} {t('common.waiting')}</StatusPill>
            <StatusPill tone={weekPlan.extra_sessions > 0 ? 'moderate' : 'neutral'}>{weekPlan.extra_sessions} {t('common.extra')}</StatusPill>
            <StatusPill tone={weekPlan.missed_sessions > 0 ? 'hard' : 'neutral'}>{weekPlan.missed_sessions} {t('common.missed')}</StatusPill>
          </div>
          <EmptyState title={t('dashboard.noWeeklyPlan')} detail={t('dashboard.noWeeklyPlanDetail')} />
        </>
      )}
    </section>
  );
}

type PlanProgressProps = {
  label: string;
  completed: string;
  planned: string;
  detail: string;
  percent: number;
};

function PlanProgress({ label, completed, planned, detail, percent }: PlanProgressProps) {
  const { t } = useTranslation();
  return (
    <div className="plan-progress">
      <div>
        <span>{label}</span>
        <strong>
          {completed} <small>{t('common.of')} {planned}</small>
        </strong>
      </div>
      <ProgressMeter label={label} value={percent} detail={detail} showHeading={false} showSummary={false} />
    </div>
  );
}

type WeekPlanRowItemProps = {
  row: WeekPlanRow;
};

function WeekPlanRowItem({ row }: WeekPlanRowItemProps) {
  const { t } = useTranslation();
  const title = row.planned_title ?? row.activity_name ?? t('activity.run');
  const isRestPlan = row.outcome === 'rest' || row.planned_type === 'rest';
  let actualLabel = t('dashboard.unmatchedLabel');
  let actualSummary = t('dashboard.noMatchedRun');
  if (row.activity_id) {
    actualLabel = t('dashboard.completedLabel');
    actualSummary = `${formatDistance(row.actual_distance_m)} · ${formatDuration(row.actual_duration_s)} · ${enumLabel(t, 'intensity', row.actual_intensity ?? 'unknown')}`;
  } else if (isRestPlan) {
    actualLabel = enumLabel(t, 'outcome', 'rest');
    actualSummary = t('dashboard.noRunExpected');
  }
  const plannedSummary = row.planned_workout_id
    ? `${formatDistance(row.planned_distance_m)} · ${formatDuration(row.planned_duration_s)} · ${enumLabel(t, 'intensity', row.planned_intensity ?? 'free')}`
    : t('dashboard.extraRun');
  return (
    <div className="adherence-row">
      <div>
        <span className="badge adherence-date">{formatWeekdayDate(row.date)}</span>
        <strong>{title}</strong>
      </div>
      <div>
        <small>{t('dashboard.plannedLabel')}</small>
        <span>{plannedSummary}</span>
      </div>
      <div>
        <small>{actualLabel}</small>
        <span>{actualSummary}</span>
      </div>
      <div className="adherence-result">
        <span className={`badge ${outcomeTone(row.outcome)}`}>{enumLabel(t, 'outcome', row.outcome)}</span>
        <small>
          {formatSignedDistance(row.distance_delta_m)} · {formatSignedDuration(row.duration_delta_s)}
        </small>
      </div>
    </div>
  );
}

function progressPercent(completed: number, planned: number) {
  if (planned <= 0) {
    return completed > 0 ? 100 : 0;
  }
  return Math.min(100, Math.max(0, (completed / planned) * 100));
}

function formatSignedDistance(value: number) {
  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}${formatDistance(Math.abs(value))}`;
}

function formatSignedDuration(value: number) {
  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}${formatDuration(Math.abs(value))}`;
}

function formatSignedNumber(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

function syncButtonText(isPending: boolean, status: string | undefined, activeJobId: string | null, t: (key: string) => string) {
  if (isPending || status === 'queued' || status === 'deferred' || status === 'scheduled' || (activeJobId && !status)) {
    return t('dashboard.syncQueued');
  }
  if (status === 'started') {
    return t('dashboard.syncRunning');
  }
  return t('dashboard.syncStrava');
}

function syncStatusText(
  isPending: boolean,
  detail: string | undefined,
  error: string | null | undefined,
  lastError: string | null | undefined,
  t: (key: string, params?: Record<string, string>) => string,
) {
  if (isPending) {
    return t('dashboard.syncRequestQueued');
  }
  if (error) {
    return error;
  }
  if (detail) {
    return detail;
  }
  if (lastError) {
    return t('dashboard.lastSync', { error: lastError });
  }
  return null;
}

function SyncProgressBanner({ job, fallbackDetail }: { job: StravaSyncJobStatus | undefined; fallbackDetail: string | null }) {
  const { t } = useTranslation();
  const progress = job?.progress ?? null;
  return (
    <section className={`sync-banner ${job?.status ?? 'queued'}`}>
      <div>
        <strong>{syncProgressTitle(job?.status, progress, t)}</strong>
        <span>{fallbackDetail ?? t('dashboard.syncQueued')}</span>
      </div>
      <div className="sync-progress-stats">
        <SyncStat label={t('dashboard.imported')} value={progress?.imported ?? 0} />
        <SyncStat label={t('dashboard.skipped')} value={progress?.skipped ?? 0} />
        <SyncStat label={t('dashboard.streams')} value={progress?.streams ?? 0} />
      </div>
    </section>
  );
}

function SyncStat({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <strong>{label} {value}</strong>
    </span>
  );
}

function syncProgressTitle(status: string | undefined, progress: SyncProgress | null, t: (key: string, params?: Record<string, string>) => string) {
  if (status === 'failed') {
    return t('dashboard.syncFailed');
  }
  if (status === 'finished') {
    return t('dashboard.syncFinished');
  }
  const phaseKey = `sync.phase.${progress?.phase ?? 'queued'}`;
  const translatedPhase = t(phaseKey);
  const phase = translatedPhase === phaseKey ? titleCase(progress?.phase ?? 'queued') : translatedPhase;
  return progress?.current_activity
    ? t('dashboard.syncPhaseWithActivity', { phase, activity: progress.current_activity })
    : t('dashboard.syncPhaseTitle', { phase });
}

function titleCase(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function outcomeTone(outcome: string) {
  if (outcome === 'as_planned') {
    return 'easy';
  }
  if (outcome === 'waiting' || outcome === 'more' || outcome === 'less') {
    return 'moderate';
  }
  if (outcome === 'missed' || outcome === 'different_intensity' || outcome === 'extra') {
    return 'hard';
  }
  return '';
}

function addWeeksIso(value: string, weeks: number) {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + weeks * 7);
  return toIsoDate(next);
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
