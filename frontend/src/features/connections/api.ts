import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL, apiRequest } from '../../lib/api/client';
import type { StravaStatus, StravaSyncJobStatus, StravaSyncResponse } from '../../lib/api/types';

type SyncMode = 'recent' | 'history';

export function useStravaStatus() {
  return useQuery({
    queryKey: ['stravaStatus'],
    queryFn: () => apiRequest<StravaStatus>('/connections/strava/status'),
  });
}

export function useStravaSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload?: { mode?: SyncMode }) =>
      apiRequest<StravaSyncResponse>('/connections/strava/sync', {
        method: 'POST',
        body: { mode: payload?.mode ?? 'recent' },
      }),
    onSuccess: () => {
      invalidateStravaSyncedData(queryClient);
    },
  });
}

export function useStravaSyncJob(jobId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['stravaSyncJob', jobId],
    queryFn: () => apiRequest<StravaSyncJobStatus>(`/connections/strava/sync/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && syncStatusIsActive(status) ? 2000 : false;
    },
  });
  const status = query.data?.status;

  useEffect(() => {
    if (status === 'finished' || status === 'failed') {
      invalidateStravaSyncedData(queryClient);
    }
  }, [queryClient, status]);

  return query;
}

export function useDisconnectStrava() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<StravaStatus>('/connections/strava/disconnect', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stravaStatus'] }),
  });
}

export function stravaConnectUrl(forceApproval = false) {
  const forceQuery = forceApproval ? '?force=true' : '';
  return `${API_BASE_URL}/connections/strava/start${forceQuery}`;
}

export function syncStatusIsActive(status: string | null | undefined) {
  return status === 'queued' || status === 'deferred' || status === 'scheduled' || status === 'started';
}

export function invalidateStravaSyncedData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['stravaStatus'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['activities'] });
  queryClient.invalidateQueries({ queryKey: ['calendar'] });
  queryClient.invalidateQueries({ queryKey: ['weeklyAnalytics'] });
  queryClient.invalidateQueries({ queryKey: ['recentWeeklyAnalytics'] });
  queryClient.invalidateQueries({ queryKey: ['trendMetrics'] });
  queryClient.invalidateQueries({ queryKey: ['aerobicTrend'] });
  queryClient.invalidateQueries({ queryKey: ['personalRecords'] });
  queryClient.invalidateQueries({ queryKey: ['runHeatmap'] });
  queryClient.invalidateQueries({ queryKey: ['notificationSummary'] });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
}
