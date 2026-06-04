import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { LanguageProvider } from '../lib/i18n';
import { TrendsPage } from './TrendsPage';

describe('TrendsPage', () => {
  test('renders three-month load volume durability and easy-efficiency charts', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/analytics/recent-weeks?weeks=13')) {
        return Promise.resolve(
          jsonResponse([
            metric('2026-02-02', 6000, 2100, 2100, 0, 0, 60, 90),
            metric('2026-02-09', 7000, 2400, 1800, 600, 0, 70, 120),
            metric('2026-02-16', 0, 0, 0, 0, 0, 0),
            metric('2026-02-23', 9000, 3000, 2400, 600, 0, 85, 210),
            metric('2026-03-02', 10000, 3300, 2400, 900, 0, 100, 250),
            metric('2026-03-09', 11000, 3600, 2700, 900, 0, 120, 280),
            metric('2026-03-16', 12000, 3900, 3000, 900, 0, 130, 320),
            metric('2026-03-23', 9000, 3000, 1800, 900, 300, 95, 270),
            metric('2026-03-30', 13000, 4200, 3000, 900, 300, 140, 390),
            metric('2026-04-06', 5000, 1800, 1800, 0, 0, 60, 80),
            metric('2026-04-13', 8000, 2700, 1800, 900, 0, 80, 160),
            metric('2026-04-20', 0, 0, 0, 0, 0, 0),
            metric('2026-04-27', 12000, 3600, 1800, 900, 900, 150, 300),
          ]),
        );
      }
      if (url.includes('/analytics/recent-weeks?weeks=4')) {
        return Promise.resolve(
          jsonResponse([
            metric('2026-04-06', 5000, 1800, 1800, 0, 0, 60, 80),
            metric('2026-04-13', 8000, 2700, 1800, 900, 0, 80, 160),
            metric('2026-04-20', 0, 0, 0, 0, 0, 0),
            metric('2026-04-27', 12000, 3600, 1800, 900, 900, 150, 300),
          ]),
        );
      }
      if (url.includes('/analytics/aerobic-trend')) {
        return Promise.resolve(
          jsonResponse([
            easyPoint('2026-04-06', 360, 142, 8),
            easyPoint('2026-04-13', 352, 140, 10),
            easyPoint('2026-04-27', 345, 138, 6),
          ]),
        );
      }
      if (url.includes('/analytics/trend-metrics?weeks=13')) {
        return Promise.resolve(
          jsonResponse([
            trendMetric('2026-04-13', 8000, 2700, [900, 600, 900, 300, 0]),
            trendMetric('2026-04-20', 0, 0, [0, 0, 0, 0, 0]),
            trendMetric('2026-04-27', 12000, 3600, [1200, 900, 600, 600, 300]),
          ]),
        );
      }
      if (url.includes('/analytics/prs')) {
        return Promise.resolve(
          jsonResponse({
            five_k_activity: activity('Fast 5K', 5000, 1500),
            ten_k_activity: activity('Fast 10K', 10000, 3200),
            half_marathon: null,
            marathon: null,
          }),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal(
      'fetch',
      fetchMock,
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <TrendsPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Last 4 weeks/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/analytics/recent-weeks?weeks=13'), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/analytics/trend-metrics?weeks=13'), expect.any(Object));
    expect(await screen.findByRole('heading', { name: /Weekly load/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Elevation trend/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /Training signals/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /HR zones over time/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Easy pace/i })).toBeInTheDocument();
    expect(screen.getByText(/Long run share/i)).toBeInTheDocument();
    expect(screen.getByText(/Run days/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Gain per km/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Monotony/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pace by HR zone/i })).toBeInTheDocument();
    expect(screen.getByText(/Latest active week: 4\/27\/2026/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Plan vs reality/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Coach effect/i })).toBeInTheDocument();
    expect(screen.getByText(/Week intent/i)).toBeInTheDocument();
    expect(screen.getByText(/Aerobic base/i)).toBeInTheDocument();
    expect(screen.getByText(/Stimulus delivered/i)).toBeInTheDocument();
    expect(screen.getByText(/Body response/i)).toBeInTheDocument();
    expect(screen.getByText(/Easy pace is improving/i)).toBeInTheDocument();
    expect(screen.getByText(/Keep the current structure/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Distance \(km\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Time \(h\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Gain \(m\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Gain per km/i).length).toBeGreaterThan(1);
    expect(screen.getByText(/4-week baseline/i)).toBeInTheDocument();
    expect(await screen.findByText(/Week of 4\/27\/2026/i)).toBeInTheDocument();
    expect(screen.getAllByText(/12\.0 km/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1h 0m/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/30m 00s/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/15m 00s/i).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/50\.0 %/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/25\.0 %/i).length).toBeGreaterThan(1);
    expect(screen.getByText(/High increase/i)).toBeInTheDocument();
    expect(screen.getByText(/Mostly easy/i)).toBeInTheDocument();
    expect(screen.getByText(/Unknown intensity/i)).toBeInTheDocument();
    expect(screen.getByText(/Durability/i)).toBeInTheDocument();
    expect(screen.getByText(/Longest run \(km\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Long-run share/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Pace/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Heart rate/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Personal records/i)).toBeInTheDocument();
    expect(screen.getAllByText(/5K/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Fast 5K/i)).toBeInTheDocument();
    expect(screen.getByText(/Half marathon/i)).toBeInTheDocument();
  });

  test('does not show full historical weekly data while recent trend data is loading', async () => {
    let resolveTrendWeeks: (metrics: ReturnType<typeof metric>[]) => void = () => undefined;
    const trendWeeksPromise = new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
      resolveTrendWeeks = (metrics) => resolve(jsonResponse(metrics));
    });
    const historicalWeekly = Array.from({ length: 20 }, (_, index) =>
      metric(`2026-01-${String(index + 1).padStart(2, '0')}`, 4000 + index, 1800, 1800, 0, 0, 40 + index),
    );
    const recentTrendWeeks = Array.from({ length: 13 }, (_, index) =>
      metric(`2026-04-${String(index + 1).padStart(2, '0')}`, 5000 + index, 2100, 2100, 0, 0, 60 + index),
    );
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/analytics/recent-weeks?weeks=13')) {
        return trendWeeksPromise;
      }
      if (url.includes('/analytics/weekly')) {
        return Promise.resolve(jsonResponse(historicalWeekly));
      }
      if (url.includes('/analytics/recent-weeks?weeks=4')) {
        return Promise.resolve(jsonResponse(recentTrendWeeks.slice(-4)));
      }
      if (url.includes('/analytics/prs')) {
        return Promise.resolve(
          jsonResponse({
            five_k_activity: null,
            ten_k_activity: null,
            half_marathon: null,
            marathon: null,
          }),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <TrendsPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/analytics/recent-weeks?weeks=4'), expect.any(Object)));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/analytics/weekly'))).toBe(false);
    expect(screen.queryByText(/20 weeks shown/i)).not.toBeInTheDocument();

    resolveTrendWeeks(recentTrendWeeks);
    expect(await screen.findByText(/13 weeks shown/i)).toBeInTheDocument();
  });
});

