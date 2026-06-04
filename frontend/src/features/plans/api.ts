import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type {
  CalendarEvent,
  CalendarResponse,
  PlanPreview,
  PlannedWorkout,
  TrainingPlan,
  WorkoutPoolItem,
  WorkoutTemplate,
} from '../../lib/api/types';
import { addDaysIso, todayIso } from '../../lib/date';

type CalendarEventPayload = {
  event_date: string;
  event_type: string;
  title: string;
  notes?: string | null;
};

export function useCalendar(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['calendar', { startDate, endDate }],
    queryFn: () => apiRequest<CalendarResponse>(`/calendar?start_date=${startDate}&end_date=${endDate}`),
  });
}

export function useWorkoutTemplates() {
  return useQuery({
    queryKey: ['workoutTemplates'],
    queryFn: () => apiRequest<WorkoutTemplate[]>('/workout-templates'),
  });
}

export function useCreateWorkoutTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<WorkoutTemplate, 'id'>) =>
      apiRequest<WorkoutTemplate>('/workout-templates', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutTemplates'] });
    },
  });
}

export function useSaveWeekSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      week_start_date: string;
      plan_title?: string;
      workouts: Array<{
        scheduled_date: string;
        template_id?: string;
        session_label?: string | null;
        sort_order?: number;
        workout_type?: string;
        title?: string;
        target_duration_s?: number | null;
        target_distance_m?: number | null;
        target_intensity?: string | null;
        instructions?: string | null;
        status?: string;
      }>;
    }) => apiRequest<CalendarResponse>('/calendar/week', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCopyWeekSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { source_week_start_date: string; target_week_start_date: string; plan_title?: string }) =>
      apiRequest<CalendarResponse>('/calendar/week/copy', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useWorkoutPool() {
  return useQuery({
    queryKey: ['workoutPool'],
    queryFn: () => apiRequest<WorkoutPoolItem[]>('/workout-pool'),
  });
}

export function useCreateWorkoutPoolItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<WorkoutPoolItem, 'id'>) =>
      apiRequest<WorkoutPoolItem>('/workout-pool', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutPool'] });
    },
  });
}

export function useScheduleWorkoutPoolItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; scheduled_date: string; session_label?: string | null; sort_order?: number }) =>
      apiRequest<PlannedWorkout>(`/workout-pool/${payload.id}/schedule`, {
        method: 'POST',
        body: {
          scheduled_date: payload.scheduled_date,
          session_label: payload.session_label ?? null,
          sort_order: payload.sort_order ?? null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutPool'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CalendarEventPayload) =>
      apiRequest<CalendarEvent>('/calendar/events', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: () => apiRequest<TrainingPlan[]>('/plans'),
  });
}

export function useGeneratePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Record<string, unknown>>) =>
      apiRequest<PlanPreview>('/plans/generate', {
        method: 'POST',
        body: {
          goal_type: 'general_fitness',
          start_date: todayIso(),
          weeks: 8,
          current_weekly_distance_m: 20000,
          current_runs_per_week: 4,
          preferred_run_days: [0, 2, 4, 6],
          long_run_day: 6,
          experience_level: 'regular',
          injury_risk: 'low',
          ...payload,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export function defaultCalendarRange() {
  return { start: todayIso(), end: addDaysIso(30) };
}
