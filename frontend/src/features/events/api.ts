import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type { Event, EventPlanningGuidance } from '../../lib/api/types';

export type EventPayload = {
  name: string;
  event_date: string;
  location?: string | null;
  event_type: string;
  distance_m?: number | null;
  elevation_gain_m?: number | null;
  surface?: string | null;
  priority?: string | null;
  status?: string;
  target_time_s?: number | null;
  website_url?: string | null;
  course_map_url?: string | null;
  course_gpx?: string | null;
  poster_image_data?: string | null;
  goal_notes?: string | null;
  course_notes?: string | null;
  fueling_notes?: string | null;
  gear_notes?: string | null;
  travel_notes?: string | null;
};

export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: () => apiRequest<Event[]>('/events'),
  });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event', eventId],
    queryFn: () => apiRequest<Event>(`/events/${eventId}`),
    enabled: Boolean(eventId),
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EventPayload) => apiRequest<Event>('/events', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateEvent(eventId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<EventPayload>) => apiRequest<Event>(`/events/${eventId}`, { method: 'PATCH', body: payload }),
    onSuccess: (event) => {
      queryClient.setQueryData(['event', eventId], event);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['eventPlanningGuidance', eventId] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useEventPlanningGuidance(eventId: string | undefined) {
  return useQuery({
    queryKey: ['eventPlanningGuidance', eventId],
    queryFn: () => apiRequest<EventPlanningGuidance>(`/events/${eventId}/planning-guidance`),
    enabled: Boolean(eventId),
  });
}
