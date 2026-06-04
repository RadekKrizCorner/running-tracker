import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type {
  ElevationRecomputeResponse,
  HeartRateRecomputeResponse,
  HeartRateZoneSet,
  UserPreference,
} from '../../lib/api/types';

export function useHeartRateZones() {
  return useQuery({
    queryKey: ['heartRateZones'],
    queryFn: () => apiRequest<HeartRateZoneSet[]>('/profile/hr-zones'),
  });
}

export function useSaveHeartRateZones() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<HeartRateZoneSet, 'id'>) =>
      apiRequest<HeartRateZoneSet>('/profile/hr-zones', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['heartRateZones'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['recentWeeklyAnalytics'] });
    },
  });
}

export function useRecomputeHeartRateMetrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<HeartRateRecomputeResponse>('/profile/hr-zones/recompute', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['recentWeeklyAnalytics'] });
    },
  });
}

export function useUserPreferences() {
  return useQuery({
    queryKey: ['userPreferences'],
    queryFn: () => apiRequest<UserPreference>('/profile/preferences'),
  });
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<UserPreference>) =>
      apiRequest<UserPreference>('/profile/preferences', { method: 'PATCH', body: payload }),
    onSuccess: (preferences) => {
      queryClient.setQueryData(['userPreferences'], preferences);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRecomputeElevationMetrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<ElevationRecomputeResponse>('/profile/elevation/recompute', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['recentWeeklyAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['activityStreams'] });
      queryClient.invalidateQueries({ queryKey: ['activitySplits'] });
    },
  });
}
