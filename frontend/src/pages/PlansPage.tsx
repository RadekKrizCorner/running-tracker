import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus, Star, X } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import {
  useCalendar,
  useCopyWeekSchedule,
  useCreateWorkoutPoolItem,
  useCreateWorkoutTemplate,
  useSaveWeekSchedule,
  useScheduleWorkoutPoolItem,
  useWorkoutPool,
  useWorkoutTemplates,
} from '../features/plans/api';
import { useUpdateUserPreferences, useUserPreferences } from '../features/profile/api';
import { addDaysToIso, weekdayLabel, weekStartIso } from '../lib/date';
import { formatDate, formatDistance, formatDuration, getFormatLocale } from '../lib/format';
import { enumLabel, useTranslation } from '../lib/i18n';
import type { PlannedWorkout, WorkoutPoolItem, WorkoutTemplate } from '../lib/api/types';

type WeekRow = {
  local_id: string;
  scheduled_date: string;
  template_id: string;
  session_label: string;
  sort_order: number;
  title: string;
  workout_type: string;
  target_duration_min: string;
  target_distance_km: string;
  target_intensity: string;
  instructions: string;
};

type WeekDayPlan = {
  scheduled_date: string;
  sessions: WeekRow[];
};

type PlanningOverview = {
  plannedDistanceM: number;
  plannedTimeS: number;
  plannedLoad: number;
  sessionCount: number;
};

const emptyTemplateForm = {
  name: '',
  workout_type: 'easy',
  title: '',
  target_duration_min: '45',
  target_distance_km: '7',
  target_intensity: 'easy',
  instructions: '',
};

