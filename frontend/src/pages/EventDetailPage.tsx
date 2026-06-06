import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EventReadinessPanel } from '../components/events/EventReadinessPanel';
import { ActivityMap } from '../components/maps/ActivityMap';
import { EmptyState } from '../components/ui/EmptyState';
import { useEvent, useEventPlanningGuidance, useUpdateEvent } from '../features/events/api';
import type { Event, EventPlanningGuidance } from '../lib/api/types';
import { formatDate, formatDistance, formatDuration, formatPace, percent } from '../lib/format';
import { enumLabel, useTranslation } from '../lib/i18n';

const EVENT_TYPE_OPTIONS = [
  ['5k', 'eventType.5k'],
  ['10k', 'eventType.10k'],
  ['half_marathon', 'eventType.half_marathon'],
  ['marathon', 'eventType.marathon'],
  ['ultra', 'eventType.ultra'],
  ['trail', 'eventType.trail'],
  ['other', 'eventType.other'],
];
const POSTER_IMAGE_MAX_BYTES = 3_000_000;

export function EventDetailPage() {
  const { t } = useTranslation();
  const { eventId } = useParams();
  const event = useEvent(eventId);
  const guidance = useEventPlanningGuidance(eventId);
  const updateEvent = useUpdateEvent(eventId);

  if (event.isLoading) {
    return <div className="screen-center">{t('common.loadingEvent')}</div>;
  }
  if (!event.data) {
    return <EmptyState title={t('events.noEvents')} detail={t('events.noEventsDetail')} />;
  }

  return <EventDetail event={event.data} guidance={guidance.data} updateEvent={updateEvent} />;
}

