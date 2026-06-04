import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { toIsoDate } from '../lib/date';
import { LanguageProvider } from '../lib/i18n';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/settings');
  });

  test('shows successful Strava browser authorization result', async () => {
    window.history.pushState({}, '', '/settings/connections?strava=connected');
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/connections/strava/status')) {
          return Promise.resolve(
            jsonResponse({
              connected: true,
              status: 'connected',
              provider_user_id: '1',
              scopes_granted: ['read', 'activity:read_all'],
              missing_scopes: [],
              access_token_expires_at: null,
              last_sync_at: null,
              last_error: null,
              active_job_id: null,
            }),
          );
        }
        if (url.includes('/profile/hr-zones')) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(jsonResponse({}));
      }),
    );

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText(/Strava autorizace proběhla úspěšně/i)).toBeInTheDocument();
  });

  test('forces Strava approval when required scopes are missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/connections/strava/status')) {
          return Promise.resolve(
            jsonResponse({
              connected: true,
              status: 'connected',
              provider_user_id: '1',
              scopes_granted: ['read'],
              missing_scopes: ['activity:read_all'],
              access_token_expires_at: null,
              last_sync_at: null,
              last_error: null,
              active_job_id: null,
            }),
          );
        }
        if (url.includes('/profile/hr-zones')) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(jsonResponse({}));
      }),
    );

    renderWithClient(<SettingsPage />);

    const reconnect = await screen.findByRole('link', { name: /Znovu autorizovat Stravu/i });
    expect(reconnect).toHaveAttribute('href', 'http://localhost:8009/api/v1/connections/strava/start?force=true');
  });

  test('refreshes the today sidebar card after a Settings Strava sync finishes', async () => {
    const today = toIsoDate(new Date());
    let jobFinished = false;
    let calendarCalls = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/calendar')) {
        calendarCalls += 1;
        return Promise.resolve(
          jsonResponse({
            plan: null,
            planned_workouts: [
              {
                id: 'planned-1',
                plan_id: null,
                scheduled_date: today,
                workout_type: 'easy',
                title: 'Lehký běh',
                target_duration_s: 2400,
                target_distance_m: 7000,
                target_intensity: 'easy',
                instructions: null,
                completed_activity_id: null,
                status: 'planned',
              },
            ],
            activities: jobFinished
              ? [{ id: 'activity-1', name: 'Dnešní běh ze Stravy', date: today, distance_m: 7100, moving_time_s: 2500, intensity_class: 'easy' }]
              : [],
            events: [],
          }),
        );
      }
      if (url.includes('/connections/strava/sync/job-1')) {
        jobFinished = true;
        return Promise.resolve(
          jsonResponse({
            job_id: 'job-1',
            status: 'finished',
            detail: 'Strava sync finished',
            result: { imported: 1 },
            error: null,
            progress: null,
          }),
        );
      }
      if (url.includes('/connections/strava/sync') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ status: 'queued', detail: 'Strava sync queued', job_id: 'job-1' }));
      }
      if (url.includes('/connections/strava/status')) {
        return Promise.resolve(
          jsonResponse({
            connected: true,
            status: 'connected',
            provider_user_id: '1',
            scopes_granted: ['read', 'activity:read_all'],
            missing_scopes: [],
            access_token_expires_at: null,
            last_sync_at: null,
            last_error: null,
            active_job_id: null,
          }),
        );
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(preferencesFixture()));
      }
      if (url.includes('/profile/hr-zones')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/notifications/summary')) {
        return Promise.resolve(jsonResponse({ unread_count: 0 }));
      }
      if (url.includes('/notifications')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithShell(<SettingsPage />);

    expect(await screen.findByText(/Lehký běh 7 km/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Synchronizovat poslední/i }));

    expect(await screen.findByText(/Dobrá práce, dneska hotovo/i)).toBeInTheDocument();
    expect(screen.getByText(/Dnešní běh ze Stravy · 7\.10 km/i)).toBeInTheDocument();
    await waitFor(() => expect(calendarCalls).toBeGreaterThan(1));
  });

  test('saves application language from settings', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/profile/preferences') && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toMatchObject({ locale: 'en-US' });
        return Promise.resolve(
          jsonResponse({
            locale: 'en-US',
            dashboard_mode: 'advanced',
            favorite_template_ids: [],
            recent_template_ids: [],
            pace_zones: [],
            elevation_correction_enabled: false,
            elevation_correction_mode: 'only_when_zero',
            elevation_provider_url: null,
          }),
        );
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(
          jsonResponse({
            locale: 'cs-CZ',
            dashboard_mode: 'advanced',
            favorite_template_ids: [],
            recent_template_ids: [],
            pace_zones: [],
            elevation_correction_enabled: false,
            elevation_correction_mode: 'only_when_zero',
            elevation_provider_url: null,
          }),
        );
      }
      if (url.includes('/connections/strava/status')) {
        return Promise.resolve(jsonResponse({ connected: false, status: 'disconnected', scopes_granted: [], missing_scopes: [], last_sync_at: null, last_error: null, active_job_id: null }));
      }
      if (url.includes('/profile/hr-zones')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByRole('heading', { name: /Nastavení/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Angličtina/i }));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/profile/preferences'), expect.objectContaining({ method: 'PATCH' }));
    expect(await screen.findByRole('heading', { name: /Settings/i })).toBeInTheDocument();
  });

  test('saves heart-rate zones from profile settings', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/connections/strava/status')) {
        return Promise.resolve(
          jsonResponse({
            connected: false,
            status: 'disconnected',
            provider_user_id: null,
            scopes_granted: [],
            missing_scopes: ['read', 'activity:read_all'],
            access_token_expires_at: null,
            last_sync_at: null,
            last_error: null,
          }),
        );
      }
      if (url.includes('/profile/hr-zones') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            id: 'zones-1',
            name: 'Current zones',
            effective_from: '2026-01-01',
            zones: [
              { name: 'Z1', min_hr: 90, max_hr: 120 },
              { name: 'Z2', min_hr: 121, max_hr: 140 },
              { name: 'Z3', min_hr: 141, max_hr: 160 },
              { name: 'Z4', min_hr: 161, max_hr: 180 },
              { name: 'Z5', min_hr: 181, max_hr: 205 },
            ],
          }),
        );
      }
      if (url.includes('/profile/hr-zones')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(<SettingsPage />);

    await screen.findByRole('heading', { name: /Tepové zóny/i });
    await userEvent.clear(screen.getByLabelText('Název sady zón'));
    await userEvent.type(screen.getByLabelText('Název sady zón'), 'Current zones');
    await userEvent.clear(screen.getByLabelText('Platí od'));
    await userEvent.type(screen.getByLabelText('Platí od'), '2026-01-01');
    await userEvent.click(screen.getByRole('button', { name: /Uložit tepové zóny/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/profile/hr-zones'),
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });
  });

  test('prefills heart-rate zone form from latest saved zones and colors rows like Garmin', async () => {
    const savedZoneSets = [
      {
        id: 'zones-old',
        name: 'Base zones',
        effective_from: '2024-04-30',
        zones: [
          { name: 'Z1', min_hr: 90, max_hr: 120 },
          { name: 'Z2', min_hr: 121, max_hr: 140 },
          { name: 'Z3', min_hr: 141, max_hr: 160 },
          { name: 'Z4', min_hr: 161, max_hr: 180 },
          { name: 'Z5', min_hr: 181, max_hr: 205 },
        ],
      },
      {
        id: 'zones-current',
        name: 'Garmin zones',
        effective_from: '2026-05-04',
        zones: [
          { name: 'Z1', min_hr: 96, max_hr: 124 },
          { name: 'Z2', min_hr: 125, max_hr: 143 },
          { name: 'Z3', min_hr: 144, max_hr: 162 },
          { name: 'Z4', min_hr: 163, max_hr: 181 },
          { name: 'Z5', min_hr: 182, max_hr: 201 },
        ],
      },
    ];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/connections/strava/status')) {
        return Promise.resolve(
          jsonResponse({
            connected: false,
            status: 'disconnected',
            provider_user_id: null,
            scopes_granted: [],
            missing_scopes: [],
            access_token_expires_at: null,
            last_sync_at: null,
            last_error: null,
          }),
        );
      }
      if (url.includes('/profile/hr-zones') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toMatchObject({
          name: 'Garmin zones',
          effective_from: '2026-05-04',
          zones: savedZoneSets[1].zones,
        });
        return Promise.resolve(jsonResponse(savedZoneSets[1]));
      }
      if (url.includes('/profile/hr-zones')) {
        return Promise.resolve(jsonResponse(savedZoneSets));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(<SettingsPage />);

    expect(await screen.findByDisplayValue('Garmin zones')).toBeInTheDocument();
    expect(screen.getByLabelText('Platí od')).toHaveValue('2026-05-04');
    expect(screen.getAllByLabelText('Min')[0]).toHaveValue(96);
    expect(screen.getAllByLabelText('Max')[4]).toHaveValue(201);

    const rows = document.querySelectorAll<HTMLElement>('.hr-zone-row');
    expect(rows[0].style.getPropertyValue('--zone-color')).toBe('#9aa3ad');
    expect(rows[1].style.getPropertyValue('--zone-color')).toBe('#2f80ed');
    expect(rows[2].style.getPropertyValue('--zone-color')).toBe('#2f9e44');
    expect(rows[3].style.getPropertyValue('--zone-color')).toBe('#f08c00');
    expect(rows[4].style.getPropertyValue('--zone-color')).toBe('#e03131');

    await userEvent.click(screen.getByRole('button', { name: /Uložit tepové zóny/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/profile/hr-zones'),
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });
  });

  test('recalculates intensity metrics from saved heart-rate zones', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/connections/strava/status')) {
        return Promise.resolve(
          jsonResponse({
            connected: true,
            status: 'connected',
            provider_user_id: '1',
            scopes_granted: ['read', 'activity:read_all'],
            missing_scopes: [],
            access_token_expires_at: null,
            last_sync_at: null,
            last_error: null,
          }),
        );
      }
      if (url.includes('/profile/hr-zones/recompute') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            recomputed_activities: 107,
            remaining_unknown_activities: 0,
            activities_without_effective_zones: 0,
            earliest_activity_without_effective_zones: null,
          }),
        );
      }
      if (url.includes('/profile/hr-zones')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 'zones-1',
              name: 'Current zones',
              effective_from: '2026-01-01',
              zones: [
                { name: 'Z1', min_hr: 90, max_hr: 120 },
                { name: 'Z2', min_hr: 121, max_hr: 140 },
                { name: 'Z3', min_hr: 141, max_hr: 160 },
                { name: 'Z4', min_hr: 161, max_hr: 180 },
                { name: 'Z5', min_hr: 181, max_hr: 205 },
              ],
            },
          ]),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(<SettingsPage />);

    await screen.findByText(/Current zones/i);
    await userEvent.click(screen.getByRole('button', { name: /Přepočítat intenzitu/i }));

    expect(await screen.findByText(/Přepočteno 107 aktivit/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/profile/hr-zones/recompute'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  test('shows only the latest HR zones until history modal is opened', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/connections/strava/status')) {
          return Promise.resolve(
            jsonResponse({
              connected: true,
              status: 'connected',
              provider_user_id: '1',
              scopes_granted: ['read', 'activity:read_all'],
              missing_scopes: [],
              access_token_expires_at: null,
              last_sync_at: null,
              last_error: null,
            }),
          );
        }
        if (url.includes('/profile/hr-zones')) {
          return Promise.resolve(
            jsonResponse([
              {
                id: 'zones-1',
                name: 'Base zones',
                effective_from: '2024-04-30',
                zones: [
                  { name: 'Z1', min_hr: 90, max_hr: 120 },
                  { name: 'Z2', min_hr: 121, max_hr: 140 },
                  { name: 'Z3', min_hr: 141, max_hr: 160 },
                  { name: 'Z4', min_hr: 161, max_hr: 180 },
                  { name: 'Z5', min_hr: 181, max_hr: 205 },
                ],
              },
              {
                id: 'zones-2',
                name: 'Current zones',
                effective_from: '2026-05-04',
                zones: [
                  { name: 'Z1', min_hr: 95, max_hr: 125 },
                  { name: 'Z2', min_hr: 126, max_hr: 145 },
                  { name: 'Z3', min_hr: 146, max_hr: 165 },
                  { name: 'Z4', min_hr: 166, max_hr: 185 },
                  { name: 'Z5', min_hr: 186, max_hr: 205 },
                ],
              },
            ]),
          );
        }
        return Promise.resolve(jsonResponse({}));
      }),
    );
    renderWithClient(<SettingsPage />);

    expect(await screen.findByRole('heading', { name: /Current zones/i })).toBeInTheDocument();
    expect(screen.getByText(/Platí od 4\. 5\. 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Z2 126-145 bpm/i)).toBeInTheDocument();
    expect(screen.queryByText(/Base zones/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Historie tepových zón/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Zobrazit historii/i }));

    const dialog = await screen.findByRole('dialog', { name: /Historie tepových zón/i });
    expect(within(dialog).getAllByText(/Historie tepových zón/i).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/Base zones/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Current zones/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Platí do 3\. 5\. 2026/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Ovlivňuje běhy od 4\. 5\. 2026 dál/i)).toBeInTheDocument();
  });

  test('explains when HR activities remain unknown because zones start too late', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/connections/strava/status')) {
        return Promise.resolve(
          jsonResponse({
            connected: true,
            status: 'connected',
            provider_user_id: '1',
            scopes_granted: ['read', 'activity:read_all'],
            missing_scopes: [],
            access_token_expires_at: null,
            last_sync_at: null,
            last_error: null,
          }),
        );
      }
      if (url.includes('/profile/hr-zones/recompute') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            recomputed_activities: 108,
            remaining_unknown_activities: 108,
            activities_without_effective_zones: 108,
            earliest_activity_without_effective_zones: '2024-04-30',
          }),
        );
      }
      if (url.includes('/profile/hr-zones')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 'zones-1',
              name: 'Current zones',
              effective_from: '2026-05-04',
              zones: [
                { name: 'Z1', min_hr: 90, max_hr: 120 },
                { name: 'Z2', min_hr: 121, max_hr: 140 },
                { name: 'Z3', min_hr: 141, max_hr: 160 },
                { name: 'Z4', min_hr: 161, max_hr: 180 },
                { name: 'Z5', min_hr: 181, max_hr: 205 },
              ],
            },
          ]),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(<SettingsPage />);

    await screen.findByText(/Current zones/i);
    await userEvent.click(screen.getByRole('button', { name: /Přepočítat intenzitu/i }));

    expect(await screen.findByText(/Diagnostika tepové klasifikace/i)).toBeInTheDocument();
    expect(await screen.findByText(/108 aktivit má tepová data, ale nemá platnou sadu tepových zón/i)).toBeInTheDocument();
    expect(screen.getAllByText(/30\. 4\. 2024/i).length).toBeGreaterThan(0);
  });

  test('enables GPS elevation correction and starts recompute', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/connections/strava/status')) {
        return Promise.resolve(
          jsonResponse({
            connected: true,
            status: 'connected',
            provider_user_id: '1',
            scopes_granted: ['read', 'activity:read_all'],
            missing_scopes: [],
            access_token_expires_at: null,
            last_sync_at: null,
            last_error: null,
          }),
        );
      }
      if (url.includes('/profile/elevation/recompute') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ recomputed_activities: 12, skipped_activities: 3, failed_activities: 0 }));
      }
      if (url.includes('/profile/preferences') && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toMatchObject({
          elevation_correction_enabled: true,
          elevation_correction_mode: 'only_when_zero',
          elevation_provider_url: 'https://elevation.example.test/lookup',
        });
        return Promise.resolve(
          jsonResponse({
            locale: 'cs-CZ',
            dashboard_mode: 'advanced',
            favorite_template_ids: [],
            recent_template_ids: [],
            pace_zones: [],
            elevation_correction_enabled: true,
            elevation_correction_mode: 'only_when_zero',
            elevation_provider_url: 'https://elevation.example.test/lookup',
          }),
        );
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(
          jsonResponse({
            locale: 'cs-CZ',
            dashboard_mode: 'advanced',
            favorite_template_ids: [],
            recent_template_ids: [],
            pace_zones: [],
            elevation_correction_enabled: false,
            elevation_correction_mode: 'only_when_zero',
            elevation_provider_url: null,
          }),
        );
      }
      if (url.includes('/profile/hr-zones')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(<SettingsPage />);

    expect(await screen.findByRole('heading', { name: /Korekce převýšení/i })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Použít GPS trasu pro korekci převýšení/i));
    await userEvent.type(screen.getByLabelText(/URL zdroje převýšení/i), 'https://elevation.example.test/lookup');
    await userEvent.click(screen.getByRole('button', { name: /Uložit nastavení převýšení/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/profile/preferences'),
        expect.objectContaining({ method: 'PATCH', credentials: 'include' }),
      );
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /Přepočítat převýšení/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /Přepočítat převýšení/i }));

    expect(await screen.findByText(/Přepočteno 12 aktivit/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/profile/elevation/recompute'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  test('moves dashboard view preference into settings', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/connections/strava/status')) {
        return Promise.resolve(
          jsonResponse({
            connected: true,
            status: 'connected',
            provider_user_id: '1',
            scopes_granted: ['read', 'activity:read_all'],
            missing_scopes: [],
            access_token_expires_at: null,
            last_sync_at: null,
            last_error: null,
          }),
        );
      }
      if (url.includes('/profile/preferences') && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toMatchObject({ dashboard_mode: 'simple' });
        return Promise.resolve(
          jsonResponse({
            locale: 'cs-CZ',
            dashboard_mode: 'simple',
            favorite_template_ids: [],
            recent_template_ids: [],
            pace_zones: [],
            elevation_correction_enabled: false,
            elevation_correction_mode: 'only_when_zero',
            elevation_provider_url: null,
          }),
        );
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(
          jsonResponse({
            locale: 'cs-CZ',
            dashboard_mode: 'advanced',
            favorite_template_ids: [],
            recent_template_ids: [],
            pace_zones: [],
            elevation_correction_enabled: false,
            elevation_correction_mode: 'only_when_zero',
            elevation_provider_url: null,
          }),
        );
      }
      if (url.includes('/profile/hr-zones')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithClient(<SettingsPage />);

    expect(await screen.findByRole('heading', { name: /Zobrazení přehledu/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Jednoduché/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/profile/preferences'),
        expect.objectContaining({ method: 'PATCH', credentials: 'include' }),
      );
    });
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

function renderWithClient(element: ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>{element}</LanguageProvider>
    </QueryClientProvider>,
  );
}

function renderWithShell(element: ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter initialEntries={['/settings']}>
          <AppShell user={{ id: 'u1', email: 'owner@example.com', display_name: null, timezone: 'Europe/Prague', units: 'metric' }}>
            {element}
          </AppShell>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

function preferencesFixture() {
  return {
    locale: 'cs-CZ',
    dashboard_mode: 'advanced',
    favorite_template_ids: [],
    recent_template_ids: [],
    pace_zones: [],
    elevation_correction_enabled: false,
    elevation_correction_mode: 'only_when_zero',
    elevation_provider_url: null,
  };
}
