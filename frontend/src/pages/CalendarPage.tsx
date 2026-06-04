import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/EmptyState';
import { useCalendar, useCreateCalendarEvent } from '../features/plans/api';
import type { CalendarActivity, CalendarEvent, PlannedWorkout } from '../lib/api/types';
import { addDaysToIso, addMonthsToIso, parseIsoDate, toIsoDate, todayIso, weekStartIso, weekdayLabel } from '../lib/date';
import { formatDate, formatDistance, formatDuration } from '../lib/format';
import { useTranslation } from '../lib/i18n';

type CalendarView = 'week' | 'month';

export function CalendarPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<CalendarView>('month');
  const [anchorDate, setAnchorDate] = useState(todayIso());
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventInitialDate, setEventInitialDate] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const range = useMemo(() => calendarRange(anchorDate, view), [anchorDate, view]);
  const calendar = useCalendar(range.start, range.end);
  const createEvent = useCreateCalendarEvent();
  const items = useMemo(() => buildCalendarItems(calendar.data), [calendar.data]);
  const itemsByDate = useMemo(() => groupItemsByDate(items), [items]);
  const visibleDates = useMemo(() => visibleCalendarDates(anchorDate, view), [anchorDate, view]);
  const selectedItems = selectedDate ? itemsByDate.get(selectedDate) ?? [] : [];
  const hasItems = items.length > 0;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t('calendar.eyebrow')}</p>
          <h1>{t('calendar.title')}</h1>
        </div>
        <div className="date-controls">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEventInitialDate(anchorDate);
              setSelectedDate(null);
              setEventDialogOpen(true);
            }}
          >
            {t('calendar.addEvent')}
          </button>
          <div className="segmented-control" role="group" aria-label={t('calendar.view')}>
            <button className={view === 'week' ? 'active' : ''} type="button" onClick={() => setView('week')}>
              {t('calendar.week')}
            </button>
            <button className={view === 'month' ? 'active' : ''} type="button" onClick={() => setView('month')}>
              {t('calendar.month')}
            </button>
          </div>
          <input aria-label={t('calendar.date')} type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
        </div>
      </header>

      <section className="calendar-shell">
        <div className="calendar-toolbar">
          <button className="secondary-button" type="button" onClick={() => setAnchorDate(shiftCalendarAnchor(anchorDate, view, -1))}>
            {t('common.previous')}
          </button>
          <strong>{formatDate(range.start)} - {formatDate(range.end)}</strong>
          <button className="secondary-button" type="button" onClick={() => setAnchorDate(shiftCalendarAnchor(anchorDate, view, 1))}>
            {t('common.next')}
          </button>
        </div>

        {!calendar.isLoading && !hasItems ? (
          <EmptyState title={t('calendar.nothingScheduled')} detail={t('calendar.nothingScheduledDetail')} />
        ) : null}

        <div className={`calendar-board ${view}`}>
          {visibleDates.map((date) => (
            <CalendarDayCell
              key={date}
              date={date}
              view={view}
              muted={view === 'month' && !sameMonth(date, anchorDate)}
              items={itemsByDate.get(date) ?? []}
              onOpen={() => {
                setSelectedDate(date);
              }}
            />
          ))}
        </div>
      </section>

      {eventDialogOpen ? (
        <CalendarEventDialog
          createEvent={createEvent}
          initialDate={eventInitialDate || anchorDate}
          onClose={() => setEventDialogOpen(false)}
        />
      ) : null}

      <Drawer title={selectedDate ? formatDate(selectedDate) : t('calendar.selectedDay')} open={selectedDate !== null} onClose={() => setSelectedDate(null)}>
        <div className="calendar-drawer-content">
          <div className="drawer-quick-actions">
            <strong>{t('calendar.quickActions')}</strong>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  if (selectedDate) {
                    setEventInitialDate(selectedDate);
                    setSelectedDate(null);
                    setEventDialogOpen(true);
                  }
                }}
              >
                {t('calendar.addEventThisDay')}
              </button>
              <a className="secondary-button" href="/plans">
                {t('calendar.planWorkout')}
              </a>
            </div>
          </div>
          <div className="calendar-day-items full">
            {selectedItems.length > 0 ? selectedItems.map((item) => <CalendarItemCard item={item} key={item.id} />) : <p>{t('calendar.noItems')}</p>}
          </div>
        </div>
      </Drawer>
    </div>
  );
}

