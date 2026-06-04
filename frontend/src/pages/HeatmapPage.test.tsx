import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { LanguageProvider } from '../lib/i18n';
import { HeatmapPage } from './HeatmapPage';

describe('HeatmapPage', () => {
  test('renders run heatmap summary when GPS data exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            points: [
              { lat: 50.0, lng: 14.0, weight: 3, activity_count: 2 },
              { lat: 50.1, lng: 14.1, weight: 1, activity_count: 1 },
            ],
            bounds: { south: 50.0, west: 14.0, north: 50.1, east: 14.1 },
            activity_count: 2,
            point_count: 4,
          }),
        ),
      ),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <HeatmapPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Run heatmap/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2 runs with GPS/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/4 GPS samples/i)).toBeInTheDocument();
    expect(screen.getByTestId('run-heatmap')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Last 2 years/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All time/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('refetches the heatmap for a quick time range', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          points: [{ lat: 50.0, lng: 14.0, weight: 1, activity_count: 1 }],
          bounds: { south: 50.0, west: 14.0, north: 50.0, east: 14.0 },
          activity_count: 1,
          point_count: 1,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <HeatmapPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Run heatmap/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Last 6 months/i }));

    expect(await screen.findByText(/Showing/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining(`/analytics/heatmap?start_date=${monthsAgoIso(6)}&end_date=${todayLocalIso()}`),
      expect.any(Object),
    );
  });

  test('refetches the heatmap for a custom time range', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          points: [{ lat: 50.0, lng: 14.0, weight: 1, activity_count: 1 }],
          bounds: { south: 50.0, west: 14.0, north: 50.0, east: 14.0 },
          activity_count: 1,
          point_count: 1,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <HeatmapPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Run heatmap/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/From/i), '2025-01-01');
    await user.type(screen.getByLabelText(/To/i), '2025-12-31');

    expect(await screen.findByText(/Showing 1\/1\/2025 to 12\/31\/2025/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/analytics/heatmap?start_date=2025-01-01&end_date=2025-12-31'),
      expect.any(Object),
    );
  });

  test('renders empty state when there are no route streams', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            points: [],
            bounds: null,
            activity_count: 0,
            point_count: 0,
          }),
        ),
      ),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <HeatmapPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/No GPS heatmap yet/i)).toBeInTheDocument();
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
  };
}

function todayLocalIso() {
  const today = new Date();
  return toIsoDate(today);
}

function monthsAgoIso(months: number) {
  const today = new Date();
  const targetYear = today.getFullYear();
  const targetMonth = today.getMonth() - months;
  const targetMonthLastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(today.getDate(), targetMonthLastDay);
  return toIsoDate(new Date(targetYear, targetMonth, targetDay));
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
