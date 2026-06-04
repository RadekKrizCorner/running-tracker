import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActivityMap } from '../components/maps/ActivityMap';
import { EmptyState } from '../components/ui/EmptyState';
import { RunnerScene } from '../components/visuals/RunnerScene';
import { useCreateEvent, useEvents } from '../features/events/api';
import type { Event } from '../lib/api/types';
import { formatDate, formatDuration, formatPace, percent } from '../lib/format';
import { enumLabel, useTranslation } from '../lib/i18n';

const EVENT_TYPES = [
  ['5k', 'eventType.5k'],
  ['10k', 'eventType.10k'],
  ['half_marathon', 'eventType.half_marathon'],
  ['marathon', 'eventType.marathon'],
  ['ultra', 'eventType.ultra'],
  ['trail', 'eventType.trail'],
  ['other', 'eventType.other'],
];

type EventForm = {
  name: string;
  event_date: string;
  location: string;
  event_type: string;
  distance_km: string;
  elevation_gain_m: string;
  surface: string;
  priority: string;
  target_time: string;
  goal_notes: string;
};

export function EventsPage() {
  const { t } = useTranslation();
  const events = useEvents();
  const createEvent = useCreateEvent();
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="page-stack">
      <header className="visual-page-hero race">
        <div>
          <p className="eyebrow">{t('events.eyebrow')}</p>
          <h1>{t('events.title')}</h1>
          <p>{t('events.hero')}</p>
          <div className="hero-stat-row">
            <span>{events.data?.length ?? 0} {t('events.tracked')}</span>
            <span>{t('events.countdowns')}</span>
            <span>{t('events.courseNotes')}</span>
          </div>
          <div className="button-row event-hero-actions">
            <button className="primary-button" type="button" onClick={() => setWizardOpen(true)}>
              {t('calendar.addEvent')}
            </button>
          </div>
        </div>
        <RunnerScene variant="race" label={t('events.title')} />
      </header>
      {wizardOpen ? <CreateEventWizard createEvent={createEvent} onClose={() => setWizardOpen(false)} /> : null}
      {!events.isLoading && (events.data ?? []).length === 0 ? (
        <EmptyState
          title={t('events.noEvents')}
          detail={t('events.noEventsDetail')}
          visual={<RunnerScene variant="race" />}
        />
      ) : null}
      <div className="events-grid">
        {(events.data ?? []).map((event) => (
          <EventCard event={event} key={event.id} />
        ))}
      </div>
    </div>
  );
}

