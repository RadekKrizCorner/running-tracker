import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { LanguageProvider } from '../lib/i18n';
import { EventDetailPage } from './EventDetailPage';

describe('EventDetailPage', () => {
  test('renders event details and preparation summary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/events/event-1/readiness')) {
          return Promise.resolve(jsonResponse(readinessResponse()));
        }
        if (url.includes('/events/event-1/planning-guidance')) {
          return Promise.resolve(
            jsonResponse({
              event_id: 'event-1',
              phase: 'build',
              weeks_until_start: 4.7,
              suggested_weekly_distance_m: 24200,
              suggested_long_run_m: 9000,
              suggested_sessions: [
                {
                  workout_type: 'easy',
                  title: 'Easy aerobic run',
                  target_intensity: 'easy',
                  target_distance_m: 7000,
                  target_duration_s: null,
                  detail: 'Keep this conversational.',
                },
              ],
              messages: [{ tone: 'success', title: 'Long run is close', detail: 'Your recent long run is close.' }],
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            id: 'event-1',
            name: 'Spring 10K',
            event_date: '2026-06-01',
            location: 'Prague',
            event_type: '10k',
            distance_m: 10000,
            elevation_gain_m: 120,
            surface: 'road',
            priority: 'A',
            status: 'planned',
            target_time_s: 3000,
            website_url: 'https://example.test/race',
            course_map_url: null,
            course_gpx: null,
            poster_image_data: null,
            goal_notes: 'Run steady.',
            course_notes: 'Rolling first half.',
            fueling_notes: 'Light breakfast.',
            gear_notes: 'Race shoes.',
            travel_notes: 'Take metro.',
            days_until_start: 33,
            weeks_until_start: 4.7,
            target_pace_s_per_km: 300,
            preparation: {
              phase: 'build',
              current_4w_distance_m: 22000,
              current_4w_load: 280,
              longest_run_8w_m: 14000,
              long_run_event_distance_ratio: 1.4,
              planned_distance_to_event_m: 15000,
              planned_load_to_event: 200,
              planned_sessions_to_event: 1,
              completed_runs_since_created: 2,
              completed_distance_since_created_m: 22000,
              completed_load_since_created: 280,
              missed_planned_sessions: 1,
              easy_time_s: 3000,
              moderate_time_s: 5400,
              hard_time_s: 0,
            },
          }),
        );
      }),
    );
    const queryClient = new QueryClient();

    render(
      <MemoryRouter initialEntries={['/events/event-1']}>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider initialLocale="en-US">
            <Routes>
              <Route path="/events/:eventId" element={<EventDetailPage />} />
            </Routes>
          </LanguageProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Spring 10K')).toBeInTheDocument();
    expect(screen.getByText(/33 days/i)).toBeInTheDocument();
    expect(screen.getAllByText(/6\/1\/2026/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4\.7 weeks/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Long run covers 140%/i)).toBeInTheDocument();
    expect(await screen.findByText(/Planning guidance/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Event readiness dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/Easy aerobic run/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Long run is close/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Run steady/i)).toBeInTheDocument();
    expect(screen.getByText(/Race shoes/i)).toBeInTheDocument();
  });

  test('uploads a custom poster image without calling poster generation', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push([url, init]);
        if (url.includes('/events/event-1/readiness')) {
          return Promise.resolve(jsonResponse(readinessResponse()));
        }
        if (url.includes('/events/event-1/planning-guidance')) {
          return Promise.resolve(jsonResponse(emptyGuidance()));
        }
        if (url.includes('/events/event-1') && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body));
          return Promise.resolve(jsonResponse({ ...eventResponse(), ...body }));
        }
        return Promise.resolve(jsonResponse(eventResponse()));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <MemoryRouter initialEntries={['/events/event-1']}>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider initialLocale="en-US">
            <Routes>
              <Route path="/events/:eventId" element={<EventDetailPage />} />
            </Routes>
          </LanguageProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Spring 10K')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Edit event details/i }));
    await userEvent.upload(screen.getByLabelText(/Upload poster image/i), new File(['poster'], 'poster.png', { type: 'image/png' }));
    expect(await screen.findByAltText(/Spring 10K poster/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Save event details/i }));

    await waitFor(() => expect(calls.some(([url, init]) => url.includes('/events/event-1') && init?.method === 'PATCH')).toBe(true));
    const patch = calls.find(([url, init]) => url.includes('/events/event-1') && init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body)).poster_image_data).toMatch(/^data:image\/png;base64,/);
    expect(screen.queryByText(/Copy-ready poster prompt/i)).not.toBeInTheDocument();
    expect(calls.some(([url]) => url.includes('/events/event-1/poster'))).toBe(false);
  });

  test('accepts a poster image larger than the old two megabyte limit', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push([url, init]);
        if (url.includes('/events/event-1/readiness')) {
          return Promise.resolve(jsonResponse(readinessResponse()));
        }
        if (url.includes('/events/event-1/planning-guidance')) {
          return Promise.resolve(jsonResponse(emptyGuidance()));
        }
        if (url.includes('/events/event-1') && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body));
          return Promise.resolve(jsonResponse({ ...eventResponse(), ...body }));
        }
        return Promise.resolve(jsonResponse(eventResponse()));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <MemoryRouter initialEntries={['/events/event-1']}>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider initialLocale="en-US">
            <Routes>
              <Route path="/events/:eventId" element={<EventDetailPage />} />
            </Routes>
          </LanguageProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await screen.findByText('Spring 10K');
    await userEvent.click(screen.getByRole('button', { name: /Edit event details/i }));
    await userEvent.upload(
      screen.getByLabelText(/Upload poster image/i),
      new File([new Uint8Array(2_100_000)], 'larger-poster.png', { type: 'image/png' }),
    );

    expect(await screen.findByAltText(/Spring 10K poster/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Save event details/i }));

    await waitFor(() => expect(calls.some(([url, init]) => url.includes('/events/event-1') && init?.method === 'PATCH')).toBe(true));
    const patch = calls.find(([url, init]) => url.includes('/events/event-1') && init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body)).poster_image_data).toMatch(/^data:image\/png;base64,/);
  });

  test('edits preparation notes and renders GPX course map', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push([url, init]);
        if (url.includes('/events/event-1/readiness')) {
          return Promise.resolve(jsonResponse(readinessResponse()));
        }
        if (url.includes('/events/event-1/planning-guidance')) {
          return Promise.resolve(jsonResponse(emptyGuidance()));
        }
        if (url.includes('/events/event-1') && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body));
          return Promise.resolve(jsonResponse({ ...eventResponse(), ...body }));
        }
        return Promise.resolve(jsonResponse({ ...eventResponse(), event_type: 'half_marathon' }));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <MemoryRouter initialEntries={['/events/event-1']}>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider initialLocale="en-US">
            <Routes>
              <Route path="/events/:eventId" element={<EventDetailPage />} />
            </Routes>
          </LanguageProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Half marathon/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Edit event details/i }));
    expect(screen.queryByLabelText('GPX route data')).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Goal'));
    await userEvent.type(screen.getByLabelText('Goal'), 'Start controlled.');
    await userEvent.type(screen.getByLabelText('Mapy.com or course URL'), 'https://mapy.com/s/example');
    const gpxFile = new File(
      ['<gpx><trk><trkseg><trkpt lat="50.0" lon="14.0"></trkpt><trkpt lat="50.1" lon="14.1"></trkpt></trkseg></trk></gpx>'],
      'race-course.gpx',
      { type: 'application/gpx+xml' },
    );
    await userEvent.upload(screen.getByLabelText('Import GPX file'), gpxFile);
    await screen.findByText(/Loaded race-course\.gpx/i);
    await userEvent.click(screen.getByRole('button', { name: /Save event details/i }));

    await waitFor(() => expect(calls.some(([url, init]) => url.includes('/events/event-1') && init?.method === 'PATCH')).toBe(true));
    expect(await screen.findByText(/Saved event details/i)).toBeInTheDocument();
    expect(screen.getByTestId('event-course-map')).toBeInTheDocument();
    expect(screen.getByText(/2 GPX points/i)).toBeInTheDocument();
    const patch = calls.find(([url, init]) => url.includes('/events/event-1') && init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({
      goal_notes: 'Start controlled.',
      course_map_url: 'https://mapy.com/s/example',
    });
  });

  test('edits target time and target pace from event detail', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push([url, init]);
        if (url.includes('/events/event-1/readiness')) {
          return Promise.resolve(jsonResponse(readinessResponse()));
        }
        if (url.includes('/events/event-1/planning-guidance')) {
          return Promise.resolve(jsonResponse(emptyGuidance()));
        }
        if (url.includes('/events/event-1') && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body));
          return Promise.resolve(jsonResponse({ ...eventResponse(), ...body, target_pace_s_per_km: 285 }));
        }
        return Promise.resolve(jsonResponse(eventResponse()));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <MemoryRouter initialEntries={['/events/event-1']}>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider initialLocale="en-US">
            <Routes>
              <Route path="/events/:eventId" element={<EventDetailPage />} />
            </Routes>
          </LanguageProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await screen.findByText('Spring 10K');
    await userEvent.click(screen.getByRole('button', { name: /Edit event details/i }));
    await userEvent.clear(screen.getByLabelText('Target time'));
    await userEvent.type(screen.getByLabelText('Target time'), '00:48:00');
    expect(screen.getByLabelText('Target pace')).toHaveValue('4:48/km');
    await userEvent.clear(screen.getByLabelText('Target pace'));
    await userEvent.type(screen.getByLabelText('Target pace'), '4:45/km');
    expect(screen.getByLabelText('Target time')).toHaveValue('00:47:30');
    await userEvent.click(screen.getByRole('button', { name: /Save event details/i }));

    await waitFor(() => expect(calls.some(([url, init]) => url.includes('/events/event-1') && init?.method === 'PATCH')).toBe(true));
    const patch = calls.find(([url, init]) => url.includes('/events/event-1') && init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ target_time_s: 2850 });
  });
});

