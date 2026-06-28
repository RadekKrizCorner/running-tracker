import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Activity } from '../../lib/api/types';
import { formatDate, formatDistance, formatDuration, formatPace } from '../../lib/format';
import { enumLabel, useTranslation } from '../../lib/i18n';

type ActivityMobileListProps = {
  activities: Activity[];
};

export function ActivityMobileList({ activities }: ActivityMobileListProps) {
  const { t } = useTranslation();

  return (
    <div className="activity-mobile-list" data-testid="activity-mobile-list">
      {activities.map((activity) => (
        <Link className="activity-mobile-row" key={activity.id} to={`/activities/${activity.id}`}>
          <time dateTime={activity.start_time_utc}>{formatDate(activity.start_time_utc)}</time>
          <span className={`activity-status-dot ${activity.intensity_class ?? 'unknown'}`} aria-hidden="true" />
          <span className="activity-mobile-main">
            <strong>{activity.name ?? t('activity.run')}</strong>
            <small>{enumLabel(t, 'intensity', activity.intensity_class ?? 'unknown')}</small>
            <span className="activity-mobile-metrics">
              <span>{formatDistance(activity.distance_m)}</span>
              <span>{formatDuration(activity.moving_time_s)}</span>
              <span>{formatPace(activity.distance_m, activity.moving_time_s)}</span>
            </span>
            {activity.provider.toLowerCase() === 'strava' ? (
              <small className="activity-provider">{t('activities.syncedFromStrava')}</small>
            ) : null}
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
