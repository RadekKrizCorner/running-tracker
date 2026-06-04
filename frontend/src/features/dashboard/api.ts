import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type { Dashboard } from '../../lib/api/types';

export function useDashboard(period = 'week', weekStartDate?: string) {
  return useQuery({
    queryKey: ['dashboard', period, weekStartDate],
    queryFn: () => {
      const params = new URLSearchParams({ period });
      if (weekStartDate) {
        params.set('week_start_date', weekStartDate);
      }
      return apiRequest<Dashboard>(`/analytics/dashboard?${params.toString()}`);
    },
  });
}