function makeLocalId(date: string, index: number) {
  return `${date}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptySession(date: string, index = 0): WeekRow {
  return {
    local_id: makeLocalId(date, index),
    scheduled_date: date,
    template_id: '',
    session_label: '',
    sort_order: index,
    title: '',
    workout_type: 'easy',
    target_duration_min: '',
    target_distance_km: '',
    target_intensity: 'easy',
    instructions: '',
  };
}

function emptyDay(date: string): WeekDayPlan {
  return {
    scheduled_date: date,
    sessions: [],
  };
}

function rowFromWorkout(date: string, workout: PlannedWorkout, index = 0): WeekRow {
  return {
    local_id: workout.id ?? makeLocalId(date, index),
    scheduled_date: date,
    template_id: '',
    session_label: workout.session_label ?? '',
    sort_order: workout.sort_order ?? index,
    title: workout.title,
    workout_type: workout.workout_type,
    target_duration_min: workout.target_duration_s ? String(Math.round(workout.target_duration_s / 60)) : '',
    target_distance_km: workout.target_distance_m ? String(workout.target_distance_m / 1000) : '',
    target_intensity: workout.target_intensity ?? 'easy',
    instructions: workout.instructions ?? '',
  };
}

function rowFromPoolItem(date: string, item: WorkoutPoolItem, index = 0): WeekRow {
  return {
    local_id: makeLocalId(date, index),
    scheduled_date: date,
    template_id: '',
    session_label: '',
    sort_order: index,
    title: item.title,
    workout_type: item.workout_type,
    target_duration_min: item.target_duration_s ? String(Math.round(item.target_duration_s / 60)) : '',
    target_distance_km: item.target_distance_m ? String(item.target_distance_m / 1000) : '',
    target_intensity: item.target_intensity ?? 'easy',
    instructions: item.instructions ?? '',
  };
}

function rowFromTemplate(date: string, template: WorkoutTemplate, index = 0): WeekRow {
  return {
    local_id: makeLocalId(date, index),
    scheduled_date: date,
    template_id: template.id,
    session_label: '',
    sort_order: index,
    title: template.title,
    workout_type: template.workout_type,
    target_duration_min: template.target_duration_s ? String(Math.round(template.target_duration_s / 60)) : '',
    target_distance_km: template.target_distance_m ? String(template.target_distance_m / 1000) : '',
    target_intensity: template.target_intensity ?? 'easy',
    instructions: template.instructions ?? '',
  };
}

function numberOrNull(value: string, multiplier = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * multiplier) : null;
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function plannedLoadFactor(row: WeekRow) {
  if (row.workout_type === 'rest') {
    return 0;
  }
  if (row.target_intensity === 'hard' || row.target_intensity === 'race') {
    return row.target_intensity === 'race' ? 8 : 6;
  }
  if (row.target_intensity === 'moderate') {
    return 4;
  }
  return 2;
}

type TranslateFn = (key: string, params?: Record<string, string | number | null | undefined>) => string;

function defaultPlanTitle(weekStart: string, t: TranslateFn) {
  return t('plans.defaultPlanTitle', { date: formatDate(weekStart) });
}

function defaultEasyRun(date: string, t: TranslateFn): WeekRow {
  return {
    local_id: makeLocalId(date, 0),
    scheduled_date: date,
    template_id: '',
    session_label: '',
    sort_order: 0,
    title: t('plans.defaultEasyRunTitle'),
    workout_type: 'easy',
    target_duration_min: '45',
    target_distance_km: '7',
    target_intensity: 'easy',
    instructions: t('plans.defaultEasyRunInstructions'),
  };
}

function defaultRestDay(date: string, t: TranslateFn): WeekRow {
  return {
    local_id: makeLocalId(date, 0),
    scheduled_date: date,
    template_id: '',
    session_label: '',
    sort_order: 0,
    title: t('plans.defaultRestTitle'),
    workout_type: 'rest',
    target_duration_min: '',
    target_distance_km: '',
    target_intensity: 'rest',
    instructions: t('plans.defaultRestInstructions'),
  };
}

function doubleThresholdRows(date: string, startOrder: number, t: TranslateFn): WeekRow[] {
  return [
    {
      local_id: makeLocalId(date, startOrder),
      scheduled_date: date,
      template_id: '',
      session_label: t('plans.defaultMorningLabel'),
      sort_order: startOrder,
      title: t('plans.doubleThresholdMorningTitle'),
      workout_type: 'tempo',
      target_duration_min: '45',
      target_distance_km: '',
      target_intensity: 'hard',
      instructions: t('plans.doubleThresholdMorningInstructions'),
    },
    {
      local_id: makeLocalId(date, startOrder + 1),
      scheduled_date: date,
      template_id: '',
      session_label: t('plans.defaultAfternoonLabel'),
      sort_order: startOrder + 1,
      title: t('plans.doubleThresholdAfternoonTitle'),
      workout_type: 'tempo',
      target_duration_min: '45',
      target_distance_km: '',
      target_intensity: 'hard',
      instructions: t('plans.doubleThresholdAfternoonInstructions'),
    },
  ];
}

export function PlansPage() {
  const { t } = useTranslation();
  const [weekStart, setWeekStart] = useState(weekStartIso());
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDaysToIso(weekStart, index)), [weekStart]);
  const weekEnd = weekDates[6];
  const previousWeekStart = weekStartIso(addDaysToIso(weekStart, -7));
  const previousWeekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysToIso(previousWeekStart, index)),
    [previousWeekStart],
  );
  const previousWeekEnd = previousWeekDates[6];
  const templates = useWorkoutTemplates();
  const preferences = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const workoutPool = useWorkoutPool();
  const calendar = useCalendar(weekStart, weekEnd);
  const previousCalendar = useCalendar(previousWeekStart, previousWeekEnd);
  const saveWeek = useSaveWeekSchedule();
  const copyWeek = useCopyWeekSchedule();
  const createTemplate = useCreateWorkoutTemplate();
  const createPoolItem = useCreateWorkoutPoolItem();
  const schedulePoolItem = useScheduleWorkoutPoolItem();
  const [days, setDays] = useState<WeekDayPlan[]>(() => weekDates.map(emptyDay));
  const [selectedDate, setSelectedDate] = useState(weekDates[0]);
  const [dayEditorOpen, setDayEditorOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [planTitle, setPlanTitle] = useState(() => defaultPlanTitle(weekStart, t));
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateSearch, setTemplateSearch] = useState('');
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState<string[]>([]);
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>([]);
  const selectedDay = days.find((day) => day.scheduled_date === selectedDate) ?? days[0] ?? emptyDay(selectedDate);
  const selectedSession = selectedDay.sessions.find((session) => session.workout_type !== 'rest') ?? selectedDay.sessions[0] ?? null;
  const poolItems = Array.isArray(workoutPool.data) ? workoutPool.data : [];
  const easyTemplate = useMemo(() => {
    const items = templates.data ?? [];
    return (
      items.find((template) => template.name.toLowerCase() === 'easy run') ??
      items.find((template) => template.workout_type === 'easy' && (template.target_intensity ?? 'easy') === 'easy') ??
      null
    );
  }, [templates.data]);
  const visibleTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    const items = templates.data ?? [];
    return items
      .filter((template) => {
        if (!query) {
          return true;
        }
        return [template.name, template.title, template.workout_type, template.target_intensity ?? '']
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => templateRank(left, favoriteTemplateIds, recentTemplateIds) - templateRank(right, favoriteTemplateIds, recentTemplateIds));
  }, [favoriteTemplateIds, recentTemplateIds, templateSearch, templates.data]);
  const overview = useMemo(() => overviewFromDays(days), [days]);
  const previousOverview = useMemo(
    () => overviewFromWorkouts(previousCalendar.data?.planned_workouts ?? []),
    [previousCalendar.data?.planned_workouts],
  );

  useEffect(() => {
    const workouts = calendar.data?.planned_workouts ?? [];
    setDays(
      weekDates.map((date) => ({
        scheduled_date: date,
        sessions: workouts
          .filter((workout) => workout.scheduled_date === date)
          .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
          .map((workout, index) => rowFromWorkout(date, workout, index)),
      })),
    );
    setSelectedDate(weekDates[0]);
  }, [calendar.data?.planned_workouts, weekDates]);

  useEffect(() => {
    setPlanTitle(calendar.data?.plan?.title ?? defaultPlanTitle(weekStart, t));
  }, [calendar.data?.plan?.title, t, weekStart]);

  useEffect(() => {
    if (!preferences.data) {
      return;
    }
    setFavoriteTemplateIds(preferences.data.favorite_template_ids ?? []);
    setRecentTemplateIds(preferences.data.recent_template_ids ?? []);
  }, [preferences.data]);

  function updateSession(date: string, localId: string, updates: Partial<WeekRow>) {
    setDays((current) =>
      current.map((day) => {
        if (day.scheduled_date !== date) {
          return day;
        }
        const hasSession = day.sessions.some((session) => session.local_id === localId);
        const baseSessions = hasSession ? day.sessions : [emptySession(date)];
        return {
          ...day,
          sessions: normalizeSessionOrder(
            baseSessions.map((session) =>
              session.local_id === localId || !hasSession ? { ...session, ...updates, template_id: updates.template_id ?? session.template_id } : session,
            ),
          ),
        };
      }),
    );
  }

  function replaceDaySessions(date: string, sessions: WeekRow[]) {
    setDays((current) =>
      current.map((day) => (day.scheduled_date === date ? { ...day, sessions: normalizeSessionOrder(sessions.map((session) => ({ ...session, scheduled_date: date }))) } : day)),
    );
  }

  function appendDaySessions(date: string, sessions: WeekRow[]) {
    setDays((current) =>
      current.map((day) => {
        if (day.scheduled_date !== date) {
          return day;
        }
        const existing = day.sessions.filter((session) => session.workout_type !== 'rest');
        return { ...day, sessions: normalizeSessionOrder([...existing, ...sessions]) };
      }),
    );
  }

  function clearRestIfConfirmed(day: WeekDayPlan) {
    if (!day.sessions.some((session) => session.workout_type === 'rest')) {
      return true;
    }
    return window.confirm(t('plans.confirmClearRest'));
  }

  function confirmDeleteSessions(day: WeekDayPlan) {
    const count = day.sessions.length;
    if (count === 0) {
      return true;
    }
    return window.confirm(t('plans.confirmDeleteSessions', { count }));
  }

  function selectDay(date: string) {
    setSelectedDate(date);
    setDayEditorOpen(true);
  }

  function applyTemplate(date: string, templateId: string) {
    const template = templates.data?.find((item) => item.id === templateId);
    const day = days.find((item) => item.scheduled_date === date) ?? emptyDay(date);
    if (!clearRestIfConfirmed(day)) {
      return;
    }
    if (!template) {
      appendDaySessions(date, [emptySession(date, nextSortOrder(day.sessions))]);
      return;
    }
    appendTemplateSession(date, template, day);
  }

  function appendTemplateSession(date: string, template: WorkoutTemplate, day: WeekDayPlan) {
    appendDaySessions(date, [rowFromTemplate(date, template, nextSortOrder(day.sessions))]);
    setRecentTemplateIds((current) => {
      const next = [template.id, ...current.filter((id) => id !== template.id)].slice(0, 4);
      updatePreferences.mutate({ recent_template_ids: next });
      return next;
    });
  }

  function markRestDay(date: string) {
    const day = days.find((item) => item.scheduled_date === date) ?? emptyDay(date);
    if (day.sessions.length === 1 && day.sessions[0].workout_type === 'rest') {
      return;
    }
    if (!confirmDeleteSessions(day)) {
      return;
    }
    replaceDaySessions(date, [defaultRestDay(date, t)]);
  }

  function clearDay(date: string) {
    const day = days.find((item) => item.scheduled_date === date) ?? emptyDay(date);
    if (!confirmDeleteSessions(day)) {
      return;
    }
    replaceDaySessions(date, []);
  }

  function addEasyRun(date: string) {
    const day = days.find((item) => item.scheduled_date === date) ?? emptyDay(date);
    if (!clearRestIfConfirmed(day)) {
      return;
    }
    if (easyTemplate) {
      appendTemplateSession(date, easyTemplate, day);
      return;
    }
    appendDaySessions(date, [{ ...defaultEasyRun(date, t), sort_order: nextSortOrder(day.sessions) }]);
  }

  function addDoubleThreshold(date: string) {
    const day = days.find((item) => item.scheduled_date === date) ?? emptyDay(date);
    if (!clearRestIfConfirmed(day)) {
      return;
    }
    appendDaySessions(date, doubleThresholdRows(date, nextSortOrder(day.sessions), t));
  }

  function moveSelectedWorkout(offsetDays: number) {
    if (selectedDay.sessions.length === 0) {
      return;
    }
    const targetDate = addDaysToIso(selectedDay.scheduled_date, offsetDays);
    if (!weekDates.includes(targetDate)) {
      return;
    }
    const targetDay = days.find((day) => day.scheduled_date === targetDate) ?? emptyDay(targetDate);
    if (!clearRestIfConfirmed(targetDay)) {
      return;
    }
    setDays((current) =>
      current.map((day) => {
        if (day.scheduled_date === selectedDay.scheduled_date) {
          return { ...day, sessions: [] };
        }
        if (day.scheduled_date === targetDate) {
          const movedSessions = selectedDay.sessions.map((session, index) => ({
            ...session,
            local_id: makeLocalId(targetDate, nextSortOrder(day.sessions) + index),
            scheduled_date: targetDate,
          }));
          return { ...day, sessions: normalizeSessionOrder([...day.sessions.filter((session) => session.workout_type !== 'rest'), ...movedSessions]) };
        }
        return day;
      }),
    );
    setSelectedDate(targetDate);
  }

  function copyPreviousWeek() {
    const workouts = previousCalendar.data?.planned_workouts ?? [];
    setDays(
      weekDates.map((date, index) => {
        const previousDate = previousWeekDates[index];
        return {
          scheduled_date: date,
          sessions: workouts
            .filter((workout) => workout.scheduled_date === previousDate)
            .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
            .map((workout, workoutIndex) => rowFromWorkout(date, { ...workout, scheduled_date: date }, workoutIndex)),
        };
      }),
    );
    setSelectedDate(weekDates[0]);
    copyWeek.mutate(
      {
        source_week_start_date: previousWeekStart,
        target_week_start_date: weekStart,
        plan_title: planTitle.trim(),
      },
      {
        onSuccess: (response) => {
          if (response.planned_workouts.length > 0) {
            setDays(
              weekDates.map((date) => ({
                scheduled_date: date,
                sessions: response.planned_workouts
                  .filter((workout) => workout.scheduled_date === date)
                  .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
                  .map((workout, index) => rowFromWorkout(date, workout, index)),
              })),
            );
          }
        },
      },
    );
  }

  function copyThisWeekToNextWeek() {
    const nextWeekStart = weekStartIso(addDaysToIso(weekStart, 7));
    copyWeek.mutate({
      source_week_start_date: weekStart,
      target_week_start_date: nextWeekStart,
      plan_title: `${planTitle.trim() || defaultPlanTitle(weekStart, t)} ${t('plans.copySuffix')}`,
    });
  }

  function toggleFavoriteTemplate(templateId: string) {
    setFavoriteTemplateIds((current) => {
      const next = current.includes(templateId) ? current.filter((id) => id !== templateId) : [...current, templateId];
      updatePreferences.mutate({ favorite_template_ids: next });
      return next;
    });
  }

  function saveSchedule() {
    const workouts = days
      .flatMap((day) => normalizeSessionOrder(day.sessions))
      .filter(rowHasWorkout)
      .map((row) => ({
        scheduled_date: row.scheduled_date,
        session_label: row.session_label.trim() || null,
        sort_order: row.sort_order,
        ...(row.template_id
          ? { template_id: row.template_id }
          : {
              title: row.title.trim(),
              workout_type: row.workout_type,
              target_duration_s: numberOrNull(row.target_duration_min, 60),
              target_distance_m: numberOrNull(row.target_distance_km, 1000),
              target_intensity: row.target_intensity || null,
              instructions: row.instructions.trim() || null,
            }),
        status: 'planned',
      }));
    saveWeek.mutate({ week_start_date: weekStart, plan_title: planTitle.trim(), workouts });
  }

  function createReusableTemplate() {
    const title = templateForm.title.trim() || templateForm.name.trim();
    createTemplate.mutate(
      {
        name: templateForm.name.trim(),
        workout_type: templateForm.workout_type,
        title,
        target_duration_s: numberOrNull(templateForm.target_duration_min, 60),
        target_distance_m: numberOrNull(templateForm.target_distance_km, 1000),
        target_intensity: templateForm.target_intensity || null,
        instructions: templateForm.instructions.trim() || null,
      },
      {
        onSuccess: () => {
          setTemplateForm(emptyTemplateForm);
          setTemplateDialogOpen(false);
        },
      },
    );
  }

  function addSelectedToPool() {
    if (!selectedSession || !rowHasWorkout(selectedSession) || selectedSession.workout_type === 'rest') {
      return;
    }
    createPoolItem.mutate({
      source_template_id: selectedSession.template_id || null,
      title: selectedSession.title.trim(),
      workout_type: selectedSession.workout_type,
      target_duration_s: numberOrNull(selectedSession.target_duration_min, 60),
      target_distance_m: numberOrNull(selectedSession.target_distance_km, 1000),
      target_intensity: selectedSession.target_intensity || null,
      instructions: selectedSession.instructions.trim() || null,
    });
  }

  function schedulePoolWorkout(item: WorkoutPoolItem) {
    const day = days.find((current) => current.scheduled_date === selectedDate) ?? emptyDay(selectedDate);
    if (!clearRestIfConfirmed(day)) {
      return;
    }
    const sortOrder = nextSortOrder(day.sessions);
    appendDaySessions(selectedDate, [rowFromPoolItem(selectedDate, item, sortOrder)]);
    schedulePoolItem.mutate({ id: item.id, scheduled_date: selectedDate, sort_order: sortOrder });
  }

  function handleTemplateDragStart(event: DragEvent<HTMLElement>, templateId: string) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-workout-template', templateId);
    event.dataTransfer.setData('text/plain', templateId);
  }

  function handleTemplateDrop(event: DragEvent<HTMLElement>, date: string) {
    event.preventDefault();
    const templateId = event.dataTransfer.getData('application/x-workout-template') || event.dataTransfer.getData('text/plain');
    if (!templateId) {
      return;
    }
    setSelectedDate(date);
    applyTemplate(date, templateId);
  }

  function allowTemplateDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t('plans.eyebrow')}</p>
          <h1>{t('plans.title')}</h1>
        </div>
        <div className="date-controls">
          <button className="secondary-button" type="button" onClick={() => setWeekStart(weekStartIso(addDaysToIso(weekStart, -7)))}>
            <ChevronLeft size={16} />
            {t('common.previous')}
          </button>
          <input aria-label={t('plans.planTitle')} value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} />
          <input type="date" value={weekStart} onChange={(event) => setWeekStart(weekStartIso(event.target.value))} />
          <button className="secondary-button" type="button" onClick={() => setWeekStart(weekStartIso(addDaysToIso(weekStart, 7)))}>
            {t('common.next')}
            <ChevronRight size={16} />
          </button>
          <button className="secondary-button" type="button" onClick={copyPreviousWeek} disabled={previousCalendar.isLoading}>
            {copyWeek.isPending ? t('plans.copying') : t('plans.copyPreviousWeek')}
          </button>
          <button className="secondary-button" type="button" onClick={copyThisWeekToNextWeek} disabled={copyWeek.isPending}>
            {t('plans.copyToNextWeek')}
          </button>
          <button className="primary-button" type="button" onClick={saveSchedule} disabled={saveWeek.isPending}>
            {saveWeek.isPending ? t('common.saving') : t('plans.saveWeek')}
          </button>
        </div>
      </header>

      <section className="metric-grid planning-metrics sticky-metrics">
        <PlanningMetricCard
          label={t('plans.plannedDistance')}
          value={formatDistance(overview.plannedDistanceM)}
          current={overview.plannedDistanceM}
          previous={previousOverview.plannedDistanceM}
        />
        <PlanningMetricCard
          label={t('plans.plannedTime')}
          value={formatDuration(overview.plannedTimeS)}
          current={overview.plannedTimeS}
          previous={previousOverview.plannedTimeS}
        />
        <PlanningMetricCard
          label={t('plans.plannedLoad')}
          value={`${Math.round(overview.plannedLoad)}`}
          current={overview.plannedLoad}
          previous={previousOverview.plannedLoad}
        />
        <PlanningMetricCard
          label={t('plans.sessions')}
          value={`${overview.sessionCount}`}
          current={overview.sessionCount}
          previous={previousOverview.sessionCount}
        />
      </section>

      <section className="planning-board-layout">
        <section className="week-board" aria-label={t('plans.title')}>
          {days.map((day) => (
            <WeekDayCard
              key={day.scheduled_date}
              day={day}
              selected={day.scheduled_date === selectedDate}
              onSelect={() => selectDay(day.scheduled_date)}
              onRest={() => markRestDay(day.scheduled_date)}
              onClear={() => clearDay(day.scheduled_date)}
              onAddEasy={() => addEasyRun(day.scheduled_date)}
              onAddDoubleThreshold={() => addDoubleThreshold(day.scheduled_date)}
              onDragOver={allowTemplateDrop}
              onTemplateDrop={(event) => handleTemplateDrop(event, day.scheduled_date)}
            />
          ))}
        </section>

        <article className="panel template-library">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">{t('plans.dragOrClick')}</p>
              <h2>{t('plans.templateLibrary')}</h2>
            </div>
            <button className="secondary-button compact" type="button" onClick={() => setTemplateDialogOpen(true)}>
              <Plus size={16} />
              {t('common.add')}
            </button>
          </div>
          <input
            aria-label={t('plans.searchTemplates')}
            placeholder={t('plans.searchTemplates')}
            value={templateSearch}
            onChange={(event) => setTemplateSearch(event.target.value)}
          />
          {recentTemplateIds.length > 0 ? <small>{t('plans.recentlyUsed', { count: recentTemplateIds.length })}</small> : null}
          <div className="template-chip-list horizontal">
            {visibleTemplates.map((template: WorkoutTemplate) => (
              <div className="template-chip-row" key={template.id}>
                <button
                  className="template-chip"
                  type="button"
                  draggable
                  aria-label={t('plans.useTemplate', { name: template.name })}
                  onClick={() => applyTemplate(selectedDate, template.id)}
                  onDragStart={(event) => handleTemplateDragStart(event, template.id)}
                >
                  <strong>{template.name}</strong>
                  <span>
                    {enumLabel(t, 'workout', template.workout_type)} · {enumLabel(t, 'intensity', template.target_intensity ?? 'free')} · {formatDistance(template.target_distance_m)}
                  </span>
                </button>
                <button
                  className={favoriteTemplateIds.includes(template.id) ? 'icon-button active' : 'icon-button'}
                  type="button"
                  aria-label={t(favoriteTemplateIds.includes(template.id) ? 'plans.unfavorite' : 'plans.favorite', { name: template.name })}
                  onClick={() => toggleFavoriteTemplate(template.id)}
                >
                  <Star size={16} fill={favoriteTemplateIds.includes(template.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
            ))}
            {visibleTemplates.length === 0 ? <small>{t('plans.noTemplates')}</small> : null}
          </div>
        </article>

        <article className="panel workout-pool-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">{t('plans.unscheduled')}</p>
              <h2>{t('plans.workoutPool')}</h2>
            </div>
            <button className="secondary-button compact" type="button" onClick={addSelectedToPool} disabled={!selectedSession || !rowHasWorkout(selectedSession) || selectedSession.workout_type === 'rest'}>
              {t('plans.addToPool')}
            </button>
          </div>
          <div className="template-chip-list horizontal">
            {poolItems.map((item) => (
              <button
                className="template-chip"
                type="button"
                key={item.id}
                aria-label={t('plans.scheduleOnSelected', { name: item.title })}
                onClick={() => schedulePoolWorkout(item)}
                disabled={schedulePoolItem.isPending}
              >
                <strong>{item.title}</strong>
                <span>{enumLabel(t, 'workout', item.workout_type)} · {enumLabel(t, 'intensity', item.target_intensity ?? 'free')} · {formatDistance(item.target_distance_m)}</span>
              </button>
            ))}
            {poolItems.length === 0 ? <small>{t('plans.noPool')}</small> : null}
          </div>
        </article>
      </section>

      {calendar.data?.planned_workouts.length === 0 ? (
        <EmptyState title={t('plans.emptyWeek')} detail={t('plans.emptyWeekDetail')} />
      ) : null}

      {dayEditorOpen && selectedDay ? (
        <DayEditorModal
          day={selectedDay}
          weekDates={weekDates}
          weekEnd={weekEnd}
          onClose={() => setDayEditorOpen(false)}
          onUpdate={updateSession}
          onMove={moveSelectedWorkout}
          onAddPool={addSelectedToPool}
          onRest={markRestDay}
          onClear={clearDay}
          onAddEasy={addEasyRun}
          onAddDoubleThreshold={addDoubleThreshold}
        />
      ) : null}

      {templateDialogOpen ? (
        <TemplateDialog
          form={templateForm}
          isSaving={createTemplate.isPending}
          onClose={() => setTemplateDialogOpen(false)}
          onSave={createReusableTemplate}
          onChange={setTemplateForm}
        />
      ) : null}
    </div>
  );
}

function PlanningMetricCard({
  label,
  value,
  current,
  previous,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
}) {
  const { t } = useTranslation();
  const comparison = comparisonLabel(current, previous, t);
  return (
    <article className="metric-card planning-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={comparison.tone}>{comparison.label}</small>
    </article>
  );
}

function WeekDayCard({
  day,
  selected,
  onSelect,
  onRest,
  onClear,
  onAddEasy,
  onAddDoubleThreshold,
  onDragOver,
  onTemplateDrop,
}: {
  day: WeekDayPlan;
  selected: boolean;
  onSelect: () => void;
  onRest: () => void;
  onClear: () => void;
  onAddEasy: () => void;
  onAddDoubleThreshold: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onTemplateDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
  const state = dayState(day);
  const visibleSessions = day.sessions.filter(rowHasWorkout);
  const firstSession = visibleSessions[0] ?? null;
  return (
    <article
      className={`week-day-card ${state} ${selected ? 'selected' : ''}`}
      data-testid="week-board-day"
      onDragOver={onDragOver}
      onDrop={onTemplateDrop}
    >
      <button className="week-day-select" type="button" aria-label={t('plans.selectDay', { date: shortWeekday(day.scheduled_date) })} onClick={onSelect}>
        <span>{shortWeekday(day.scheduled_date)}</span>
        <strong>
          {state === 'unscheduled'
            ? t('plans.unscheduledDay')
            : state === 'rest'
              ? t('plans.restDay')
              : t('plans.sessionCount', { count: visibleSessions.length })}
        </strong>
      </button>
      <span className={`badge ${state === 'planned' && firstSession ? firstSession.target_intensity : ''}`}>{t(`plans.state.${state}`)}</span>
      <div className="day-session-list">
        {visibleSessions.length > 0 ? (
          visibleSessions.map((session) => (
            <div className="day-session-summary" key={session.local_id}>
              {session.session_label ? <span>{session.session_label}</span> : null}
              <strong>{session.title || enumLabel(t, 'workout', session.workout_type)}</strong>
              <small>
                {session.target_distance_km ? formatDistance(Number(session.target_distance_km) * 1000) : t('plans.noDistance')} ·{' '}
                {session.target_duration_min ? formatDuration(Number(session.target_duration_min) * 60) : t('plans.noTime')}
              </small>
            </div>
          ))
        ) : (
          <small>{t('plans.noDistance')} · {t('plans.noTime')}</small>
        )}
      </div>
      <div className="day-quick-actions">
        <button type="button" onClick={onRest}>{t('plans.markRest')}</button>
        <button type="button" onClick={onClear}>{t('plans.clearDay')}</button>
        <button type="button" onClick={onAddEasy}>{t('plans.addEasyRun')}</button>
        <button type="button" onClick={onAddDoubleThreshold}>{t('plans.addDoubleThreshold')}</button>
      </div>
      {selected ? <Check className="selected-check" size={17} /> : null}
    </article>
  );
}

function DayEditorModal({
  day,
  weekDates,
  weekEnd,
  onClose,
  onUpdate,
  onMove,
  onAddPool,
  onRest,
  onClear,
  onAddEasy,
  onAddDoubleThreshold,
}: {
  day: WeekDayPlan;
  weekDates: string[];
  weekEnd: string;
  onClose: () => void;
  onUpdate: (date: string, localId: string, updates: Partial<WeekRow>) => void;
  onMove: (days: number) => void;
  onAddPool: () => void;
  onRest: (date: string) => void;
  onClear: (date: string) => void;
  onAddEasy: (date: string) => void;
  onAddDoubleThreshold: (date: string) => void;
}) {
  const { t } = useTranslation();
  const editableSessions = day.sessions.length > 0 ? day.sessions : [emptySession(day.scheduled_date)];
  const hasWorkouts = day.sessions.some(rowHasWorkout);
  const hasPoolCandidate = day.sessions.some((session) => rowHasWorkout(session) && session.workout_type !== 'rest');
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-label={t('plans.editDay', { date: weekdayLabel(day.scheduled_date) })}
        aria-modal="true"
        className="modal-panel day-editor-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{formatDate(day.scheduled_date)}</p>
            <h2>{t('plans.editDay', { date: weekdayLabel(day.scheduled_date) })}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t('plans.closeDayEditor')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="day-editor-actions">
          <button className="secondary-button" type="button" onClick={() => onMove(-1)} disabled={!hasWorkouts || day.scheduled_date === weekDates[0]}>
            {t('plans.moveLeft')}
          </button>
          <button className="secondary-button" type="button" onClick={() => onMove(1)} disabled={!hasWorkouts || day.scheduled_date === weekEnd}>
            {t('plans.moveRight')}
          </button>
          <button className="secondary-button" type="button" onClick={onAddPool} disabled={!hasPoolCandidate}>
            {t('plans.addToPool')}
          </button>
          <button className="secondary-button" type="button" onClick={() => onRest(day.scheduled_date)}>
            {t('plans.markRest')}
          </button>
          <button className="secondary-button" type="button" onClick={() => onClear(day.scheduled_date)}>
            {t('plans.clearDay')}
          </button>
          <button className="secondary-button" type="button" onClick={() => onAddEasy(day.scheduled_date)}>
            {t('plans.addEasyRun')}
          </button>
          <button className="secondary-button" type="button" onClick={() => onAddDoubleThreshold(day.scheduled_date)}>
            {t('plans.addDoubleThreshold')}
          </button>
        </div>
        <div className="day-editor-session-list">
          {editableSessions.map((session, index) => (
            <section className="day-editor-session" key={session.local_id}>
              <div className="session-heading">
                <strong>{t('plans.sessionNumber', { count: index + 1 })}</strong>
                {session.session_label ? <span>{session.session_label}</span> : null}
              </div>
              <div className="week-row-fields vertical">
                <input
                  aria-label={`${t('plans.sessionLabel')} ${day.scheduled_date} ${index + 1}`}
                  placeholder={t('plans.sessionLabel')}
                  value={session.session_label}
                  onChange={(event) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', session_label: event.target.value })}
                />
                <input
                  aria-label={`${t('plans.titleField')} ${day.scheduled_date} ${index + 1}`}
                  placeholder={t('plans.titleField')}
                  value={session.title}
                  onChange={(event) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', title: event.target.value })}
                />
                <select
                  aria-label={`${t('plans.workoutType')} ${day.scheduled_date} ${index + 1}`}
                  value={session.workout_type}
                  onChange={(event) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', workout_type: event.target.value })}
                >
                  <WorkoutTypeOptions />
                </select>
                <div className="training-target-fields">
                  <div className="training-target-heading">
                    <strong>{t('plans.trainingTargets')}</strong>
                    <small>{t('plans.trainingTargetsHelp')}</small>
                  </div>
                  <div className="field-pair metric-field-pair">
                    <MetricInputField
                      ariaLabel={`${t('plans.targetDistance')} ${t('plans.kilometersShort')} ${day.scheduled_date} ${index + 1}`}
                      helper={t('plans.targetDistanceHelp')}
                      inputMode="decimal"
                      label={t('plans.targetDistance')}
                      placeholder={t('plans.distancePlaceholder')}
                      unit={t('plans.kilometersShort')}
                      value={session.target_distance_km}
                      onChange={(value) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', target_distance_km: value })}
                    />
                    <MetricInputField
                      ariaLabel={`${t('plans.targetDuration')} ${t('plans.minutesShort')} ${day.scheduled_date} ${index + 1}`}
                      helper={t('plans.targetDurationHelp')}
                      inputMode="numeric"
                      label={t('plans.targetDuration')}
                      placeholder={t('plans.durationPlaceholder')}
                      unit={t('plans.minutesShort')}
                      value={session.target_duration_min}
                      onChange={(value) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', target_duration_min: value })}
                    />
                  </div>
                </div>
                <select
                  aria-label={`${t('common.intensity')} ${day.scheduled_date} ${index + 1}`}
                  value={session.target_intensity}
                  onChange={(event) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', target_intensity: event.target.value })}
                >
                  <IntensityOptions />
                </select>
              </div>
              <textarea
                aria-label={`${t('plans.instructions')} ${day.scheduled_date} ${index + 1}`}
                rows={4}
                placeholder={t('plans.instructions')}
                value={session.instructions}
                onChange={(event) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', instructions: event.target.value })}
              />
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricInputField({
  ariaLabel,
  helper,
  inputMode,
  label,
  placeholder,
  unit,
  value,
  onChange,
}: {
  ariaLabel: string;
  helper: string;
  inputMode: 'decimal' | 'numeric';
  label: string;
  placeholder: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="metric-input-field">
      <span className="metric-input-label">
        <span>{label}</span>
        <small>{helper}</small>
      </span>
      <span className="metric-input-control">
        <input
          aria-label={ariaLabel}
          inputMode={inputMode}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="metric-input-unit" aria-hidden="true">{unit}</span>
      </span>
    </label>
  );
}

function TemplateDialog({
  form,
  isSaving,
  onClose,
  onSave,
  onChange,
}: {
  form: typeof emptyTemplateForm;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (value: typeof emptyTemplateForm | ((current: typeof emptyTemplateForm) => typeof emptyTemplateForm)) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-label={t('plans.addTemplate')}
        aria-modal="true"
        className="modal-panel template-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t('plans.templateLibrary')}</p>
            <h2>{t('plans.addTemplate')}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t('plans.closeTemplateDialog')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="template-form">
          <input
            aria-label={t('plans.templateName')}
            placeholder={t('plans.templateName')}
            value={form.name}
            onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
          />
          <input
            aria-label={t('plans.templateTitle')}
            placeholder={t('plans.templateTitle')}
            value={form.title}
            onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
          />
          <select
            aria-label={t('plans.workoutType')}
            value={form.workout_type}
            onChange={(event) => onChange((current) => ({ ...current, workout_type: event.target.value }))}
          >
            <WorkoutTypeOptions />
          </select>
          <div className="field-pair">
            <input
              aria-label={t('plans.distanceKm')}
              inputMode="decimal"
              placeholder={t('plans.distanceKm')}
              value={form.target_distance_km}
              onChange={(event) => onChange((current) => ({ ...current, target_distance_km: event.target.value }))}
            />
            <input
              aria-label={t('plans.durationMin')}
              inputMode="numeric"
              placeholder={t('plans.durationMin')}
              value={form.target_duration_min}
              onChange={(event) => onChange((current) => ({ ...current, target_duration_min: event.target.value }))}
            />
          </div>
          <select
            aria-label={t('plans.templateIntensity')}
            value={form.target_intensity}
            onChange={(event) => onChange((current) => ({ ...current, target_intensity: event.target.value }))}
          >
            <IntensityOptions />
          </select>
          <textarea
            aria-label={t('plans.instructions')}
            rows={3}
            placeholder={t('plans.instructions')}
            value={form.instructions}
            onChange={(event) => onChange((current) => ({ ...current, instructions: event.target.value }))}
          />
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="primary-button" type="button" onClick={onSave} disabled={!form.name.trim() || isSaving}>
              {isSaving ? t('plans.savingTemplate') : t('plans.saveTemplate')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function overviewFromRows(rows: WeekRow[]): PlanningOverview {
  return {
    plannedDistanceM: rows.reduce((total, row) => total + numberValue(row.target_distance_km) * 1000, 0),
    plannedTimeS: rows.reduce((total, row) => total + numberValue(row.target_duration_min) * 60, 0),
    plannedLoad: rows.reduce((total, row) => total + numberValue(row.target_duration_min) * plannedLoadFactor(row), 0),
    sessionCount: rows.filter((row) => rowHasWorkout(row) && row.workout_type !== 'rest').length,
  };
}

function overviewFromDays(days: WeekDayPlan[]): PlanningOverview {
  return overviewFromRows(days.flatMap((day) => day.sessions));
}

function overviewFromWorkouts(workouts: PlannedWorkout[]): PlanningOverview {
  return overviewFromRows(workouts.map((workout, index) => rowFromWorkout(workout.scheduled_date, workout, index)));
}

function comparisonLabel(current: number, previous: number, t: TranslateFn) {
  if (previous <= 0) {
    return {
      label: current > 0 ? t('plans.newVsLastWeek') : t('plans.noChangeVsLastWeek'),
      tone: 'metric-comparison neutral',
    };
  }
  const percentChange = Math.round(((current - previous) / previous) * 100);
  const prefix = percentChange > 0 ? '+' : '';
  return {
    label: t('plans.vsLastWeek', { value: `${prefix}${percentChange}` }),
    tone: `metric-comparison ${percentChange > 0 ? 'positive' : percentChange < 0 ? 'negative' : 'neutral'}`,
  };
}

function templateRank(template: WorkoutTemplate, favoriteTemplateIds: string[], recentTemplateIds: string[]) {
  const favoriteOffset = favoriteTemplateIds.includes(template.id) ? -100 : 0;
  const recentIndex = recentTemplateIds.indexOf(template.id);
  const recentOffset = recentIndex >= 0 ? recentIndex - 50 : 0;
  return favoriteOffset + recentOffset;
}

function rowHasWorkout(row: WeekRow) {
  return Boolean(row.template_id || row.title.trim() || row.workout_type === 'rest');
}

function dayState(day: WeekDayPlan) {
  if (day.sessions.some((session) => session.workout_type === 'rest' && rowHasWorkout(session))) {
    return 'rest';
  }
  if (day.sessions.some(rowHasWorkout)) {
    return 'planned';
  }
  return 'unscheduled';
}

function normalizeSessionOrder(sessions: WeekRow[]) {
  return sessions
    .filter(rowHasWorkout)
    .map((session, index) => ({
      ...session,
      sort_order: index,
    }));
}

function nextSortOrder(sessions: WeekRow[]) {
  return sessions.filter(rowHasWorkout).length;
}

function shortWeekday(value: string) {
  return new Intl.DateTimeFormat(getFormatLocale(), { weekday: 'short' }).format(new Date(`${value}T00:00:00`));
}

function WorkoutTypeOptions() {
  const { t } = useTranslation();
  return (
    <>
      <option value="easy">{t('workout.easy')}</option>
      <option value="long">{t('workout.long')}</option>
      <option value="recovery">{t('workout.recovery')}</option>
      <option value="tempo">{t('workout.tempo')}</option>
      <option value="intervals">{t('workout.intervals')}</option>
      <option value="hills">{t('workout.hills')}</option>
      <option value="strength">{t('workout.strength')}</option>
      <option value="rest">{t('workout.rest')}</option>
    </>
  );
}

function IntensityOptions() {
  const { t } = useTranslation();
  return (
    <>
      <option value="easy">{t('intensity.easy')}</option>
      <option value="moderate">{t('intensity.moderate')}</option>
      <option value="hard">{t('intensity.hard')}</option>
      <option value="race">{t('intensity.race')}</option>
      <option value="rest">{t('intensity.rest')}</option>
    </>
  );
}
