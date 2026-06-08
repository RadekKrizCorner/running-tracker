import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Copy, Plus, Star, Trash2, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useRecentWeeklyAnalytics } from '../features/analytics/api';
import {
  useCalendar,
  useCreateWorkoutPoolItem,
  useCreateWorkoutTemplate,
  useSaveWeekSchedule,
  useScheduleWorkoutPoolItem,
  useWorkoutPool,
  useWorkoutTemplates,
} from '../features/plans/api';
import { useMe } from '../features/auth/api';
import { useUpdateUserPreferences, useUserPreferences } from '../features/profile/api';
import { addDaysToIso, weekdayLabel, weekStartIso } from '../lib/date';
import { formatDate, formatDistance, formatDuration, formatShortDate, getFormatLocale } from '../lib/format';
import { enumLabel, useTranslation } from '../lib/i18n';
import type { PlannedWorkout, WeeklyMetric, WorkoutPoolItem, WorkoutTemplate } from '../lib/api/types';

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

type LongTermWeekPlan = {
  weekStart: string;
  weekNumber: number;
  days: WeekDayPlan[];
  overview: PlanningOverview;
};

const LONG_TERM_WEEK_COUNT = 12;
const DAYS_PER_WEEK = 7;

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
  const me = useMe();
  const [weekStart, setWeekStart] = useState(weekStartIso());
  const [horizonStart, setHorizonStart] = useState(weekStartIso());
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDaysToIso(weekStart, index)), [weekStart]);
  const weekEnd = weekDates[6];
  const planTitle = useMemo(() => defaultPlanTitle(weekStart, t), [t, weekStart]);
  const templates = useWorkoutTemplates();
  const preferences = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const workoutPool = useWorkoutPool();
  const calendar = useCalendar(weekStart, weekEnd);
  const longTermEnd = addDaysToIso(horizonStart, LONG_TERM_WEEK_COUNT * DAYS_PER_WEEK - 1);
  const longTermCalendar = useCalendar(horizonStart, longTermEnd);
  const recentLoadWeeks = useRecentWeeklyAnalytics(6);
  const saveWeek = useSaveWeekSchedule();
  const createTemplate = useCreateWorkoutTemplate();
  const createPoolItem = useCreateWorkoutPoolItem();
  const schedulePoolItem = useScheduleWorkoutPoolItem();
  const [days, setDays] = useState<WeekDayPlan[]>(() => weekDates.map(emptyDay));
  const [selectedDate, setSelectedDate] = useState(weekDates[0]);
  const selectedDateRef = useRef(selectedDate);
  const [dayEditorOpen, setDayEditorOpen] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateSearch, setTemplateSearch] = useState('');
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState<string[]>([]);
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>([]);
  const [selectedSessionLocalId, setSelectedSessionLocalId] = useState<string | null>(null);
  const [pendingLongTermDate, setPendingLongTermDate] = useState<string | null>(null);
  const [savedPlanFingerprint, setSavedPlanFingerprint] = useState(() => weekPlanFingerprint(planTitle, days));
  const selectedDay = days.find((day) => day.scheduled_date === selectedDate) ?? days[0] ?? emptyDay(selectedDate);
  const selectedSession =
    selectedDay.sessions.find((session) => session.local_id === selectedSessionLocalId) ??
    selectedDay.sessions.find((session) => session.workout_type !== 'rest') ??
    selectedDay.sessions[0] ??
    null;
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
  const currentPlanFingerprint = useMemo(() => weekPlanFingerprint(planTitle, days), [days, planTitle]);
  const hasUnsavedChanges = currentPlanFingerprint !== savedPlanFingerprint;
  const isReadOnlyDemo = me.data?.is_demo === true;
  const mutationDisabledReason = isReadOnlyDemo ? t('plans.demoReadOnlyTooltip') : undefined;
  const longTermWeeks = useMemo(
    () => buildLongTermWeeks(horizonStart, longTermCalendar.data?.planned_workouts ?? []),
    [horizonStart, longTermCalendar.data?.planned_workouts],
  );
  const historicalLoadWeeks = Array.isArray(recentLoadWeeks.data) ? recentLoadWeeks.data : [];

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    const workouts = calendar.data?.planned_workouts ?? [];
    const loadedDays = weekDates.map((date) => ({
      scheduled_date: date,
      sessions: workouts
        .filter((workout) => workout.scheduled_date === date)
        .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
        .map((workout, index) => rowFromWorkout(date, workout, index)),
    }));
    const pendingDateReady = Boolean(calendar.data && pendingLongTermDate && weekDates.includes(pendingLongTermDate));
    const fallbackSelectedDate = weekDates.includes(selectedDateRef.current) ? selectedDateRef.current : weekDates[0];
    const nextSelectedDate = pendingDateReady && pendingLongTermDate ? pendingLongTermDate : fallbackSelectedDate;
    const nextSelectedDay = loadedDays.find((day) => day.scheduled_date === nextSelectedDate) ?? loadedDays[0];
    setDays(loadedDays);
    setSelectedDate(nextSelectedDate);
    setSelectedSessionLocalId(firstSelectableSessionId(nextSelectedDay));
    setSavedPlanFingerprint(weekPlanFingerprint(planTitle, loadedDays));
    if (pendingDateReady) {
      setDayEditorOpen(true);
      setPendingLongTermDate(null);
    }
  }, [calendar.data, calendar.data?.planned_workouts, pendingLongTermDate, planTitle, weekDates]);

  useEffect(() => {
    if (!preferences.data) {
      return;
    }
    setFavoriteTemplateIds(preferences.data.favorite_template_ids ?? []);
    setRecentTemplateIds(preferences.data.recent_template_ids ?? []);
  }, [preferences.data]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  function updateSession(date: string, localId: string, updates: Partial<WeekRow>) {
    if (isReadOnlyDemo) {
      return;
    }
    setDays((current) =>
      current.map((day) => {
        if (day.scheduled_date !== date) {
          return day;
        }
        const hasSession = day.sessions.some((session) => session.local_id === localId);
        const baseSessions = hasSession ? day.sessions : [{ ...emptySession(date), local_id: localId }];
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
    if (isReadOnlyDemo) {
      return;
    }
    setDays((current) =>
      current.map((day) => (day.scheduled_date === date ? { ...day, sessions: normalizeSessionOrder(sessions.map((session) => ({ ...session, scheduled_date: date }))) } : day)),
    );
  }

  function appendDaySessions(date: string, sessions: WeekRow[]) {
    if (isReadOnlyDemo) {
      return;
    }
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

  function openLongTermDay(date: string) {
    setPendingLongTermDate(date);
    setWeekStart(weekStartIso(date));
  }

  function setPlanningAnchor(date: string) {
    const nextWeekStart = weekStartIso(date);
    setHorizonStart(nextWeekStart);
    setWeekStart(nextWeekStart);
  }

  function applyTemplate(date: string, templateId: string) {
    if (isReadOnlyDemo) {
      return;
    }
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
    if (isReadOnlyDemo) {
      return;
    }
    appendDaySessions(date, [rowFromTemplate(date, template, nextSortOrder(day.sessions))]);
    setRecentTemplateIds((current) => {
      const next = [template.id, ...current.filter((id) => id !== template.id)].slice(0, 4);
      updatePreferences.mutate({ recent_template_ids: next });
      return next;
    });
  }

  function markRestDay(date: string) {
    if (isReadOnlyDemo) {
      return;
    }
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
    if (isReadOnlyDemo) {
      return;
    }
    const day = days.find((item) => item.scheduled_date === date) ?? emptyDay(date);
    if (!confirmDeleteSessions(day)) {
      return;
    }
    replaceDaySessions(date, []);
  }

  function addEasyRun(date: string) {
    if (isReadOnlyDemo) {
      return;
    }
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
    if (isReadOnlyDemo) {
      return;
    }
    const day = days.find((item) => item.scheduled_date === date) ?? emptyDay(date);
    if (!clearRestIfConfirmed(day)) {
      return;
    }
    appendDaySessions(date, doubleThresholdRows(date, nextSortOrder(day.sessions), t));
  }

  function deleteSession(date: string, localId: string) {
    if (isReadOnlyDemo) {
      return;
    }
    const day = days.find((item) => item.scheduled_date === date) ?? emptyDay(date);
    const remainingSessions = normalizeSessionOrder(day.sessions.filter((session) => session.local_id !== localId));
    replaceDaySessions(date, remainingSessions);
    setSelectedSessionLocalId(firstSelectableSessionId({ ...day, sessions: remainingSessions }));
  }

  function duplicateSession(date: string, localId: string) {
    if (isReadOnlyDemo) {
      return;
    }
    const day = days.find((item) => item.scheduled_date === date) ?? emptyDay(date);
    const session = day.sessions.find((item) => item.local_id === localId);
    if (!session || !rowHasWorkout(session)) {
      return;
    }
    const copy = {
      ...session,
      local_id: makeLocalId(date, nextSortOrder(day.sessions)),
      sort_order: nextSortOrder(day.sessions),
    };
    appendDaySessions(date, [copy]);
    setSelectedSessionLocalId(copy.local_id);
  }

  function moveSession(date: string, localId: string, offsetDays: number) {
    if (isReadOnlyDemo) {
      return;
    }
    const sourceDay = days.find((day) => day.scheduled_date === date) ?? emptyDay(date);
    const session = sourceDay.sessions.find((item) => item.local_id === localId);
    if (!session || !rowHasWorkout(session)) {
      return;
    }
    const targetDate = addDaysToIso(date, offsetDays);
    if (!weekDates.includes(targetDate)) {
      return;
    }
    const targetDay = days.find((day) => day.scheduled_date === targetDate) ?? emptyDay(targetDate);
    if (!clearRestIfConfirmed(targetDay)) {
      return;
    }
    const movedSession = {
      ...session,
      local_id: makeLocalId(targetDate, nextSortOrder(targetDay.sessions)),
      scheduled_date: targetDate,
      sort_order: nextSortOrder(targetDay.sessions),
    };
    setDays((current) =>
      current.map((day) => {
        if (day.scheduled_date === date) {
          return { ...day, sessions: normalizeSessionOrder(day.sessions.filter((item) => item.local_id !== localId)) };
        }
        if (day.scheduled_date === targetDate) {
          return { ...day, sessions: normalizeSessionOrder([...day.sessions.filter((item) => item.workout_type !== 'rest'), movedSession]) };
        }
        return day;
      }),
    );
    setSelectedDate(targetDate);
    setSelectedSessionLocalId(movedSession.local_id);
  }

  function toggleFavoriteTemplate(templateId: string) {
    if (isReadOnlyDemo) {
      return;
    }
    setFavoriteTemplateIds((current) => {
      const next = current.includes(templateId) ? current.filter((id) => id !== templateId) : [...current, templateId];
      updatePreferences.mutate({ favorite_template_ids: next });
      return next;
    });
  }

  function saveSchedule() {
    if (isReadOnlyDemo || !hasUnsavedChanges) {
      return;
    }
    const fingerprint = currentPlanFingerprint;
    saveWeek.mutate(
      { week_start_date: weekStart, plan_title: planTitle.trim(), workouts: plannedWorkoutPayloads(days) },
      {
        onSuccess: () => {
          setSavedPlanFingerprint(fingerprint);
        },
      },
    );
  }

  function createReusableTemplate() {
    if (isReadOnlyDemo) {
      return;
    }
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

  function addSessionToPool(session: WeekRow | null) {
    if (isReadOnlyDemo || !session || !rowHasWorkout(session) || session.workout_type === 'rest') {
      return;
    }
    createPoolItem.mutate({
      source_template_id: session.template_id || null,
      title: session.title.trim(),
      workout_type: session.workout_type,
      target_duration_s: numberOrNull(session.target_duration_min, 60),
      target_distance_m: numberOrNull(session.target_distance_km, 1000),
      target_intensity: session.target_intensity || null,
      instructions: session.instructions.trim() || null,
    });
  }

  function addSelectedToPool() {
    addSessionToPool(selectedSession);
  }

  function schedulePoolWorkout(item: WorkoutPoolItem) {
    if (isReadOnlyDemo) {
      return;
    }
    const day = days.find((current) => current.scheduled_date === selectedDate) ?? emptyDay(selectedDate);
    if (!clearRestIfConfirmed(day)) {
      return;
    }
    const sortOrder = nextSortOrder(day.sessions);
    appendDaySessions(selectedDate, [rowFromPoolItem(selectedDate, item, sortOrder)]);
    schedulePoolItem.mutate({ id: item.id, scheduled_date: selectedDate, sort_order: sortOrder });
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t('plans.eyebrow')}</p>
          <h1>{t('plans.title')}</h1>
        </div>
        <div className="date-controls">
          <button className="secondary-button" type="button" onClick={() => setPlanningAnchor(addDaysToIso(horizonStart, -7))}>
            <ChevronLeft size={16} />
            {t('common.previous')}
          </button>
          <input
            aria-label={t('plans.planTitle')}
            value={planTitle}
            readOnly
            title={t('plans.autoPlanTitle')}
          />
          <input type="date" value={horizonStart} onChange={(event) => setPlanningAnchor(event.target.value)} />
          <button className="secondary-button" type="button" onClick={() => setPlanningAnchor(addDaysToIso(horizonStart, 7))}>
            {t('common.next')}
            <ChevronRight size={16} />
          </button>
          <button className="secondary-button" type="button" onClick={() => setTemplateLibraryOpen(true)}>
            <Archive size={16} />
            {t('plans.templateLibrary')}
          </button>
          <button className="primary-button" type="button" onClick={saveSchedule} disabled={isReadOnlyDemo || !hasUnsavedChanges || saveWeek.isPending} title={mutationDisabledReason}>
            {saveWeek.isPending ? t('common.saving') : t('plans.saveWeek')}
          </button>
          {hasUnsavedChanges ? <span className="unsaved-badge">{t('plans.unsavedChanges')}</span> : null}
        </div>
      </header>

      {isReadOnlyDemo ? (
        <section className="read-only-demo-banner" role="status">
          <strong>{t('plans.demoReadOnlyTitle')}</strong>
          <span>{t('plans.demoReadOnlyDetail')}</span>
        </section>
      ) : null}

      <section className="planning-long-term-layout">
        <PlanningVolumeOutlookChart historicalWeeks={historicalLoadWeeks} plannedWeeks={longTermWeeks} />
        <section className="panel long-term-plan-panel" aria-label={t('plans.longTermPlan')}>
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">{t('plans.longTermPlanEyebrow')}</p>
              <h2>{t('plans.longTermPlan')}</h2>
              <small>{t('plans.longTermPlanHelp')}</small>
            </div>
          </div>
          <div className="long-term-week-list">
            {longTermWeeks.map((week) => (
              <LongTermWeekRow key={week.weekStart} week={week} onSelectDay={openLongTermDay} />
            ))}
          </div>
        </section>
      </section>

      {dayEditorOpen && selectedDay ? (
        <DayEditorModal
          day={selectedDay}
          weekDates={weekDates}
          weekEnd={weekEnd}
          selectedSessionId={selectedSession?.local_id ?? null}
          onClose={() => setDayEditorOpen(false)}
          onUpdate={updateSession}
          onSelectSession={setSelectedSessionLocalId}
          onDeleteSession={deleteSession}
          onDuplicateSession={duplicateSession}
          onMoveSession={moveSession}
          onAddSessionPool={(session) => addSessionToPool(session)}
          onRest={markRestDay}
          onClear={clearDay}
          onAddEasy={addEasyRun}
          onAddDoubleThreshold={addDoubleThreshold}
          readOnly={isReadOnlyDemo}
          disabledReason={mutationDisabledReason}
        />
      ) : null}

      {templateLibraryOpen ? (
        <PlanningToolsModal
          favoriteTemplateIds={favoriteTemplateIds}
          isReadOnlyDemo={isReadOnlyDemo}
          isSchedulePending={schedulePoolItem.isPending}
          mutationDisabledReason={mutationDisabledReason}
          poolItems={poolItems}
          recentTemplateIds={recentTemplateIds}
          selectedDate={selectedDate}
          selectedSession={selectedSession}
          templateSearch={templateSearch}
          templates={visibleTemplates}
          onAddSelectedToPool={addSelectedToPool}
          onAddTemplate={() => setTemplateDialogOpen(true)}
          onApplyTemplate={applyTemplate}
          onClose={() => setTemplateLibraryOpen(false)}
          onSchedulePoolWorkout={schedulePoolWorkout}
          onSearchChange={setTemplateSearch}
          onToggleFavorite={toggleFavoriteTemplate}
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

function PlanningVolumeOutlookChart({
  historicalWeeks,
  plannedWeeks,
}: {
  historicalWeeks: WeeklyMetric[];
  plannedWeeks: LongTermWeekPlan[];
}) {
  const { t } = useTranslation();
  const data = [
    ...historicalWeeks.map((week) => ({
      week_start_date: week.week_start_date,
      actual_distance_km: Number(week.distance_m) / 1000,
      planned_distance_km: null,
      actual_time_h: Number(week.moving_time_s) / 3600,
      planned_time_h: null,
    })),
    ...plannedWeeks.map((week) => ({
      week_start_date: week.weekStart,
      actual_distance_km: null,
      planned_distance_km: week.overview.plannedDistanceM / 1000,
      actual_time_h: null,
      planned_time_h: week.overview.plannedTimeS / 3600,
    })),
  ];
  return (
    <div className="chart-box planning-volume-outlook">
      <h2>{t('plans.volumeOutlook')}</h2>
      <p className="chart-note">{t('plans.volumeOutlookHelp')}</p>
      <div className="chart-legend">
        <span>
          <span className="legend-dot" style={{ background: '#2f66d0' }} />
          {t('plans.actualDistance')}
        </span>
        <span>
          <span className="legend-dot" style={{ background: '#d17b0f' }} />
          {t('plans.plannedDistance')}
        </span>
        <span>
          <span className="legend-dot" style={{ background: '#4f8f5f' }} />
          {t('plans.actualTime')}
        </span>
        <span>
          <span className="legend-dot" style={{ background: '#9c6ade' }} />
          {t('plans.plannedTime')}
        </span>
      </div>
      <div className="planning-volume-chart-grid">
        <section className="planning-volume-chart">
          <h3>{t('plans.mileage')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week_start_date" tickFormatter={(value) => formatShortDate(String(value))} />
              <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)} km`} />
              <Tooltip
                formatter={(value, name) => [
                  value === null ? t('common.notAvailable') : formatDistance(Number(value) * 1000),
                  name,
                ]}
                labelFormatter={(value) => formatShortDate(String(value))}
              />
              <Bar dataKey="actual_distance_km" name={t('plans.actualDistance')} fill="#2f66d0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="planned_distance_km" name={t('plans.plannedDistance')} fill="#d17b0f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="planning-volume-chart">
          <h3>{t('plans.timeChart')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week_start_date" tickFormatter={(value) => formatShortDate(String(value))} />
              <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}h`} />
              <Tooltip
                formatter={(value, name) => [
                  value === null ? t('common.notAvailable') : formatDuration(Number(value) * 3600),
                  name,
                ]}
                labelFormatter={(value) => formatShortDate(String(value))}
              />
              <Bar dataKey="actual_time_h" name={t('plans.actualTime')} fill="#4f8f5f" radius={[4, 4, 0, 0]} />
              <Bar dataKey="planned_time_h" name={t('plans.plannedTime')} fill="#9c6ade" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
      <small>{t('plans.actualPlannedVolume')}</small>
    </div>
  );
}

function PlanningToolsModal({
  favoriteTemplateIds,
  isReadOnlyDemo,
  isSchedulePending,
  mutationDisabledReason,
  poolItems,
  recentTemplateIds,
  selectedDate,
  selectedSession,
  templateSearch,
  templates,
  onAddSelectedToPool,
  onAddTemplate,
  onApplyTemplate,
  onClose,
  onSchedulePoolWorkout,
  onSearchChange,
  onToggleFavorite,
}: {
  favoriteTemplateIds: string[];
  isReadOnlyDemo: boolean;
  isSchedulePending: boolean;
  mutationDisabledReason?: string;
  poolItems: WorkoutPoolItem[];
  recentTemplateIds: string[];
  selectedDate: string;
  selectedSession: WeekRow | null;
  templateSearch: string;
  templates: WorkoutTemplate[];
  onAddSelectedToPool: () => void;
  onAddTemplate: () => void;
  onApplyTemplate: (date: string, templateId: string) => void;
  onClose: () => void;
  onSchedulePoolWorkout: (item: WorkoutPoolItem) => void;
  onSearchChange: (value: string) => void;
  onToggleFavorite: (templateId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-label={t('plans.templateLibrary')}
        aria-modal="true"
        className="modal-panel planning-tools-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{formatDate(selectedDate)}</p>
            <h2>{t('plans.templateLibrary')}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t('plans.closeTemplateLibrary')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="planning-tools-grid">
          <section className="planning-tools-section">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">{t('plans.clickTemplate')}</p>
                <h3>{t('plans.templateLibrary')}</h3>
              </div>
              <button className="secondary-button compact" type="button" onClick={onAddTemplate} disabled={isReadOnlyDemo} title={mutationDisabledReason}>
                <Plus size={16} />
                {t('common.add')}
              </button>
            </div>
            <input
              aria-label={t('plans.searchTemplates')}
              placeholder={t('plans.searchTemplates')}
              value={templateSearch}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            {recentTemplateIds.length > 0 ? <small>{t('plans.recentlyUsed', { count: recentTemplateIds.length })}</small> : null}
            <div className="template-chip-list horizontal">
              {templates.map((template) => (
                <div className="template-chip-row" key={template.id}>
                  <button
                    className="template-chip"
                    type="button"
                    aria-label={t('plans.useTemplate', { name: template.name })}
                    disabled={isReadOnlyDemo}
                    title={mutationDisabledReason}
                    onClick={() => onApplyTemplate(selectedDate, template.id)}
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
                    disabled={isReadOnlyDemo}
                    title={mutationDisabledReason ?? t(favoriteTemplateIds.includes(template.id) ? 'plans.unfavorite' : 'plans.favorite', { name: template.name })}
                    onClick={() => onToggleFavorite(template.id)}
                  >
                    <Star size={16} fill={favoriteTemplateIds.includes(template.id) ? 'currentColor' : 'none'} />
                  </button>
                </div>
              ))}
              {templates.length === 0 ? <small>{t('plans.noTemplates')}</small> : null}
            </div>
          </section>
          <section className="planning-tools-section">
            <div className="panel-heading compact">
              <div>
                <p className="eyebrow">{t('plans.unscheduled')}</p>
                <h3>{t('plans.workoutPool')}</h3>
              </div>
              <button
                className="secondary-button compact"
                type="button"
                onClick={onAddSelectedToPool}
                disabled={isReadOnlyDemo || !selectedSession || !rowHasWorkout(selectedSession) || selectedSession.workout_type === 'rest'}
                title={mutationDisabledReason}
              >
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
                  onClick={() => onSchedulePoolWorkout(item)}
                  disabled={isReadOnlyDemo || isSchedulePending}
                  title={mutationDisabledReason}
                >
                  <strong>{item.title}</strong>
                  <span>{enumLabel(t, 'workout', item.workout_type)} · {enumLabel(t, 'intensity', item.target_intensity ?? 'free')} · {formatDistance(item.target_distance_m)}</span>
                </button>
              ))}
              {poolItems.length === 0 ? <small>{t('plans.noPool')}</small> : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function LongTermWeekRow({
  week,
  onSelectDay,
}: {
  week: LongTermWeekPlan;
  onSelectDay: (date: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="long-term-week-row" data-testid={`long-term-week-${week.weekStart}`}>
      <div className="long-term-week-label">
        <strong>{t('plans.weekNumber', { number: week.weekNumber })}</strong>
        <small>{formatShortDate(week.weekStart)}</small>
      </div>
      <div className="long-term-day-grid">
        {week.days.map((day) => (
          <LongTermDayButton key={day.scheduled_date} day={day} onSelect={() => onSelectDay(day.scheduled_date)} />
        ))}
      </div>
      <div className="long-term-week-summary" aria-label={t('plans.weekSummary', { date: formatDate(week.weekStart) })}>
        <strong>{formatDistance(week.overview.plannedDistanceM)}</strong>
        <span>{formatDuration(week.overview.plannedTimeS)}</span>
        <small>{Math.round(week.overview.plannedLoad)} {t('plans.loadShort')}</small>
      </div>
    </div>
  );
}

function LongTermDayButton({ day, onSelect }: { day: WeekDayPlan; onSelect: () => void }) {
  const { t } = useTranslation();
  const state = dayState(day);
  const visibleSessions = day.sessions.filter(rowHasWorkout);
  const primarySession = visibleSessions.find((session) => session.workout_type !== 'rest') ?? visibleSessions[0] ?? null;
  const extraSessionCount = Math.max(0, visibleSessions.length - 1);
  const summary = primarySession
    ? primarySession.title || enumLabel(t, 'workout', primarySession.workout_type)
    : t('plans.unscheduledDay');
  const detail =
    primarySession && primarySession.workout_type !== 'rest'
      ? `${primarySession.target_distance_km ? formatDistance(Number(primarySession.target_distance_km) * 1000) : t('plans.noDistance')} · ${
          primarySession.target_duration_min ? formatDuration(Number(primarySession.target_duration_min) * 60) : t('plans.noTime')
        }`
      : t(state === 'rest' ? 'plans.restDay' : 'plans.noDistance');
  const typeClass = primarySession ? `type-${primarySession.workout_type}` : 'type-empty';
  return (
    <button
      className={`long-term-day-button ${state} ${typeClass}`}
      type="button"
      aria-label={t('plans.openLongTermDay', { date: shortWeekday(day.scheduled_date), summary })}
      onClick={onSelect}
    >
      <span>{shortWeekday(day.scheduled_date)}</span>
      <strong>{summary}</strong>
      {extraSessionCount > 0 ? <em>{t('plans.moreSessions', { count: extraSessionCount })}</em> : null}
      <small>{detail}</small>
    </button>
  );
}

function DayEditorModal({
  day,
  weekDates,
  weekEnd,
  selectedSessionId,
  onClose,
  onUpdate,
  onSelectSession,
  onDeleteSession,
  onDuplicateSession,
  onMoveSession,
  onAddSessionPool,
  onRest,
  onClear,
  onAddEasy,
  onAddDoubleThreshold,
  readOnly,
  disabledReason,
}: {
  day: WeekDayPlan;
  weekDates: string[];
  weekEnd: string;
  selectedSessionId: string | null;
  onClose: () => void;
  onUpdate: (date: string, localId: string, updates: Partial<WeekRow>) => void;
  onSelectSession: (localId: string) => void;
  onDeleteSession: (date: string, localId: string) => void;
  onDuplicateSession: (date: string, localId: string) => void;
  onMoveSession: (date: string, localId: string, days: number) => void;
  onAddSessionPool: (session: WeekRow) => void;
  onRest: (date: string) => void;
  onClear: (date: string) => void;
  onAddEasy: (date: string) => void;
  onAddDoubleThreshold: (date: string) => void;
  readOnly: boolean;
  disabledReason?: string;
}) {
  const { t } = useTranslation();
  const draftSession = useMemo(() => emptySession(day.scheduled_date), [day.scheduled_date]);
  const editableSessions = day.sessions.length > 0 ? day.sessions : [draftSession];
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
          <div className="day-editor-primary-actions">
            <button className="secondary-button" type="button" onClick={() => onAddEasy(day.scheduled_date)} disabled={readOnly} title={disabledReason}>
              {t('plans.addEasyRun')}
            </button>
            <button className="secondary-button" type="button" onClick={() => onAddDoubleThreshold(day.scheduled_date)} disabled={readOnly} title={disabledReason}>
              {t('plans.addDoubleThreshold')}
            </button>
          </div>
          <div className="day-editor-danger-actions">
            <button className="secondary-button danger-lite" type="button" onClick={() => onRest(day.scheduled_date)} disabled={readOnly} title={disabledReason}>
              {t('plans.markWholeDayRest')}
            </button>
            <button className="secondary-button danger-lite" type="button" onClick={() => onClear(day.scheduled_date)} disabled={readOnly} title={disabledReason}>
              {t('plans.clearWholeDay')}
            </button>
          </div>
        </div>
        <div className="day-editor-session-list">
          {editableSessions.map((session, index) => {
            const sessionNumber = index + 1;
            const isWorkout = rowHasWorkout(session);
            const isSelected = selectedSessionId === session.local_id || (!selectedSessionId && index === 0);
            return (
            <section
              className={`day-editor-session ${isSelected ? 'selected' : ''}`}
              key={session.local_id}
              onClick={() => onSelectSession(session.local_id)}
              onFocusCapture={() => onSelectSession(session.local_id)}
            >
              <div className="session-heading">
                <div>
                  <strong>{t('plans.sessionNumber', { count: sessionNumber })}</strong>
                  {session.session_label ? <span>{session.session_label}</span> : null}
                  {isSelected ? <small>{t('plans.selectedSession')}</small> : null}
                </div>
                <div className="session-actions">
                  <button
                    className="icon-button compact"
                    type="button"
                    aria-label={t('plans.moveSessionLeft', { count: sessionNumber })}
                    title={readOnly ? disabledReason : t('plans.moveSessionLeft', { count: sessionNumber })}
                    disabled={readOnly || !isWorkout || day.scheduled_date === weekDates[0]}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMoveSession(day.scheduled_date, session.local_id, -1);
                    }}
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <button
                    className="icon-button compact"
                    type="button"
                    aria-label={t('plans.moveSessionRight', { count: sessionNumber })}
                    title={readOnly ? disabledReason : t('plans.moveSessionRight', { count: sessionNumber })}
                    disabled={readOnly || !isWorkout || day.scheduled_date === weekEnd}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMoveSession(day.scheduled_date, session.local_id, 1);
                    }}
                  >
                    <ArrowRight size={15} />
                  </button>
                  <button
                    className="icon-button compact"
                    type="button"
                    aria-label={t('plans.duplicateSession', { count: sessionNumber })}
                    title={readOnly ? disabledReason : t('plans.duplicateSession', { count: sessionNumber })}
                    disabled={readOnly || !isWorkout}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDuplicateSession(day.scheduled_date, session.local_id);
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="icon-button compact"
                    type="button"
                    aria-label={t('plans.addSessionToPool', { count: sessionNumber })}
                    title={readOnly ? disabledReason : t('plans.addSessionToPool', { count: sessionNumber })}
                    disabled={readOnly || !isWorkout || session.workout_type === 'rest'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddSessionPool(session);
                    }}
                  >
                    <Archive size={15} />
                  </button>
                  <button
                    className="icon-button compact danger"
                    type="button"
                    aria-label={t('plans.deleteSession', { count: sessionNumber })}
                    title={readOnly ? disabledReason : t('plans.deleteSession', { count: sessionNumber })}
                    disabled={readOnly}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteSession(day.scheduled_date, session.local_id);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="week-row-fields vertical">
                <input
                  aria-label={`${t('plans.sessionLabel')} ${day.scheduled_date} ${sessionNumber}`}
                  placeholder={t('plans.sessionLabel')}
                  value={session.session_label}
                  disabled={readOnly}
                  title={disabledReason}
                  onChange={(event) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', session_label: event.target.value })}
                />
                <input
                  aria-label={`${t('plans.titleField')} ${day.scheduled_date} ${sessionNumber}`}
                  placeholder={t('plans.titleField')}
                  value={session.title}
                  disabled={readOnly}
                  title={disabledReason}
                  onChange={(event) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', title: event.target.value })}
                />
                <select
                  aria-label={`${t('plans.workoutType')} ${day.scheduled_date} ${sessionNumber}`}
                  value={session.workout_type}
                  disabled={readOnly}
                  title={disabledReason}
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
                      ariaLabel={`${t('plans.targetDistance')} ${t('plans.kilometersShort')} ${day.scheduled_date} ${sessionNumber}`}
                      helper={t('plans.targetDistanceHelp')}
                      inputMode="decimal"
                      label={t('plans.targetDistance')}
                      placeholder={t('plans.distancePlaceholder')}
                      unit={t('plans.kilometersShort')}
                      value={session.target_distance_km}
                      disabled={readOnly}
                      title={disabledReason}
                      onChange={(value) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', target_distance_km: value })}
                    />
                    <MetricInputField
                      ariaLabel={`${t('plans.targetDuration')} ${t('plans.minutesShort')} ${day.scheduled_date} ${sessionNumber}`}
                      helper={t('plans.targetDurationHelp')}
                      inputMode="numeric"
                      label={t('plans.targetDuration')}
                      placeholder={t('plans.durationPlaceholder')}
                      unit={t('plans.minutesShort')}
                      value={session.target_duration_min}
                      disabled={readOnly}
                      title={disabledReason}
                      onChange={(value) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', target_duration_min: value })}
                    />
                  </div>
                </div>
                <select
                  aria-label={`${t('common.intensity')} ${day.scheduled_date} ${sessionNumber}`}
                  value={session.target_intensity}
                  disabled={readOnly}
                  title={disabledReason}
                  onChange={(event) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', target_intensity: event.target.value })}
                >
                  <IntensityOptions />
                </select>
              </div>
              <textarea
                aria-label={`${t('plans.instructions')} ${day.scheduled_date} ${sessionNumber}`}
                rows={4}
                placeholder={t('plans.instructions')}
                value={session.instructions}
                disabled={readOnly}
                title={disabledReason}
                onChange={(event) => onUpdate(day.scheduled_date, session.local_id, { template_id: '', instructions: event.target.value })}
              />
            </section>
          );
          })}
        </div>
      </section>
    </div>
  );
}

function MetricInputField({
  ariaLabel,
  disabled,
  helper,
  inputMode,
  label,
  placeholder,
  title,
  unit,
  value,
  onChange,
}: {
  ariaLabel: string;
  disabled?: boolean;
  helper: string;
  inputMode: 'decimal' | 'numeric';
  label: string;
  placeholder: string;
  title?: string;
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
          disabled={disabled}
          title={title}
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

function buildLongTermWeeks(startDate: string, workouts: PlannedWorkout[]): LongTermWeekPlan[] {
  const workoutsByDate = workouts.reduce<Map<string, PlannedWorkout[]>>((byDate, workout) => {
    const current = byDate.get(workout.scheduled_date) ?? [];
    current.push(workout);
    byDate.set(workout.scheduled_date, current);
    return byDate;
  }, new Map());
  return Array.from({ length: LONG_TERM_WEEK_COUNT }, (_, weekIndex) => {
    const weekStart = addDaysToIso(startDate, weekIndex * DAYS_PER_WEEK);
    const days = Array.from({ length: DAYS_PER_WEEK }, (_, dayIndex) => {
      const scheduledDate = addDaysToIso(weekStart, dayIndex);
      return {
        scheduled_date: scheduledDate,
        sessions: (workoutsByDate.get(scheduledDate) ?? [])
          .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
          .map((workout, index) => rowFromWorkout(scheduledDate, workout, index)),
      };
    });
    return {
      weekStart,
      weekNumber: isoWeekNumber(weekStart),
      days,
      overview: overviewFromDays(days),
    };
  });
}

function isoWeekNumber(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1, day));
  const weekday = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function plannedWorkoutPayloads(days: WeekDayPlan[]) {
  return days
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
}

function weekPlanFingerprint(planTitle: string, days: WeekDayPlan[]) {
  return JSON.stringify({
    plan_title: planTitle.trim(),
    workouts: plannedWorkoutPayloads(days),
  });
}

function firstSelectableSessionId(day: WeekDayPlan | undefined) {
  return day?.sessions.find(rowHasWorkout)?.local_id ?? day?.sessions[0]?.local_id ?? null;
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