function activity(name: string, distanceM: number, movingTimeS: number) {
  return {
    id: name,
    name,
    sport_type: 'Run',
    start_time_utc: '2026-04-27T06:00:00Z',
    distance_m: distanceM,
    moving_time_s: movingTimeS,
    computed_load: 100,
    intensity_class: 'hard',
  };
}

function metric(
  weekStartDate: string,
  distanceM: number,
  movingTimeS: number,
  easyTimeS: number,
  moderateTimeS: number,
  hardTimeS: number,
  load = 0,
  elevationGainM = 0,
) {
  return {
    week_start_date: weekStartDate,
    distance_m: distanceM,
    moving_time_s: movingTimeS,
    elevation_gain_m: elevationGainM,
    run_count: movingTimeS > 0 ? 1 : 0,
    load,
    acute_load: load,
    chronic_load: load * 4,
    ramp_ratio: weekStartDate === '2026-04-27' ? 1.6 : null,
    easy_time_s: easyTimeS,
    moderate_time_s: moderateTimeS,
    hard_time_s: hardTimeS,
    unknown_time_s: weekStartDate === '2026-04-20' ? 1200 : 0,
    long_run_distance_m: distanceM,
  };
}

function easyPoint(date: string, paceSPerKm: number, averageHr: number, elevationGainPerKm: number) {
  return {
    date,
    pace_s_per_km: paceSPerKm,
    average_hr: averageHr,
    elevation_gain_per_km: elevationGainPerKm,
  };
}

function trendMetric(weekStartDate: string, distanceM: number, movingTimeS: number, zoneSeconds: number[]) {
  return {
    week_start_date: weekStartDate,
    distance_m: distanceM,
    moving_time_s: movingTimeS,
    elevation_gain_m: distanceM > 0 ? 180 : 0,
    run_count: movingTimeS > 0 ? 3 : 0,
    load: movingTimeS > 0 ? 160 : 0,
    zone_seconds: zoneSeconds,
    easy_pace_s_per_km: movingTimeS > 0 ? 330 : null,
    long_run_share: movingTimeS > 0 ? 45 : 0,
    run_day_count: movingTimeS > 0 ? 3 : 0,
    elevation_gain_per_km: distanceM > 0 ? 15 : 0,
    zone_paces_s_per_km: [360, 345, 330, 315, null],
    planned_distance_m: movingTimeS > 0 ? 14000 : 0,
    completed_distance_m: distanceM,
    planned_time_s: movingTimeS > 0 ? 4200 : 0,
    completed_time_s: movingTimeS,
    planned_load: movingTimeS > 0 ? 180 : 0,
    completed_load: movingTimeS > 0 ? 160 : 0,
    distance_adherence: movingTimeS > 0 ? 85.7 : null,
    time_adherence: movingTimeS > 0 ? 85.7 : null,
    load_adherence: movingTimeS > 0 ? 88.9 : null,
    monotony: movingTimeS > 0 ? 0.72 : null,
    coach_intent: movingTimeS > 0 ? 'base' : 'unplanned',
    coach_stimulus: movingTimeS > 0 ? 'on_target' : 'no_plan',
    coach_response: movingTimeS > 0 ? 'positive' : 'no_signal',
    coach_recommendation: movingTimeS > 0 ? 'keep_plan' : 'collect_more_data',
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
  };
}
