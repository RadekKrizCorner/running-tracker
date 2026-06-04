import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type { Activity, ActivityNote, ActivitySplitsResponse, Stream } from '../../lib/api/types';

export type ActivityFilters = {
  start_date?: string;
  end_date?: string;
  intensity_class?: string;
  search?: string;
  sort?: string;
  sport_type?: string;
};

function queryString(filters: ActivityFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return params.toString();
}

export function useActivities(filters: ActivityFilters = {}) {
  const qs = queryString(filters);
  return useQuery({
    queryKey: ['activities', filters],
    queryFn: () => apiRequest<Activity[]>(`/activities${qs ? `?${qs}` : ''}`),
  });
}

export function useActivity(activityId: string | undefined) {
  return useQuery({
    queryKey: ['activity', activityId],
    queryFn: () => apiRequest<Activity>(`/activities/${activityId}`),
    enabled: Boolean(activityId),
  });
}

export function useActivityStreams(activityId: string | undefined) {
  return useQuery({
    queryKey: ['activityStreams', activityId],
    queryFn: () => apiRequest<Stream[]>(`/activities/${activityId}/streams`),
    enabled: Boolean(activityId),
  });
}

export function useActivitySplits(activityId: string | undefined) {
  return useQuery({
    queryKey: ['activitySplits', activityId],
    queryFn: () => apiRequest<ActivitySplitsResponse>(`/activities/${activityId}/splits`),
    enabled: Boolean(activityId),
  });
}

export function useSaveNote(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<ActivityNote>) =>
      apiRequest<ActivityNote>(`/activities/${activityId}/notes`, { method: 'PUT', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity', activityId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
