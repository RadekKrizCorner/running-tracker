import { CalendarDays, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Dashboard } from '../../lib/api/types';
import { formatDate, formatDistance, formatDuration } from '../../lib/format';
import { useTranslation } from '../../lib/i18n';

type TodayBriefProps = {
  data: Dashboard | undefined;
  today: string;
};

export function TodayBrief({ data, today }: TodayBriefProps) {
  const { t } = useTranslation();
  const planned = data?.upcoming_workouts.find(
    (workout) => workout.scheduled_date === today && workout.status !== 'cancelled',
  );
  const plan = data?.week_plan;
  const isAboveDistancePlan = Boolean(plan && plan.distance_delta_m > 0);
  const headline = planned
    ? t('dashboard.todayPlannedHeadline', { title: planned.title })
    : t('dashboard.todayOpenHeadline');

  return (
    <section className="today-brief" aria-labelledby="today-brief-title">
      <header className="today-brief-header">
        <div>
          <span className="today-label">{t('nav.today')}</span>
          <h1 id="today-brief-title">{headline}</h1>
          <p>{isAboveDistancePlan ? t('dashboard.weekAbovePlan') : t('dashboard.weekInProgress')}</p>
        </div>
        <time dateTime={today}>{formatDate(today)}</time>
      </header>

      {planned ? (
        <Link className="today-plan-row" to="/plans">
          <span className="today-plan-icon"><CalendarDays size={22} aria-hidden="true" /></span>
          <span>
            <strong>{planned.title}</strong>
            <small>
              {[planned.target_distance_m ? formatDistance(planned.target_distance_m) : null, planned.target_duration_s ? formatDuration(planned.target_duration_s) : null]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </span>
          <span className="today-plan-action">{t('dashboard.openPlanDetails')} <ChevronRight size={17} aria-hidden="true" /></span>
        </Link>
      ) : null}

      {plan ? (
        <dl className="today-evidence">
          <div>
            <dt>{t('dashboard.weeklyDistance')}</dt>
            <dd><strong>{formatDistance(plan.completed_distance_m)}</strong> {t('dashboard.ofPlanned', { value: formatDistance(plan.planned_distance_m) })}</dd>
          </div>
          <div>
            <dt>{t('dashboard.weeklyLoad')}</dt>
            <dd className={plan.load_delta >= 0 ? 'positive' : ''}><strong>{signedNumber(plan.load_delta)}</strong> {t('dashboard.vsPlan')}</dd>
          </div>
          <div>
            <dt>{t('dashboard.sessions')}</dt>
            <dd><strong>{plan.completed_sessions}</strong> {t('dashboard.ofSessions', { value: plan.planned_sessions })}</dd>
          </div>
        </dl>
      ) : null}

      {plan?.rows.length ? (
        <div className="today-week-agenda" aria-label={t('dashboard.thisWeek')}>
          {plan.rows.map((row) => (
            <div className={`today-week-day ${row.outcome}`} key={`${row.date}-${row.planned_workout_id ?? row.activity_id ?? 'day'}`}>
              <time dateTime={row.date}>{formatDate(row.date)}</time>
              <strong>{row.planned_title ?? row.activity_name ?? t('sidebar.restToday')}</strong>
              <small>{row.activity_id ? t('activities.syncedFromStrava') : row.planned_title ? t('dashboard.plannedLabel') : '—'}</small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function signedNumber(value: number) {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}
