import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { LanguageProvider } from '../lib/i18n';
import { coordinateForProgress } from '../components/maps/ActivityMap';
import { ActivityDetailPage, buildChartSeries, chartValueDomain } from './ActivityDetailPage';

describe('ActivityDetailPage', () => {
  test('renders a route map when latlng stream data exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/activities/activity-1/streams')) {
          return Promise.resolve(
            jsonResponse([
              {
                stream_type: 'latlng',
                data: [
                  [50.087, 14.421],
                  [50.088, 14.422],
                  [50.089, 14.423],
                ],
                sample_count: 3,
              },
            ]),
          );
        }
        return Promise.resolve(jsonResponse(activityResponse()));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <MemoryRouter initialEntries={['/activities/activity-1']}>
            <Routes>
              <Route path="/activities/:activityId" element={<ActivityDetailPage />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('activity-map')).toHaveTextContent('3 GPS points');
    expect(screen.queryByText(/No GPS track/i)).not.toBeInTheDocument();
  });

  test('shows an empty map state without route coordinates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/activities/activity-1/streams')) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(jsonResponse(activityResponse()));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <MemoryRouter initialEntries={['/activities/activity-1']}>
            <Routes>
              <Route path="/activities/:activityId" element={<ActivityDetailPage />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/No GPS track/i)).toBeInTheDocument();
  });

  test('renders separate pace heart-rate and elevation charts with units', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/activities/activity-1/streams')) {
          return Promise.resolve(
            jsonResponse([
              { stream_type: 'distance', data: [0, 1000, 2000], sample_count: 3 },
              { stream_type: 'time', data: [0, 330, 660], sample_count: 3 },
              { stream_type: 'heartrate', data: [130, 140, 145], sample_count: 3 },
              { stream_type: 'altitude', data: [250, 260, 255], sample_count: 3 },
            ]),
          );
        }
        return Promise.resolve(jsonResponse(activityResponse()));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <MemoryRouter initialEntries={['/activities/activity-1']}>
            <Routes>
              <Route path="/activities/:activityId" element={<ActivityDetailPage />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Pace \(min\/km\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Avg HR \(bpm\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Elevation \(m\)/i)).toBeInTheDocument();
  });

  test('builds chart points with progress for map highlighting', () => {
    const chartData = buildChartSeries([
      { stream_type: 'distance', data: [0, 500, 1000], sample_count: 3 },
      { stream_type: 'time', data: [0, 150, 300], sample_count: 3 },
      { stream_type: 'heartrate', data: [130, 135, 140], sample_count: 3 },
      { stream_type: 'altitude', data: [250, 252, 254], sample_count: 3 },
    ]);

    expect(chartData.pace[0]).toMatchObject({ index: 1, progress: 0.5 });
    expect(chartData.heartrate[2]).toMatchObject({ index: 2, progress: 1 });
    expect(chartData.elevation[1]).toMatchObject({ index: 1, progress: 0.5 });
  });

  test('prefers smoothed velocity for pace chart readability', () => {
    const chartData = buildChartSeries([
      { stream_type: 'distance', data: [0, 1000, 5000], sample_count: 3 },
      { stream_type: 'time', data: [0, 300, 301], sample_count: 3 },
      { stream_type: 'velocity_smooth', data: [2.5, 2.5, 2.5], sample_count: 3 },
    ]);

    expect(chartData.pace.map((point) => Number(point.value.toFixed(2)))).toEqual([6.67, 6.67, 6.67]);
    expect(chartData.pace[2]).toMatchObject({ index: 2, progress: 1 });
  });

  test('removes non-moving samples and implausible pace spikes from the pace chart', () => {
    const chartData = buildChartSeries([
      { stream_type: 'distance', data: [0, 100, 200, 300, 400, 500, 600], sample_count: 7 },
      { stream_type: 'velocity_smooth', data: [2.5, 2.4, 0.02, 2.5, 20, 2.6, 2.4], sample_count: 7 },
      { stream_type: 'moving', data: [true, true, true, false, true, true, true], sample_count: 7 },
    ]);

    expect(chartData.pace.map((point) => point.index)).toEqual([0, 1, 5, 6]);
    expect(chartData.pace.every((point) => point.value > 2 && point.value < 30)).toBe(true);
  });

  test('smooths and downsamples dense pace streams for chart readability', () => {
    const velocity = Array.from({ length: 1000 }, (_, index) => (index === 500 ? 1.2 : 2.5));
    const chartData = buildChartSeries([
      { stream_type: 'distance', data: velocity.map((_, index) => index * 2.5), sample_count: velocity.length },
      { stream_type: 'velocity_smooth', data: velocity, sample_count: velocity.length },
      { stream_type: 'moving', data: velocity.map(() => true), sample_count: velocity.length },
    ]);

    expect(chartData.pace.length).toBeLessThanOrEqual(320);
    expect(Math.max(...chartData.pace.map((point) => point.value))).toBeLessThan(8);
  });

  test('uses chart domains that avoid a zero baseline and pace outlier flattening', () => {
    const paceDomain = chartValueDomain(
      [
        { index: 0, progress: 0, value: 5 },
        { index: 1, progress: 0.5, value: 5.2 },
        { index: 2, progress: 1, value: 28 },
      ],
      { minSpan: 1, clipOutliers: true },
    );
    const heartRateDomain = chartValueDomain(
      [
        { index: 0, progress: 0, value: 138 },
        { index: 1, progress: 0.5, value: 140 },
        { index: 2, progress: 1, value: 141 },
      ],
      { minSpan: 8 },
    );

    expect(paceDomain[0]).toBeGreaterThan(0);
    expect(paceDomain[1]).toBeLessThan(28);
    expect(heartRateDomain).toEqual([135.5, 143.5]);
  });

  test('maps chart hover progress to the nearest route coordinate', () => {
    expect(
      coordinateForProgress(
        [
          [50.087, 14.421],
          [50.088, 14.422],
          [50.089, 14.423],
        ],
        0.5,
      ),
    ).toEqual([50.088, 14.422]);
  });

  test('renders calculated splits with pace heart-rate and elevation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/activities/activity-1/splits')) {
          return Promise.resolve(
            jsonResponse({
              source: 'streams',
              splits: [
                {
                  split_index: 1,
                  distance_m: 1000,
                  duration_s: 330,
                  pace_s_per_km: 330,
                  average_hr: 140,
                  elevation_gain_m: 10,
                },
              ],
            }),
          );
        }
        if (url.includes('/activities/activity-1/streams')) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(jsonResponse(activityResponse()));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <MemoryRouter initialEntries={['/activities/activity-1']}>
            <Routes>
              <Route path="/activities/:activityId" element={<ActivityDetailPage />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText(/Splits/i)).length).toBeGreaterThan(0);
    expect(screen.getByText('5:30/km')).toBeInTheDocument();
    expect(screen.getByText(/140 bpm/i)).toBeInTheDocument();
    expect(screen.getByText(/10 m/i)).toBeInTheDocument();
  });

  test('renders heart-rate zone breakdown for an activity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/activities/activity-1/streams')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('/activities/activity-1/splits')) {
          return Promise.resolve(jsonResponse({ source: 'activity_summary', splits: [] }));
        }
        return Promise.resolve(
          jsonResponse({
            ...activityResponse(),
            heart_rate_zone_breakdown: [
              { zone_index: 0, name: 'Z1', min_hr: 90, max_hr: 120, seconds: 300, sample_count: 5, percentage: 50 },
              { zone_index: 1, name: 'Z2', min_hr: 121, max_hr: 140, seconds: 180, sample_count: 3, percentage: 30 },
              { zone_index: 2, name: 'Z3', min_hr: 141, max_hr: 160, seconds: 120, sample_count: 2, percentage: 20 },
              { zone_index: 3, name: 'Z4', min_hr: 161, max_hr: 180, seconds: 0, sample_count: 0, percentage: 0 },
              { zone_index: 4, name: 'Z5', min_hr: 181, max_hr: 205, seconds: 0, sample_count: 0, percentage: 0 },
            ],
          }),
        );
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <MemoryRouter initialEntries={['/activities/activity-1']}>
            <Routes>
              <Route path="/activities/:activityId" element={<ActivityDetailPage />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: /Heart-rate zones/i })).toBeInTheDocument();
    expect(screen.getByText(/Z1 90-120 bpm/i)).toBeInTheDocument();
    expect(screen.getByText(/5m 00s/i)).toBeInTheDocument();
    expect(screen.getByText(/50\.0 %/i)).toBeInTheDocument();
  });

  test('shows trail effort context when elevation is meaningful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/activities/activity-1/streams')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('/activities/activity-1/splits')) {
          return Promise.resolve(jsonResponse({ source: 'activity_summary', splits: [] }));
        }
        return Promise.resolve(jsonResponse({ ...activityResponse(), distance_m: 10000, elevation_gain_m: 450, computed_load: 100 }));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <MemoryRouter initialEntries={['/activities/activity-1']}>
            <Routes>
              <Route path="/activities/:activityId" element={<ActivityDetailPage />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Elevation adjusted effort/i)).toBeInTheDocument();
    expect(screen.getAllByText(/45 m\/km/i).length).toBeGreaterThan(0);
  });

  test('saves only edited note text without clearing wellness fields', async () => {
    const savedBodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/activities/activity-1/streams')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('/activities/activity-1/notes')) {
          savedBodies.push(JSON.parse(String(init?.body)));
          return Promise.resolve(
            jsonResponse({
              rpe: 7,
              fatigue: 4,
              soreness: 3,
              pain_flag: true,
              pain_location: 'left calf',
              sleep_quality: 2,
              notes: 'Updated note',
            }),
          );
        }
        return Promise.resolve(jsonResponse(activityResponse()));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <MemoryRouter initialEntries={['/activities/activity-1']}>
            <Routes>
              <Route path="/activities/:activityId" element={<ActivityDetailPage />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const textarea = await screen.findByPlaceholderText(/How did this run feel/i);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Updated note');
    await userEvent.click(screen.getByRole('button', { name: /Save notes/i }));

    await waitFor(() => expect(savedBodies).toHaveLength(1));
    expect(savedBodies[0]).toEqual({ notes: 'Updated note' });
  });

  test('focuses notes editor from notification action link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/activities/activity-1/streams')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('/activities/activity-1/splits')) {
          return Promise.resolve(jsonResponse({ source: 'activity_summary', splits: [] }));
        }
        return Promise.resolve(jsonResponse(activityResponse()));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <MemoryRouter initialEntries={['/activities/activity-1?focus=notes']}>
            <Routes>
              <Route path="/activities/:activityId" element={<ActivityDetailPage />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const textarea = await screen.findByPlaceholderText(/How did this run feel/i);
    await waitFor(() => expect(textarea).toHaveFocus());
  });
});

function activityResponse() {
  return {
    id: 'activity-1',
    provider: 'strava',
    provider_activity_id: '123',
    sport_type: 'Run',
    workout_type: null,
    name: 'Morning run',
    description: null,
    start_time_utc: '2026-04-27T06:00:00Z',
    start_time_local: null,
    timezone: null,
    distance_m: 5000,
    moving_time_s: 1800,
    elapsed_time_s: 1900,
    elevation_gain_m: 40,
    average_speed_mps: null,
    max_speed_mps: null,
    average_hr: 145,
    max_hr: 170,
    average_cadence: null,
    calories: null,
    perceived_effort: null,
    computed_load: 55,
    load_source: 'hr_based',
    intensity_class: 'easy',
    heart_rate_zone_breakdown: [],
    map_polyline: null,
    gear: [],
    note: {
      rpe: 7,
      fatigue: 4,
      soreness: 3,
      pain_flag: true,
      pain_location: 'left calf',
      sleep_quality: 2,
      notes: 'Original note',
    },
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