function CalendarEventDialog({
  createEvent,
  initialDate,
  onClose,
}: {
  createEvent: ReturnType<typeof useCreateCalendarEvent>;
  initialDate: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(initialDate);
  const [eventType, setEventType] = useState('race');
  const [eventNotes, setEventNotes] = useState('');

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-label={t('calendar.addEvent')}
        aria-modal="true"
        className="modal-panel calendar-event-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t('calendar.marker')}</p>
            <h2>{t('calendar.addEvent')}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t('common.close')} onClick={onClose}>
            ×
          </button>
        </div>
        <form
          className="event-form compact"
          onSubmit={(event) => {
            event.preventDefault();
            createEvent.mutate(
              {
                event_date: eventDate,
                event_type: eventType,
                title: eventTitle,
                notes: eventNotes || null,
              },
              { onSuccess: onClose },
            );
          }}
        >
          <label>
            {t('calendar.eventTitle')}
            <input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} required />
          </label>
          <label>
            {t('calendar.eventDate')}
            <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required />
          </label>
          <label>
            {t('calendar.eventType')}
            <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
              <option value="race">{t('eventType.race')}</option>
              <option value="event">{t('eventType.event')}</option>
              <option value="travel">{t('eventType.travel')}</option>
              <option value="note">{t('eventType.note')}</option>
            </select>
          </label>
          <label>
            {t('common.notes')}
            <input value={eventNotes} onChange={(event) => setEventNotes(event.target.value)} />
          </label>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="primary-button" type="submit" disabled={createEvent.isPending}>
              {createEvent.isPending ? t('calendar.savingEvent') : t('calendar.saveEvent')}
            </button>
          </div>
          {createEvent.error instanceof Error ? <span className="status-pill warning">{createEvent.error.message}</span> : null}
        </form>
      </section>
    </div>
  );
}

type CalendarItem = {
  id: string;
  kind: string;
  variant?: string;
  date: string;
  label: string;
  title: string;
  detail: string | null;
  meta: string;
  href?: string;
};

