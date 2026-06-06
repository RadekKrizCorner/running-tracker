import { EmptyState } from '../ui/EmptyState';
import { useEventReadiness } from '../../features/events/api';
import type { EventGuidanceMessage, EventReadinessItem } from '../../lib/api/types';
import { formatDistance, formatDuration, formatPaceSeconds, percent } from '../../lib/format';
import { enumLabel, useTranslation } from '../../lib/i18n';

export function EventReadinessPanel({ eventId }: { eventId: string | undefined }) {
  const { t } = useTranslation();
  const readiness = useEventReadiness(eventId);

  if (readiness.isLoading) {
    return (
      <section aria-label={t('events.readinessDashboard')} className="panel event-readiness-panel">
        <p>{t('events.readinessLoading')}</p>
      </section>
    );
  }

  if (readiness.isError || !readiness.data) {
    return (
      <section aria-label={t('events.readinessDashboard')} className="panel event-readiness-panel">
        <EmptyState title={t('events.readinessUnavailable')} detail={t('events.readinessUnavailableDetail')} />
      </section>
    );
  }

  const data = readiness.data;
  return (
    <section aria-label={t('events.readinessDashboard')} className="panel event-readiness-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('events.readinessEyebrow')}</p>
          <h2>{t('events.readinessDashboard')}</h2>
        </div>
        <span className="badge">{phaseLabel(t, data.phase)}</span>
      </div>

      <div className="event-readiness-grid">
        <ReadinessMetric
          label={t('events.countdown')}
          value={data.days_until_start >= 0 ? `${data.days_until_start} ${t('events.days')}` : t('common.completed')}
          detail={phaseLabel(t, data.phase)}
        />
        <ReadinessMetric label={t('events.targetPace')} value={formatPaceSeconds(data.target_pace_s_per_km)} detail={t('events.targetPaceMetric')} />
        <ReadinessMetric
          label={t('events.fourWeekDistance')}
          value={formatDistance(data.recent_4w_distance_m)}
          detail={t('events.runsValue', { count: data.recent_4w_run_count })}
        />
        <ReadinessMetric label={t('events.fourWeekLoad')} value={`${Math.round(data.recent_4w_load)}`} detail={t('common.load')} />
        <ReadinessMetric
          label={t('events.longestEightWeeks')}
          value={formatDistance(data.longest_run_8w_m)}
          detail={
            data.long_run_event_distance_ratio === null
              ? t('common.notAvailable')
              : t('events.longRunCovers', { value: percent(data.long_run_event_distance_ratio, 1) })
          }
        />
        <ReadinessMetric
          label={t('events.plannedToEvent')}
          value={formatDistance(data.planned_distance_to_event_m)}
          detail={`${t('events.sessionsValue', { count: data.planned_sessions_to_event })} · ${t('common.load')} ${Math.round(data.planned_load_to_event)}`}
        />
        <ReadinessMetric
          label={t('events.missedSessions')}
          value={t('events.missedValue', { count: data.missed_planned_sessions })}
          detail={t('events.recent4w')}
        />
      </div>

      <div className="event-readiness-sections">
        <div>
          <h3>{t('events.intensityMix')}</h3>
          <div className="event-readiness-intensity">
            <IntensityMetric label={enumLabel(t, 'intensity', 'easy')} seconds={data.intensity_mix.easy_time_s} />
            <IntensityMetric label={enumLabel(t, 'intensity', 'moderate')} seconds={data.intensity_mix.moderate_time_s} />
            <IntensityMetric label={enumLabel(t, 'intensity', 'hard')} seconds={data.intensity_mix.hard_time_s} />
            <IntensityMetric label={enumLabel(t, 'intensity', 'unknown')} seconds={data.intensity_mix.unknown_time_s} />
          </div>
        </div>

        <div>
          <h3>{t('events.readinessItems')}</h3>
          <div className="list-stack">
            {data.readiness_items.map((item) => (
              <ReadinessItemRow item={item} key={item.key} />
            ))}
          </div>
        </div>

        {data.guidance_messages.length > 0 ? (
          <div>
            <h3>{t('events.guidanceMessages')}</h3>
            <div className="list-stack">
              {data.guidance_messages.map((message) => (
                <GuidanceMessageRow key={`${message.title}-${message.tone}`} message={message} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ReadinessMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="event-readiness-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function IntensityMetric({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{formatDuration(seconds)}</strong>
    </div>
  );
}

function ReadinessItemRow({ item }: { item: EventReadinessItem }) {
  const { t } = useTranslation();
  return (
    <div className="activity-row readiness-row">
      <span className={`status-pill ${statusTone(item.status)}`}>{t(`readiness.status.${item.status}`)}</span>
      <div>
        <strong>{item.label}</strong>
        <span>{item.value}</span>
        <small>{item.detail}</small>
      </div>
    </div>
  );
}

function GuidanceMessageRow({ message }: { message: EventGuidanceMessage }) {
  return (
    <div className="activity-row readiness-row">
      <span className={`badge ${message.tone}`}>{message.tone}</span>
      <div>
        <strong>{message.title}</strong>
        <span>{message.detail}</span>
      </div>
    </div>
  );
}

function phaseLabel(t: (key: string) => string, phase: string) {
  return t(`eventPhase.${phase}`);
}

function statusTone(status: EventReadinessItem['status']) {
  if (status === 'good') {
    return 'success';
  }
  if (status === 'watch' || status === 'missing') {
    return 'warning';
  }
  return 'neutral';
}
