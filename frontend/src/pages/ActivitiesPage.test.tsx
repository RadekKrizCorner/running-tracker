import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { addDaysToIso, toIsoDate } from '../lib/date';
import { LanguageProvider } from '../lib/i18n';
import { ActivitiesPage } from './ActivitiesPage';

describe('ActivitiesPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders elevation and requests metric sorting', async () => {
    const fetchMock = stubActivitiesFetch([activityResponse({ name: 'Hill run', elevation_gain_m: 123 })]);
    const user = userEvent.setup();

    renderActivitiesPage();

    expect((await screen.findAllByText(/Hill run/i)).length).toBeGreaterThan(0);
    expect(screen.getByText('123 m')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Sort by Distance/i }));

    await waitFor(() => {
      expect(lastFetchUrl(fetchMock)).toContain('sort=-distance');
    });
  });

  test('renders an integration-sourced mobile list without manual activity actions', async () => {
    stubActivitiesFetch([activityResponse({ name: 'Morning run', provider: 'strava' })]);

    renderActivitiesPage();

    await screen.findAllByText('Morning run');
    const mobileList = screen.getByTestId('activity-mobile-list');
    expect(mobileList).toHaveTextContent('Morning run');
    expect(mobileList).toHaveTextContent('5.00 km');
    expect(mobileList).toHaveTextContent('30m');
    expect(mobileList).toHaveTextContent(/Synced from Strava/i);
    expect(screen.queryByRole('button', { name: /start|log|add activity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /start|log|add activity/i })).not.toBeInTheDocument();
  });

  test('requests name searches from the activities API', async () => {
    const fetchMock = stubActivitiesFetch([activityResponse({ name: 'Morning hills' })]);
    const user = userEvent.setup();

    renderActivitiesPage();

    expect((await screen.findAllByText(/Morning hills/i)).length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText(/Search by name/i), 'hills');

    await waitFor(() => {
      expect(lastFetchUrl(fetchMock)).toContain('search=hills');
    });
  });

  test('requests quick and custom time filters from the activities API', async () => {
    const fetchMock = stubActivitiesFetch([activityResponse({ name: 'Range run' })]);
    const user = userEvent.setup();
    const today = toIsoDate(new Date());

    renderActivitiesPage();

    expect((await screen.findAllByText(/Range run/i)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Last 90 days/i }));

    await waitFor(() => {
      expect(lastFetchUrl(fetchMock)).toContain(`start_date=${addDaysToIso(today, -90)}`);
      expect(lastFetchUrl(fetchMock)).toContain(`end_date=${today}`);
    });

    await user.type(screen.getByLabelText(/^From$/i), '2026-01-01');
    await user.type(screen.getByLabelText(/^To$/i), '2026-01-31');

    await waitFor(() => {
      expect(lastFetchUrl(fetchMock)).toContain('start_date=2026-01-01');
      expect(lastFetchUrl(fetchMock)).toContain('end_date=2026-01-31');
    });
  });

  test('keeps custom date controls available in the mobile layout', () => {
    const styles = readFileSync('src/styles/layout.css', 'utf8');

    expect(styles).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.activity-custom-range\s*\{[\s\S]*?display:\s*grid;/,
    );
    expect(styles).not.toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.activity-custom-range\s*\{\s*display:\s*none;/,
    );
  });
});

function renderActivitiesPage() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider initialLocale="en-US">
        <MemoryRouter>
          <ActivitiesPage />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

function stubActivitiesFetch(activities: unknown[]) {
  const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(activities)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
  };
}

function activityResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'activity-1',
    provider: 'manual',
    provider_activity_id: 'activity-1',
    sport_type: 'Run',
    workout_type: null,
    name: 'Run',
    description: null,
    start_time_utc: '2026-04-27T06:00:00Z',
    start_time_local: null,
    timezone: 'Europe/Prague',
    distance_m: 5000,
    moving_time_s: 1800,
    elapsed_time_s: 1800,
    elevation_gain_m: 40,
    average_speed_mps: null,
    max_speed_mps: null,
    average_hr: 142,
    max_hr: null,
    average_cadence: null,
    calories: null,
    perceived_effort: null,
    computed_load: 55,
    load_source: 'duration_estimated',
    intensity_class: 'easy',
    elevation_gain_source: 'strava',
    heart_rate_zone_breakdown: [],
    map_polyline: null,
    gear: [],
    note: null,
    ...overrides,
  };
}

function lastFetchUrl(fetchMock: ReturnType<typeof vi.fn>) {
  return String(fetchMock.mock.calls.at(-1)?.[0] ?? '');
}