function CalendarDayCell({
  date,
  view,
  muted,
  items,
  onOpen,
}: {
  date: string;
  view: CalendarView;
  muted: boolean;
  items: CalendarItem[];
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const visibleItems = view === 'month' ? items.slice(0, 3) : items;
  const hiddenCount = items.length - visibleItems.length;
  const summary = summarizeItems(items);
  return (
    <article className={`calendar-day-cell ${muted ? 'muted' : ''}`} data-testid="calendar-day">
      <header>
        <span>{view === 'week' ? weekdayLabel(date) : monthDayLabel(date)}</span>
        <button className="calendar-open-day" type="button" aria-label={t('calendar.openDay', { date: formatDate(date) })} onClick={onOpen}>
          {t('common.open')}
        </button>
      </header>
      {summary.total > 0 ? (
        <div className="calendar-day-summary" aria-label={t('calendar.daySummary')}>
          {summary.planned > 0 ? <span>{summary.planned} {t('common.planned')}</span> : null}
          {summary.completed > 0 ? <span>{summary.completed} {t('common.completedLower')}</span> : null}
          {summary.events > 0 ? <span>{summary.events} {t('nav.events').toLowerCase()}</span> : null}
        </div>
      ) : null}
      <div className="calendar-day-items">
        {visibleItems.map((item) => <CalendarItemCard compact item={item} key={item.id} />)}
        {hiddenCount > 0 ? (
          <button className="calendar-more-button" type="button" onClick={onOpen}>
            +{hiddenCount} {t('common.more')}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function summarizeItems(items: CalendarItem[]) {
  return {
    planned: items.filter((item) => item.kind === 'planned').length,
    completed: items.filter((item) => item.kind === 'completed').length,
    events: items.filter((item) => item.kind === 'event').length,
    total: items.length,
  };
}

function CalendarItemCard({ item, compact = false }: { item: CalendarItem; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`calendar-item ${compact ? 'compact' : ''} ${item.kind} ${item.variant ?? ''}`}>
      <span>{translateCalendarValue(item.label, t)}</span>
      <strong>{item.href ? <Link to={item.href}>{translateCalendarValue(item.title, t)}</Link> : translateCalendarValue(item.title, t)}</strong>
      {item.detail ? <p>{translateCalendarValue(item.detail, t)}</p> : null}
      <small>{translateCalendarMeta(item.meta, t)}</small>
    </div>
  );
}

function translateCalendarValue(value: string, t: (key: string) => string) {
  return value.includes('.') ? t(value) : value;
}

function translateCalendarMeta(value: string, t: (key: string) => string) {
  return value
    .split(' · ')
    .map((part) => (part.includes('.') ? t(part) : part))
    .join(' · ');
}

function buildCalendarItems(data: ReturnType<typeof useCalendar>['data']): CalendarItem[] {
  if (!data) {
    return [];
  }
  const completedActivityIds = new Set(data.activities.map((activity) => activity.id));
  return [
    ...data.planned_workouts
      .filter((workout) => !workout.completed_activity_id || !completedActivityIds.has(workout.completed_activity_id))
      .map(plannedWorkoutItem),
    ...data.activities.map(activityItem),
    ...data.events.map(eventItem),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label));
}

function plannedWorkoutItem(workout: PlannedWorkout): CalendarItem {
  const variant = plannedWorkoutVariant(workout.workout_type);
  return {
    id: `planned-${workout.id ?? workout.scheduled_date}-${workout.title}`,
    kind: 'planned',
    variant,
    date: workout.scheduled_date,
    label: plannedWorkoutLabel(variant),
    title: workout.title,
    detail: workout.instructions,
    meta: plannedWorkoutMeta(workout, variant),
  };
}

function activityItem(activity: CalendarActivity): CalendarItem {
  const intensity = activity.intensity_class ? activity.intensity_class : null;
  return {
    id: `activity-${activity.id}`,
    kind: 'completed',
    date: activity.date,
    label: 'calendar.completed',
    title: activity.name ?? 'calendar.completedActivity',
    detail: intensity ? `intensity.${intensity}` : null,
    meta: `${formatDistance(activity.distance_m)} · ${formatDuration(activity.moving_time_s)}`,
  };
}

function eventItem(event: CalendarEvent): CalendarItem {
  return {
    id: `event-${event.id}`,
    kind: 'event',
    date: event.event_date,
    label: `eventType.${event.event_type}`,
    title: event.title,
    detail: event.notes,
    meta: event.event_type === 'race' ? 'calendar.raceDay' : 'calendar.calendarEvent',
    href: event.source_type === 'event' && event.source_id ? `/events/${event.source_id}` : undefined,
  };
}

function plannedWorkoutVariant(workoutType: string): string {
  if (workoutType === 'rest') {
    return 'rest';
  }
  if (['tempo', 'intervals', 'hills', 'race'].includes(workoutType)) {
    return 'quality';
  }
  if (['strength', 'cross_training'].includes(workoutType)) {
    return 'strength';
  }
  if (['easy', 'long', 'recovery'].includes(workoutType)) {
    return 'run';
  }
  return 'other';
}

function plannedWorkoutLabel(variant: string): string {
  const labels: Record<string, string> = {
    rest: 'calendar.rest',
    run: 'calendar.plannedRun',
    quality: 'calendar.quality',
    strength: 'calendar.strength',
    other: 'common.planned',
  };
  return labels[variant] ?? 'common.planned';
}

function plannedWorkoutMeta(workout: PlannedWorkout, variant: string): string {
  if (variant === 'rest') {
    return `calendar.rest · status.${workout.status}`;
  }
  return `${formatDistance(workout.target_distance_m)} · ${formatDuration(workout.target_duration_s)} · status.${workout.status}`;
}

function groupItemsByDate(items: CalendarItem[]) {
  const grouped = new Map<string, CalendarItem[]>();
  for (const item of items) {
    grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]);
  }
  return grouped;
}

function calendarRange(anchorDate: string, view: CalendarView) {
  const dates = visibleCalendarDates(anchorDate, view);
  return { start: dates[0], end: dates[dates.length - 1] };
}

function shiftCalendarAnchor(anchorDate: string, view: CalendarView, direction: -1 | 1) {
  if (view === 'week') {
    return addDaysToIso(anchorDate, direction * 7);
  }
  return addMonthsToIso(anchorDate, direction);
}

function visibleCalendarDates(anchorDate: string, view: CalendarView) {
  if (view === 'week') {
    const start = weekStartIso(anchorDate);
    return Array.from({ length: 7 }, (_, index) => addDaysToIso(start, index));
  }
  const anchor = parseIsoDate(anchorDate);
  const monthStart = toIsoDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const start = weekStartIso(monthStart);
  return Array.from({ length: 42 }, (_, index) => addDaysToIso(start, index));
}

function sameMonth(left: string, right: string) {
  return left.slice(0, 7) === right.slice(0, 7);
}

function monthDayLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(parseIsoDate(value));
}
