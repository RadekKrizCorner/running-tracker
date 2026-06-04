import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { LanguageProvider } from '../lib/i18n';
import { EventsPage } from './EventsPage';

describe('EventsPage', () => {
  test('renders event countdown without removed preparation metrics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse([
            {
              ...eventFixture,
              name: 'Spring 10K',
              days_until_start: 33,
              website_url: 'https://example.test/race',
              course_map_url: 'https://example.test/course-map',
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
            },
          ]),
        ),
      ),
    );

    renderEventsPage();

    expect(await screen.findByText('Spring 10K')).toBeInTheDocument();
    expect(screen.getByText(/33 days/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Website$/i })).toHaveAttribute('href', 'https://example.test/race');
    expect(screen.getByTitle('Spring 10K course map preview')).toHaveAttribute('src', 'https://example.test/course-map');
    expect(screen.getAllByText(/6\/1\/2026/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4\.7 weeks/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Long run covers 140%/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Phase$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Build$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^4w distance$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Longest 8w$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Planned distance$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Planned to race$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Missed$/i)).not.toBeInTheDocument();
    expect(screen.queryByText('22.0 km')).not.toBeInTheDocument();
    expect(screen.queryByText('14.0 km')).not.toBeInTheDocument();
    expect(screen.queryByText('15.0 km')).not.toBeInTheDocument();
    expect(screen.queryByText(/Privacy-safe prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Spring 10K poster/i)).not.toBeInTheDocument();
  });

  test('creates a new event from the header wizard', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/events') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(eventFixture));
      }
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEventsPage();

    expect(screen.queryByRole('heading', { name: /^Add event$/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Add event/i }));
    const dialog = screen.getByRole('dialog', { name: /Create event/i });
    await userEvent.type(within(dialog).getByLabelText('Event name'), 'Spring 10K');
    await userEvent.type(within(dialog).getByLabelText('Event date'), '2026-06-01');
    await userEvent.type(within(dialog).getByLabelText('Location'), 'Prague');
    await userEvent.selectOptions(within(dialog).getByLabelText('Event type'), '10k');
    await userEvent.click(within(dialog).getByRole('button', { name: /Next/i }));
    await userEvent.type(await within(dialog).findByLabelText('Distance km'), '10');
    await userEvent.type(within(dialog).getByLabelText('Target time'), '00:50:00');
    await userEvent.click(within(dialog).getByRole('button', { name: /Create event/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/events'),
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });
    const postCall = fetchMock.mock.calls.find(([url, init]) => String(url).includes('/events') && init?.method === 'POST');
    expect(JSON.parse(String(postCall?.[1]?.body)).target_time_s).toBe(3000);
  });
});

const eventFixture = {
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
  website_url: null,
  course_map_url: null,
  course_gpx: null,
  poster_image_data: null,
  goal_notes: null,
  course_notes: null,
  fueling_notes: null,
  gear_notes: null,
  travel_notes: null,
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

function renderEventsPage() {
  const queryClient = new QueryClient();
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <EventsPage />
        </LanguageProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
  };
}
