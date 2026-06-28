import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type {
  ActivitySummary,
  AerobicTrendPoint,
  RunHeatmap,
  TrendMetricWeek,
  WeeklyMetric,
  YearlyRunningSummary,
} from '../../lib/api/types';

export type DateRangeFilters = {
  start_date?: string;
  end_date?: string;
};

export type RunHeatmapFilters = DateRangeFilters;

function queryString(filters: DateRangeFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return params.toString();
}

export function useWeeklyAnalytics() {
  return useQuery({
    queryKey: ['weeklyAnalytics'],
    queryFn: () => apiRequest<WeeklyMetric[]>('/analytics/weekly'),
  });
}

export function useWeeklyAnalyticsRange(startDate: string | null, endDate: string | null, enabled = true) {
  const qs = queryString({
    start_date: startDate ?? undefined,
    end_date: endDate ?? undefined,
  });
  return useQuery({
    queryKey: ['weeklyAnalytics', 'range', startDate, endDate],
    enabled: enabled && Boolean(qs),
    queryFn: () => apiRequest<WeeklyMetric[]>(`/analytics/weekly?${qs}`),
  });
}

export function useRecentWeeklyAnalytics(weeks = 4, enabled = true) {
  return useQuery({
    queryKey: ['recentWeeklyAnalytics', weeks],
    enabled,
    queryFn: () => apiRequest<WeeklyMetric[]>(`/analytics/recent-weeks?weeks=${weeks}`),
  });
}

export function useYearlyRunningSummary(year: number | null) {
  return useQuery({
    queryKey: ['yearlyRunningSummary', year],
    enabled: year !== null,
    queryFn: () => {
      if (year === null) {
        throw new Error('Year is required');
      }
      return apiRequest<YearlyRunningSummary>(`/analytics/yearly-summary?year=${year}`);
    },
  });
}

export function useAerobicTrend() {
  return useQuery({
    queryKey: ['aerobicTrend'],
    queryFn: () => apiRequest<AerobicTrendPoint[]>('/analytics/aerobic-trend'),
  });
}

export function useTrendMetrics(weeks = 13) {
  return useQuery({
    queryKey: ['trendMetrics', weeks],
    queryFn: () => apiRequest<TrendMetricWeek[]>(`/analytics/trend-metrics?weeks=${weeks}`),
  });
}

export type PersonalRecords = {
  five_k_activity: ActivitySummary | null;
  ten_k_activity: ActivitySummary | null;
  half_marathon: ActivitySummary | null;
  marathon: ActivitySummary | null;
};

export function usePersonalRecords() {
  return useQuery({
    queryKey: ['personalRecords'],
    queryFn: () => apiRequest<PersonalRecords>('/analytics/prs'),
  });
}

export function useRunHeatmap(filters: RunHeatmapFilters = {}) {
  const qs = queryString(filters);
  return useQuery({
    queryKey: ['runHeatmap', filters],
    queryFn: () => apiRequest<RunHeatmap>(`/analytics/heatmap${qs ? `?${qs}` : ''}`),
    placeholderData: (previousData) => previousData,
  });
}