function eventResponse() {
  return {
    id: 'event-1',
    name: 'Spring 10K',
    event_date: '2026-06-01',
    location: 'Prague',
    event_type: '10k',
    distance_m: 10000,
    elevation_gain_m: 120,
    surface: 'road',
    priority: 'A',
    status: 'planned',
    target_time_s: 3000,
    website_url: 'https://example.test/race',
    course_map_url: null,
    course_gpx: null,
    poster_image_data: null,
    goal_notes: 'Run steady.',
    course_notes: 'Rolling first half.',
    fueling_notes: 'Light breakfast.',
    gear_notes: 'Race shoes.',
    travel_notes: 'Take metro.',
    days_until_start: 33,
    weeks_until_start: 4.7,
    target_pace_s_per_km: 300,
    preparation: {
      phase: 'build',
      current_4w_distance_m: 22000,
      current_4w_load: 280,
      longest_run_8w_m: 14000,
      long_run_event_distance_ratio: 1.4,
      planned_distance_to_event_m: 15000,
      planned_load_to_event: 200,
      planned_sessions_to_event: 1,
      completed_runs_since_created: 2,
      completed_distance_since_created_m: 22000,
      completed_load_since_created: 280,
      missed_planned_sessions: 1,
      easy_time_s: 3000,
      moderate_time_s: 5400,
      hard_time_s: 0,
    },
  };
}

function emptyGuidance() {
  return {
    event_id: 'event-1',
    phase: 'build',
    weeks_until_start: 4.7,
    suggested_weekly_distance_m: 0,
    suggested_long_run_m: null,
    suggested_sessions: [],
    messages: [],
  };
}

function readinessResponse() {
  return {
    event_id: 'event-1',
    phase: 'build',
    days_until_start: 33,
    target_pace_s_per_km: 300,
    recent_4w_distance_m: 22000,
    recent_4w_load: 280,
    recent_4w_run_count: 2,
    longest_run_8w_m: 14000,
    long_run_event_distance_ratio: 1.4,
    planned_distance_to_event_m: 15000,
    planned_load_to_event: 200,
    planned_sessions_to_event: 1,
    missed_planned_sessions: 1,
    intensity_mix: {
      easy_time_s: 3000,
      moderate_time_s: 5400,
      hard_time_s: 0,
      unknown_time_s: 0,
    },
    readiness_items: [
      {
        key: 'long_run',
        label: 'Long run',
        value: '140%',
        detail: 'Longest run in the last 8 weeks compared with event distance.',
        status: 'good',
      },
    ],
    guidance_messages: [{ tone: 'success', title: 'Long run is close', detail: 'Your recent long run is close.' }],
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