function EventDetail({
  event,
  guidance,
  updateEvent,
}: {
  event: Event;
  guidance: EventPlanningGuidance | undefined;
  updateEvent: ReturnType<typeof useUpdateEvent>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t('events.detailEyebrow')}</p>
          <h1>{event.name}</h1>
          <p>{[event.location, eventTypeLabel(event.event_type, t), event.surface ? enumLabel(t, 'surface', event.surface) : null, event.priority ? enumLabel(t, 'priority', event.priority) : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={() => setEditing((current) => !current)}>
            {editing ? t('events.closeEditor') : t('events.editDetails')}
          </button>
          <Link className="secondary-button" to="/events">
            {t('events.allEvents')}
          </Link>
        </div>
      </header>
      <section className="metric-grid">
        <Metric label={t('events.countdown')} value={event.days_until_start >= 0 ? `${event.days_until_start} ${t('events.days')}` : t('common.completed')} />
        <Metric label={t('common.date')} value={formatDate(event.event_date)} />
        <Metric label={t('common.distance')} value={formatDistance(event.distance_m)} />
        <Metric label={t('events.targetTime')} value={event.target_time_s ? formatDuration(event.target_time_s) : t('common.notAvailable')} />
        <Metric label={t('events.targetPace')} value={formatPace(event.distance_m, event.target_time_s)} />
      </section>
      <EventReadinessPanel eventId={event.id} />
      {editing ? <EventDetailsEditor event={event} updateEvent={updateEvent} /> : null}
      <EventPrepSnapshot event={event} />
      <section className="split-grid">
        <PlanningGuidancePanel guidance={guidance} />
        <PosterPanel event={event} />
      </section>
      <CourseMapPanel event={event} />
      <section className="split-grid">
        <div className="panel">
          <h2>{t('events.preparation')}</h2>
          <div className="event-metrics detail">
            <Metric label={t('events.fourWeekLoad')} value={`${Math.round(event.preparation.current_4w_load)}`} />
            <Metric
              label={t('events.longRunReadiness')}
              value={event.preparation.long_run_event_distance_ratio === null ? t('common.notAvailable') : percent(event.preparation.long_run_event_distance_ratio, 1)}
            />
            <Metric label={t('events.plannedLoad')} value={`${Math.round(event.preparation.planned_load_to_event)}`} />
            <Metric label={t('events.plannedSessions')} value={`${event.preparation.planned_sessions_to_event}`} />
          </div>
        </div>
        <div className="panel">
          <h2>{t('events.eventFacts')}</h2>
          <dl className="detail-list">
            <div>
              <dt>{t('common.elevation')}</dt>
              <dd>{event.elevation_gain_m ? `${Math.round(event.elevation_gain_m)} m` : t('common.notAvailable')}</dd>
            </div>
            <div>
              <dt>{t('common.status')}</dt>
              <dd>{enumLabel(t, 'status', event.status)}</dd>
            </div>
            <div>
              <dt>{t('events.website')}</dt>
              <dd>{event.website_url ? <a href={event.website_url}>{event.website_url}</a> : t('common.notAvailable')}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="split-grid">
        <NotesPanel title={t('events.goal')} value={event.goal_notes} />
        <NotesPanel title={t('events.course')} value={event.course_notes} />
        <NotesPanel title={t('events.fueling')} value={event.fueling_notes} />
        <NotesPanel title={t('events.gear')} value={event.gear_notes} />
        <NotesPanel title={t('events.travel')} value={event.travel_notes} />
      </section>
    </div>
  );
}

function PlanningGuidancePanel({ guidance }: { guidance: EventPlanningGuidance | undefined }) {
  const { t } = useTranslation();
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('events.guidanceEyebrow')}</p>
          <h2>{t('events.guidance')}</h2>
        </div>
      </div>
      {guidance ? (
        <>
          <div className="event-prep-snapshot">
            <Metric label={t('events.weeklyDistance')} value={formatDistance(guidance.suggested_weekly_distance_m)} />
            <Metric label={t('events.longRunTarget')} value={formatDistance(guidance.suggested_long_run_m)} />
            <Metric label={t('events.weeksLeft')} value={`${guidance.weeks_until_start.toFixed(1)} ${t('calendar.weeks')}`} />
          </div>
          <div className="list-stack">
            {guidance.suggested_sessions.map((session) => (
              <div className="activity-row" key={`${session.workout_type}-${session.title}`}>
                <div>
                  <strong>{session.title}</strong>
                  <span>
                    {enumLabel(t, 'workout', session.workout_type)} · {enumLabel(t, 'intensity', session.target_intensity)} · {formatDistance(session.target_distance_m)}
                  </span>
                </div>
                <small>{session.detail}</small>
              </div>
            ))}
            {guidance.messages.map((message) => (
              <div className="activity-row" key={`${message.title}-${message.tone}`}>
                <span className={`badge ${message.tone}`}>{t(`readiness.tone.${message.tone}`)}</span>
                <div>
                  <strong>{message.title}</strong>
                  <span>{message.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title={t('events.noGuidance')} detail={t('events.noGuidanceDetail')} />
      )}
    </section>
  );
}

function PosterPanel({
  event,
}: {
  event: Event;
}) {
  const { t } = useTranslation();
  const posterImage = safePosterImage(event.poster_image_data);
  return (
    <section className="panel event-poster-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('events.eventImage')}</p>
          <h2>{t('events.poster')}</h2>
        </div>
      </div>
      {posterImage ? (
        <img className="event-poster-image" src={posterImage} alt={`${event.name} poster`} />
      ) : (
        <EmptyState title={t('events.noPoster')} detail={t('events.noPosterDetail')} />
      )}
    </section>
  );
}

function EventPrepSnapshot({ event }: { event: Event }) {
  const { t } = useTranslation();
  const ratio = event.preparation.long_run_event_distance_ratio;
  return (
    <section className="panel event-prep-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('events.snapshot')}</p>
          <h2>{t('events.readiness')}</h2>
        </div>
        <span className="badge">{event.weeks_until_start.toFixed(1)} {t('calendar.weeks')}</span>
      </div>
      <div className="event-prep-snapshot">
        <Metric label={t('events.weeksLeft')} value={`${event.weeks_until_start.toFixed(1)} ${t('calendar.weeks')}`} />
        <Metric label={t('events.longRunReadiness')} value={ratio === null ? t('common.notAvailable') : t('events.longRunCovers', { value: percent(ratio, 1) })} />
      </div>
    </section>
  );
}

function NotesPanel({ title, value }: { title: string; value: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="panel">
      <h2>{title}</h2>
      <p>{value || t('events.noNotes')}</p>
    </div>
  );
}

function EventDetailsEditor({
  event,
  updateEvent,
}: {
  event: Event;
  updateEvent: ReturnType<typeof useUpdateEvent>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(eventDetailsForm(event));
  const [saved, setSaved] = useState(false);
  const [gpxFileStatus, setGpxFileStatus] = useState<string | null>(null);
  const [posterFileStatus, setPosterFileStatus] = useState<string | null>(null);

  useEffect(() => {
    setForm(eventDetailsForm(event));
    setGpxFileStatus(null);
    setPosterFileStatus(null);
  }, [event]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('events.editableSetup')}</p>
          <h2>{t('events.details')}</h2>
        </div>
        {saved ? <span className="status-pill success">{t('events.savedDetails')}</span> : null}
      </div>
      <form
        className="event-detail-editor"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          setSaved(false);
          updateEvent.mutate(
            {
              name: form.name.trim() || event.name,
              event_date: form.event_date,
              location: emptyToNull(form.location),
              event_type: form.event_type,
              distance_m: numberOrNull(form.distance_km, 1000),
              elevation_gain_m: numberOrNull(form.elevation_gain_m),
              surface: emptyToNull(form.surface),
              priority: emptyToNull(form.priority),
              status: form.status || 'planned',
              target_time_s: parseTimeToSeconds(form.target_time),
              website_url: emptyToNull(form.website_url),
              goal_notes: emptyToNull(form.goal_notes),
              course_notes: emptyToNull(form.course_notes),
              fueling_notes: emptyToNull(form.fueling_notes),
              gear_notes: emptyToNull(form.gear_notes),
              travel_notes: emptyToNull(form.travel_notes),
              course_map_url: emptyToNull(form.course_map_url),
              course_gpx: emptyToNull(form.course_gpx),
              poster_image_data: emptyToNull(form.poster_image_data),
            },
            { onSuccess: () => setSaved(true) },
          );
        }}
      >
        <label>
          {t('events.eventName')}
          <input value={form.name} onChange={(change) => setFormValue(setForm, 'name', change.target.value)} />
        </label>
        <label>
          {t('events.eventDate')}
          <input type="date" value={form.event_date} onChange={(change) => setFormValue(setForm, 'event_date', change.target.value)} />
        </label>
        <label>
          {t('events.location')}
          <input value={form.location} onChange={(change) => setFormValue(setForm, 'location', change.target.value)} />
        </label>
        <label>
          {t('events.eventType')}
          <select value={form.event_type} onChange={(change) => setFormValue(setForm, 'event_type', change.target.value)}>
            {EVENT_TYPE_OPTIONS.map(([value, label]) => (
              <option value={value} key={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('events.distanceKm')}
          <input value={form.distance_km} inputMode="decimal" onChange={(change) => setDistanceValue(setForm, change.target.value)} />
        </label>
        <label>
          {t('events.elevationM')}
          <input value={form.elevation_gain_m} inputMode="numeric" onChange={(change) => setFormValue(setForm, 'elevation_gain_m', change.target.value)} />
        </label>
        <label>
          {t('events.surface')}
          <select value={form.surface} onChange={(change) => setFormValue(setForm, 'surface', change.target.value)}>
            <option value="">{t('events.notSet')}</option>
            <option value="road">{t('surface.road')}</option>
            <option value="trail">{t('surface.trail')}</option>
            <option value="mixed">{t('surface.mixed')}</option>
            <option value="track">{t('surface.track')}</option>
          </select>
        </label>
        <label>
          {t('events.priority')}
          <select value={form.priority} onChange={(change) => setFormValue(setForm, 'priority', change.target.value)}>
            <option value="">{t('events.notSet')}</option>
            <option value="A">{t('priority.A')}</option>
            <option value="B">{t('priority.B')}</option>
            <option value="tune-up">{t('priority.tune-up')}</option>
            <option value="fun">{t('priority.fun')}</option>
          </select>
        </label>
        <label>
          {t('common.status')}
          <select value={form.status} onChange={(change) => setFormValue(setForm, 'status', change.target.value)}>
            <option value="planned">{t('status.planned')}</option>
            <option value="completed">{t('status.completed')}</option>
            <option value="cancelled">{t('status.cancelled')}</option>
          </select>
        </label>
        <label>
          {t('events.website')}
          <input value={form.website_url} onChange={(change) => setFormValue(setForm, 'website_url', change.target.value)} />
        </label>
        <label className="event-detail-editor-wide">
          {t('events.uploadPoster')}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(change) => {
              const file = change.target.files?.[0];
              if (!file) {
                return;
              }
              if (!file.type.startsWith('image/')) {
                setPosterFileStatus(t('events.chooseImage'));
                return;
              }
              if (file.size > POSTER_IMAGE_MAX_BYTES) {
                setPosterFileStatus(t('events.posterTooLarge'));
                return;
              }
              setPosterFileStatus(t('events.readingPoster'));
              readDataUrlFile(
                file,
                (content) => {
                  setFormValue(setForm, 'poster_image_data', content);
                  setPosterFileStatus(t('events.loadedFile', { name: file.name }));
                },
                () => setPosterFileStatus(t('events.posterReadFailed')),
              );
            }}
          />
        </label>
        {safePosterImage(form.poster_image_data) ? (
          <div className="event-detail-editor-wide poster-preview-row">
            <img className="event-poster-image compact" src={safePosterImage(form.poster_image_data) ?? ''} alt={`${form.name || event.name} poster`} />
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setFormValue(setForm, 'poster_image_data', '');
                setPosterFileStatus(t('events.noPoster'));
              }}
            >
              {t('events.removePoster')}
            </button>
          </div>
        ) : null}
        <label>
          {t('events.targetTime')}
          <input value={form.target_time} placeholder="00:50:00" onChange={(change) => setTargetTimeValue(setForm, change.target.value)} />
        </label>
        <label>
          {t('events.targetPace')}
          <input value={form.target_pace} placeholder="5:00/km" onChange={(change) => setTargetPaceValue(setForm, change.target.value)} />
        </label>
        <label>
          {t('events.goal')}
          <textarea value={form.goal_notes} onChange={(change) => setFormValue(setForm, 'goal_notes', change.target.value)} />
        </label>
        <label>
          {t('events.course')}
          <textarea value={form.course_notes} onChange={(change) => setFormValue(setForm, 'course_notes', change.target.value)} />
        </label>
        <label>
          {t('events.fueling')}
          <textarea value={form.fueling_notes} onChange={(change) => setFormValue(setForm, 'fueling_notes', change.target.value)} />
        </label>
        <label>
          {t('events.gear')}
          <textarea value={form.gear_notes} onChange={(change) => setFormValue(setForm, 'gear_notes', change.target.value)} />
        </label>
        <label>
          {t('events.travel')}
          <textarea value={form.travel_notes} onChange={(change) => setFormValue(setForm, 'travel_notes', change.target.value)} />
        </label>
        <label>
          {t('events.mapUrl')}
          <input value={form.course_map_url} onChange={(change) => setFormValue(setForm, 'course_map_url', change.target.value)} />
        </label>
        <label>
          {t('events.importGpx')}
          <input
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            onChange={(change) => {
              const file = change.target.files?.[0];
              if (!file) {
                return;
              }
              setGpxFileStatus(t('events.readingGpx'));
              readTextFile(
                file,
                (content) => {
                  setFormValue(setForm, 'course_gpx', content);
                  setGpxFileStatus(t('events.loadedFile', { name: file.name }));
                },
                () => setGpxFileStatus(t('events.gpxReadFailed')),
              );
            }}
          />
        </label>
        <div className="button-row">
          <button className="primary-button" type="submit" disabled={updateEvent.isPending}>
            {updateEvent.isPending ? t('events.savingDetails') : t('events.saveDetails')}
          </button>
          {posterFileStatus ? <span className="status-pill neutral">{posterFileStatus}</span> : null}
          {gpxFileStatus ? <span className="status-pill neutral">{gpxFileStatus}</span> : null}
          {updateEvent.error instanceof Error ? <span className="status-pill warning">{updateEvent.error.message}</span> : null}
        </div>
      </form>
    </section>
  );
}

function CourseMapPanel({ event }: { event: Event }) {
  const { t } = useTranslation();
  const coordinates = useMemo(() => parseGpxRoute(event.course_gpx), [event.course_gpx]);
  const courseUrl = safeHttpUrl(event.course_map_url);
  const hasRawCourseUrl = Boolean(event.course_map_url?.trim());
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('events.course')}</p>
          <h2>{t('events.courseMap')}</h2>
        </div>
        {courseUrl ? (
          <a className="secondary-button" href={courseUrl} target="_blank" rel="noreferrer">
            {t('events.openCourse')}
          </a>
        ) : null}
      </div>
      {coordinates.length > 0 ? (
        <div data-testid="event-course-map">
          <ActivityMap streams={[{ stream_type: 'latlng', data: coordinates, sample_count: coordinates.length }]} mapPolyline={null} />
          <p className="helper-text">{t('events.gpxLoaded', { count: coordinates.length })}</p>
        </div>
      ) : courseUrl ? (
        <div className="course-map-frame" data-testid="event-course-map">
          <iframe title={`${event.name} course map`} src={courseUrl} sandbox="allow-scripts allow-same-origin allow-popups" />
          <p className="helper-text">{t('events.embedBlocked')}</p>
        </div>
      ) : hasRawCourseUrl ? (
        <EmptyState title={t('events.courseNotEmbeddable')} detail={t('events.courseNotEmbeddableDetail')} />
      ) : (
        <EmptyState title={t('events.noCourseMap')} detail={t('events.noCourseMapDetail')} />
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function eventTypeLabel(value: string, t: (key: string) => string) {
  return enumLabel(t, 'eventType', value);
}

function eventDetailsForm(event: Event) {
  return {
    name: event.name,
    event_date: event.event_date,
    location: event.location ?? '',
    event_type: event.event_type,
    distance_km: event.distance_m ? String(event.distance_m / 1000) : '',
    elevation_gain_m: event.elevation_gain_m === null ? '' : String(Math.round(event.elevation_gain_m)),
    surface: event.surface ?? '',
    priority: event.priority ?? '',
    status: event.status,
    target_time: formatSecondsAsTime(event.target_time_s),
    target_pace: formatPaceInput(event.target_pace_s_per_km),
    website_url: event.website_url ?? '',
    goal_notes: event.goal_notes ?? '',
    course_notes: event.course_notes ?? '',
    fueling_notes: event.fueling_notes ?? '',
    gear_notes: event.gear_notes ?? '',
    travel_notes: event.travel_notes ?? '',
    course_map_url: event.course_map_url ?? '',
    course_gpx: event.course_gpx ?? '',
    poster_image_data: event.poster_image_data ?? '',
  };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function setFormValue<T extends Record<string, string>>(setForm: (updater: (current: T) => T) => void, key: keyof T, value: string) {
  setForm((current) => ({ ...current, [key]: value }));
}

function setDistanceValue<T extends Record<string, string>>(setForm: (updater: (current: T) => T) => void, value: string) {
  setForm((current) => {
    const distanceM = numberOrNull(value, 1000);
    const paceS = parsePaceToSeconds(current.target_pace);
    return {
      ...current,
      distance_km: value,
      target_time: distanceM && paceS ? formatSecondsAsTime(Math.round((distanceM / 1000) * paceS)) : current.target_time,
    };
  });
}

function setTargetTimeValue<T extends Record<string, string>>(setForm: (updater: (current: T) => T) => void, value: string) {
  setForm((current) => {
    const distanceM = numberOrNull(current.distance_km, 1000);
    const targetTimeS = parseTimeToSeconds(value);
    return {
      ...current,
      target_time: value,
      target_pace: distanceM && targetTimeS ? formatPaceInput(targetTimeS / (distanceM / 1000)) : '',
    };
  });
}

function setTargetPaceValue<T extends Record<string, string>>(setForm: (updater: (current: T) => T) => void, value: string) {
  setForm((current) => {
    const distanceM = numberOrNull(current.distance_km, 1000);
    const paceS = parsePaceToSeconds(value);
    return {
      ...current,
      target_pace: value,
      target_time: distanceM && paceS ? formatSecondsAsTime(Math.round((distanceM / 1000) * paceS)) : current.target_time,
    };
  });
}

function numberOrNull(value: string, multiplier = 1) {
  const numeric = Number(value.replace(',', '.'));
  return Number.isFinite(numeric) && value.trim() !== '' ? numeric * multiplier : null;
}

function parseTimeToSeconds(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length !== 1) {
    return null;
  }
  return parts[0];
}

function parsePaceToSeconds(value: string) {
  const clean = value.toLowerCase().replace('/km', '').trim();
  if (!clean) {
    return null;
  }
  const parts = clean.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1) {
    return parts[0] * 60;
  }
  return null;
}

function formatSecondsAsTime(seconds: number | null | undefined) {
  if (!seconds) {
    return '';
  }
  const roundedSeconds = Math.round(seconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;
  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatPaceInput(seconds: number | null | undefined) {
  if (!seconds) {
    return '';
  }
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}/km`;
}

function readTextFile(file: File, onLoad: (content: string) => void, onError: () => void) {
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result ?? ''));
  reader.onerror = onError;
  reader.readAsText(file);
}

function readDataUrlFile(file: File, onLoad: (content: string) => void, onError: () => void) {
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result ?? ''));
  reader.onerror = onError;
  reader.readAsDataURL(file);
}

function safePosterImage(value: string | null | undefined) {
  if (!value?.startsWith('data:image/')) {
    return null;
  }
  return value;
}

function safeHttpUrl(value: string | null | undefined) {
  if (!value?.trim()) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch (_error) {
    return null;
  }
}

function parseGpxRoute(gpx: string | null | undefined): [number, number][] {
  if (!gpx?.trim()) {
    return [];
  }
  try {
    const document = new DOMParser().parseFromString(gpx, 'application/xml');
    if (document.querySelector('parsererror')) {
      return [];
    }
    return Array.from(document.querySelectorAll('trkpt,rtept'))
      .map((point) => [Number(point.getAttribute('lat')), Number(point.getAttribute('lon'))] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180);
  } catch (_error) {
    return [];
  }
}
