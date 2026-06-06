import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../lib/i18n';
import { RouteExplorerPage } from './RouteExplorerPage';

describe('RouteExplorerPage', () => {
  test('renders previous owner GPS routes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((..._args: unknown[]) =>
        Promise.resolve(
          jsonResponse([
            {
              id: 'activity-1',
              name: 'Morning loop',
              start_time_utc: '2026-06-01T06:00:00Z',
              distance_m: 8400,
              moving_time_s: 2800,
              map_polyline: 'encoded-route',
            },
          ]),
        ),
      ),
    );

    renderRouteExplorer();

    expect(await screen.findByText(/Previous GPS routes/i)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Morning loop/i })).toHaveAttribute('href', '/activities/activity-1');
    expect(screen.getByText(/8.40 km/i)).toBeInTheDocument();
  });

  test('submits preferences and renders unavailable routing guidance', async () => {
    const fetchMock = vi.fn((..._args: unknown[]) =>
      Promise.resolve(
        jsonResponse({
          status: 'unavailable',
          detail: 'Route suggestions are disabled. Configure local Valhalla to enable this feature.',
          candidates: [],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderRouteExplorer();

    await user.clear(screen.getByLabelText(/Target distance/i));
    await user.type(screen.getByLabelText(/Target distance/i), '10000');
    await user.selectOptions(screen.getByLabelText(/Hill preference/i), 'flat');
    await user.selectOptions(screen.getByLabelText(/Surface preference/i), 'trail');
    await user.clear(screen.getByLabelText(/Candidates/i));
    await user.type(screen.getByLabelText(/Candidates/i), '2');
    await user.click(screen.getByRole('button', { name: /Generate loops/i }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/routes/suggest-loop'))).toBe(true),
    );
    const [url, request] = fetchMock.mock.calls.find(([callUrl]) => String(callUrl).includes('/routes/suggest-loop')) as [
      unknown,
      RequestInit,
    ];
    expect(String(url)).toContain('/routes/suggest-loop');
    expect(request).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(request.body))).toMatchObject({
      start_lat: 50.0755,
      start_lng: 14.4378,
      target_distance_m: 10000,
      hill_preference: 'flat',
      surface_preference: 'trail',
      candidate_count: 2,
    });
    expect(await screen.findByText(/Configure local Valhalla/i)).toBeInTheDocument();
  });

  test('renders generated candidates and selected route map summary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            status: 'ok',
            detail: 'Route suggestions generated from local Valhalla.',
            candidates: [
              {
                id: 'valhalla-1',
                name: 'Loop 12.4 km',
                distance_m: 12400,
                duration_s: 3920,
                elevation_gain_m: 180,
                geometry: [
                  [50.0755, 14.4378],
                  [50.077, 14.441],
                  [50.0758, 14.4442],
                ],
                provider: 'valhalla',
                score: 1,
                warnings: [],
              },
              {
                id: 'valhalla-2',
                name: 'Park loop',
                distance_m: 11800,
                duration_s: 3700,
                elevation_gain_m: 95,
                geometry: [
                  [50.0755, 14.4378],
                  [50.076, 14.439],
                ],
                provider: 'valhalla',
                score: 0.9,
                warnings: ['Provider adjusted the target distance.'],
              },
            ],
          }),
        ),
      ),
    );
    const user = userEvent.setup();

    renderRouteExplorer();

    await user.click(screen.getByRole('button', { name: /Generate loops/i }));

    expect(await screen.findByText(/Generated/i)).toBeInTheDocument();
    expect(screen.queryByText(/^ok$/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/Loop 12.4 km/i)).toBeInTheDocument();
    expect(screen.getAllByText(/12.4 km/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1h 05m/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/180 m/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('route-candidate-map')).toBeInTheDocument();
    expect(screen.getByText(/3 route points/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Park loop/i }));

    expect(screen.getByText(/Provider adjusted the target distance/i)).toBeInTheDocument();
    expect(screen.getByText(/2 route points/i)).toBeInTheDocument();
  });
});

function renderRouteExplorer() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider initialLocale="en-US">
        <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <RouteExplorerPage />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
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