function CreateEventWizard({
  createEvent,
  onClose,
}: {
  createEvent: ReturnType<typeof useCreateEvent>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<EventForm>(initialEventForm());
  const canContinue = Boolean(form.name.trim() && form.event_date);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-label={t('events.createEvent')}
        aria-modal="true"
        className="modal-panel event-wizard"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t('events.step', { step })}</p>
            <h2>{t('events.createEvent')}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t('events.closeWizard')} onClick={onClose}>
            ×
          </button>
        </div>
        <form
          className="event-wizard-form"
          onSubmit={(event) => {
            event.preventDefault();
            createEvent.mutate(eventPayloadFromForm(form), { onSuccess: onClose });
          }}
        >
          {step === 1 ? (
            <div className="event-editor">
              <label>
                {t('events.eventName')}
                <input value={form.name} onChange={(event) => setFormValue(setForm, 'name', event.target.value)} required />
              </label>
              <label>
                {t('events.eventDate')}
                <input
                  type="date"
                  value={form.event_date}
                  onChange={(event) => setFormValue(setForm, 'event_date', event.target.value)}
                  required
                />
              </label>
              <label>
                {t('events.location')}
                <input value={form.location} onChange={(event) => setFormValue(setForm, 'location', event.target.value)} />
              </label>
              <label>
                {t('events.eventType')}
                <select value={form.event_type} onChange={(event) => setFormValue(setForm, 'event_type', event.target.value)}>
                  {EVENT_TYPES.map(([value, label]) => (
                    <option value={value} key={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="event-editor">
              <label>
                {t('events.distanceKm')}
                <input
                  value={form.distance_km}
                  inputMode="decimal"
                  onChange={(event) => setFormValue(setForm, 'distance_km', event.target.value)}
                />
              </label>
              <label>
                {t('events.elevationM')}
                <input
                  value={form.elevation_gain_m}
                  inputMode="numeric"
                  onChange={(event) => setFormValue(setForm, 'elevation_gain_m', event.target.value)}
                />
              </label>
              <label>
                {t('events.surface')}
                <select value={form.surface} onChange={(event) => setFormValue(setForm, 'surface', event.target.value)}>
                  <option value="road">{t('surface.road')}</option>
                  <option value="trail">{t('surface.trail')}</option>
                  <option value="mixed">{t('surface.mixed')}</option>
                  <option value="track">{t('surface.track')}</option>
                </select>
              </label>
              <label>
                {t('events.priority')}
                <select value={form.priority} onChange={(event) => setFormValue(setForm, 'priority', event.target.value)}>
                  <option value="A">{t('priority.A')}</option>
                  <option value="B">{t('priority.B')}</option>
                  <option value="tune-up">{t('priority.tune-up')}</option>
                  <option value="fun">{t('priority.fun')}</option>
                </select>
              </label>
              <label>
                {t('events.targetTime')}
                <input
                  placeholder="00:50:00"
                  value={form.target_time}
                  onChange={(event) => setFormValue(setForm, 'target_time', event.target.value)}
                />
              </label>
              <label className="event-editor-wide">
                {t('events.goalNotes')}
                <input value={form.goal_notes} onChange={(event) => setFormValue(setForm, 'goal_notes', event.target.value)} />
              </label>
            </div>
          )}
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={step === 1 ? onClose : () => setStep(1)}>
              {step === 1 ? t('common.cancel') : t('common.back')}
            </button>
            {step === 1 ? (
              <button className="primary-button" type="button" disabled={!canContinue} onClick={() => setStep(2)}>
                {t('common.next')}
              </button>
            ) : (
              <button className="primary-button" type="submit" disabled={createEvent.isPending}>
                {createEvent.isPending ? t('events.creatingEvent') : t('events.createEvent')}
              </button>
            )}
          </div>
          {createEvent.error instanceof Error ? <span className="status-pill warning">{createEvent.error.message}</span> : null}
        </form>
      </section>
    </div>
  );
}

function EventCard({ event }: { event: Event }) {
  const { t } = useTranslation();
  const posterImage = safePosterImage(event.poster_image_data);
  const websiteUrl = safeHttpUrl(event.website_url);
  return (
    <article className="event-card">
      {posterImage ? <img className="event-card-poster" src={posterImage} alt={`${event.name} poster`} /> : null}
      <div>
        <span className="badge">{eventTypeLabel(event.event_type, t)}</span>
        <h2>
          <Link to={`/events/${event.id}`}>{event.name}</Link>
        </h2>
        <p>{[event.location, event.surface, event.priority].filter(Boolean).join(' · ')}</p>
        {websiteUrl ? (
          <a className="event-card-link" href={websiteUrl} target="_blank" rel="noreferrer">
            {t('events.website')}
          </a>
        ) : null}
      </div>
      <div className="event-countdown">
        <strong>{event.days_until_start >= 0 ? `${event.days_until_start} ${t('events.days')}` : t('common.completed')}</strong>
        <span>{formatDate(event.event_date)}</span>
      </div>
      <EventPrepSnapshot event={event} />
      <div className="event-metrics">
        <Metric label={t('events.targetPaceMetric')} value={formatPace(event.distance_m, event.target_time_s)} />
      </div>
      <EventCoursePreview event={event} />
      {event.target_time_s ? <small>{t('events.targetTimePrefix', { value: formatDuration(event.target_time_s) })}</small> : null}
    </article>
  );
}

function EventCoursePreview({ event }: { event: Event }) {
  const coordinates = useMemo(() => parseGpxRoute(event.course_gpx), [event.course_gpx]);
  const courseUrl = safeHttpUrl(event.course_map_url);
  if (coordinates.length > 0) {
    return (
      <div className="event-map-preview" data-testid="event-card-map-preview">
        <ActivityMap streams={[{ stream_type: 'latlng', data: coordinates, sample_count: coordinates.length }]} mapPolyline={null} />
      </div>
    );
  }
  if (courseUrl) {
    return (
      <div className="event-map-preview" data-testid="event-card-map-preview">
        <iframe
          title={`${event.name} course map preview`}
          src={courseUrl}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      </div>
    );
  }
  return null;
}

function EventPrepSnapshot({ event }: { event: Event }) {
  const { t } = useTranslation();
  const ratio = event.preparation.long_run_event_distance_ratio;
  return (
    <div className="event-prep-snapshot">
      <Metric label={t('events.weeksLeft')} value={`${event.weeks_until_start.toFixed(1)} ${t('calendar.weeks')}`} />
      <Metric label={t('events.longRunReadiness')} value={ratio === null ? t('common.notAvailable') : t('events.longRunCovers', { value: percent(ratio, 1) })} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function initialEventForm(): EventForm {
  return {
    name: '',
    event_date: '',
    location: '',
    event_type: '10k',
    distance_km: '',
    elevation_gain_m: '',
    surface: 'road',
    priority: 'B',
    target_time: '',
    goal_notes: '',
  };
}

function eventPayloadFromForm(form: EventForm) {
  return {
    name: form.name,
    event_date: form.event_date,
    location: form.location || null,
    event_type: form.event_type,
    distance_m: numberOrNull(form.distance_km, 1000),
    elevation_gain_m: numberOrNull(form.elevation_gain_m),
    surface: form.surface || null,
    priority: form.priority || null,
    target_time_s: parseTimeToSeconds(form.target_time),
    goal_notes: form.goal_notes || null,
  };
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
  return parts[0];
}

function setFormValue<T extends Record<string, string>>(setForm: (updater: (current: T) => T) => void, key: keyof T, value: string) {
  setForm((current) => ({ ...current, [key]: value }));
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

function eventTypeLabel(value: string, t: (key: string) => string) {
  return enumLabel(t, 'eventType', value);
}
