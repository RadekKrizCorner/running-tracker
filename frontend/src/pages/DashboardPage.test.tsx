import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { AppShell } from '../components/layout/AppShell';
import { toIsoDate } from '../lib/date';
import { LanguageProvider } from '../lib/i18n';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  test('renders empty state when no activities exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/connections/strava/status')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () =>
              Promise.resolve({
                connected: true,
                status: 'connected',
                provider_user_id: '1',
                scopes_granted: ['read', 'activity:read_all'],
                missing_scopes: [],
                access_token_expires_at: null,
                last_sync_at: null,
                last_error: null,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              period: 'week',
              this_week: {
                distance_m: 0,
                moving_time_s: 0,
                run_count: 0,
                load: 0,
                longest_run_m: 0,
                elevation_gain_m: 0,
              },
              trends: {
                week_distance_delta_m: 0,
                ramp_ratio: null,
                acute_load: 0,
                chronic_load: 0,
              },
              intensity_split: { easy_time_s: 0, moderate_time_s: 0, hard_time_s: 0 },
              weekly: [],
              recent_activities: [],
              upcoming_workouts: [],
              week_plan: emptyWeekPlan(),
            }),
        });
      }),
    );
    const queryClient = new QueryClient();

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <DashboardPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/No activities yet/i)).toBeInTheDocument();
  });

  test('renders current week versus plan comparison', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/connections/strava/status')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () =>
              Promise.resolve({
                connected: true,
                status: 'connected',
                provider_user_id: '1',
                scopes_granted: ['read', 'activity:read_all'],
                missing_scopes: [],
                access_token_expires_at: null,
                last_sync_at: null,
                last_error: null,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              period: 'week',
              this_week: {
                distance_m: 10000,
                moving_time_s: 3600,
                run_count: 2,
                load: 140,
                longest_run_m: 6000,
                elevation_gain_m: 50,
              },
              trends: {
                week_distance_delta_m: 0,
                ramp_ratio: null,
                acute_load: 140,
                chronic_load: 140,
              },
              intensity_split: { easy_time_s: 1500, moderate_time_s: 2100, hard_time_s: 0 },
              weekly: [],
              recent_activities: [{ id: 'a1', name: 'Run', sport_type: 'Run', start_time_utc: '2026-04-29T06:00:00Z', distance_m: 4000, moving_time_s: 1500, computed_load: 50, intensity_class: 'easy' }],
              upcoming_workouts: [],
              week_plan: {
                ...emptyWeekPlan(),
                planned_distance_m: 13000,
                completed_distance_m: 10000,
                remaining_distance_m: 8000,
                distance_delta_m: -3000,
                planned_sessions: 2,
                completed_sessions: 2,
                remaining_sessions: 1,
                extra_sessions: 1,
                rows: [
                  {
                    date: '2026-04-27',
                    planned_workout_id: 'p1',
                    planned_title: 'Easy run',
                    planned_type: 'easy',
                    planned_intensity: 'easy',
                    planned_distance_m: 5000,
                    planned_duration_s: 1800,
                    activity_id: 'a2',
                    activity_name: 'Actual run',
                    actual_intensity: 'moderate',
                    actual_distance_m: 6000,
                    actual_duration_s: 2100,
                    distance_delta_m: 1000,
                    duration_delta_s: 300,
                    intensity_match: false,
                    outcome: 'different_intensity',
                  },
                  {
                    date: '2026-04-29',
                    planned_workout_id: 'p2',
                    planned_title: 'Easy planned',
                    planned_type: 'easy',
                    planned_intensity: 'easy',
                    planned_distance_m: 5000,
                    planned_duration_s: 1800,
                    activity_id: null,
                    activity_name: null,
                    actual_intensity: null,
                    actual_distance_m: 0,
                    actual_duration_s: 0,
                    distance_delta_m: -5000,
                    duration_delta_s: -1800,
                    intensity_match: null,
                    outcome: 'waiting',
                  },
                ],
              },
            }),
        });
      }),
    );
    const queryClient = new QueryClient();

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <DashboardPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Current week progress/i)).toBeInTheDocument();
    expect(container.querySelector('.dashboard-hero')).not.toBeInTheDocument();
    expect(container.querySelector('.dashboard-page')?.firstElementChild).toHaveClass('metric-grid');
    expect(screen.queryByRole('heading', { name: /^Dashboard$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Different intensity/i)).toBeInTheDocument();
    expect(screen.getByText(/Monday, 4\/27\/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Wednesday, 4\/29\/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Unmatched/i)).toBeInTheDocument();
    expect(screen.getByText(/8.00 km waiting/i)).toBeInTheDocument();
    expect(screen.getByText(/4\/27\/2026 to 5\/3\/2026/i)).toBeInTheDocument();
    expect(screen.queryByText('2026-04-27')).not.toBeInTheDocument();
  });

  test('shows the week command center with progress meters and adherence counts', async () => {
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
        return Promise.resolve(
          jsonResponse({
            period: 'week',
            this_week: {
              distance_m: 18000,
              moving_time_s: 6600,
              run_count: 3,
              load: 220,
              longest_run_m: 9000,
              elevation_gain_m: 150,
            },
            trends: {
              week_distance_delta_m: 3000,
              ramp_ratio: 1.32,
              acute_load: 220,
              chronic_load: 167,
            },
            intensity_split: { easy_time_s: 4200, moderate_time_s: 1800, hard_time_s: 600, unknown_time_s: 0 },
            weekly: [],
            recent_activities: [{ id: 'a1', name: 'Run', sport_type: 'Run', start_time_utc: '2026-04-29T06:00:00Z', distance_m: 5000, moving_time_s: 1800, computed_load: 60, intensity_class: 'easy' }],
            upcoming_workouts: [],
            week_plan: {
              ...emptyWeekPlan(),
              planned_distance_m: 20000,
              completed_distance_m: 18000,
              remaining_distance_m: 4000,
              distance_delta_m: -2000,
              planned_time_s: 7200,
              completed_time_s: 6600,
              remaining_time_s: 1800,
              duration_delta_s: -600,
              planned_load: 240,
              completed_load: 220,
              load_delta: -20,
              planned_sessions: 4,
              completed_sessions: 3,
              remaining_sessions: 1,
              missed_sessions: 0,
              extra_sessions: 0,
              rows: [],
            },
          }),
        );
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <DashboardPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Week command center/i)).toBeInTheDocument();
    const planOverview = document.querySelector<HTMLElement>('.plan-overview');
    if (!planOverview) {
      throw new Error('Expected weekly plan overview to be rendered');
    }
    const overview = within(planOverview);
    expect(overview.getAllByText(/^Distance$/i)).toHaveLength(1);
    expect(overview.getAllByText(/^Time$/i)).toHaveLength(1);
    expect(overview.getAllByText(/^Load$/i)).toHaveLength(1);
    expect(overview.getAllByText(/^Sessions$/i)).toHaveLength(1);
    expect(overview.queryByText(/90% distance/i)).not.toBeInTheDocument();
    expect(overview.queryByText(/92% time/i)).not.toBeInTheDocument();
    expect(overview.queryByText(/92% load/i)).not.toBeInTheDocument();
    expect(overview.queryByText(/75% sessions/i)).not.toBeInTheDocument();
    expect(planOverview.querySelector('[aria-label="90% Distance"]')).toBeInTheDocument();
    expect(planOverview.querySelector('[aria-label="92% Time"]')).toBeInTheDocument();
    expect(planOverview.querySelector('[aria-label="92% Load"]')).toBeInTheDocument();
    expect(planOverview.querySelector('[aria-label="75% Sessions"]')).toBeInTheDocument();
    expect(screen.getAllByText(/1 waiting/i).length).toBeGreaterThan(0);
  });

  test('does not mark rest plan rows as unmatched runs', async () => {
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
        return Promise.resolve(
          jsonResponse({
            ...dashboardFixture(),
            recent_activities: [
              {
                id: 'a1',
                name: 'Run',
                sport_type: 'Run',
                start_time_utc: '2026-04-29T06:00:00Z',
                distance_m: 5000,
                moving_time_s: 1800,
                computed_load: 60,
                intensity_class: 'easy',
              },
            ],
            week_plan: {
              ...emptyWeekPlan(),
              rows: [
                {
                  date: '2026-04-30',
                  planned_workout_id: 'rest-1',
                  planned_title: 'Rest day',
                  planned_type: 'rest',
                  planned_intensity: 'rest',
                  planned_distance_m: 0,
                  planned_duration_s: 0,
                  activity_id: null,
                  activity_name: null,
                  actual_intensity: null,
                  actual_distance_m: 0,
                  actual_duration_s: 0,
                  distance_delta_m: 0,
                  duration_delta_s: 0,
                  intensity_match: null,
                  outcome: 'rest',
                },
              ],
            },
          }),
        );
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <DashboardPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Thursday, 4\/30\/2026/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^Rest$/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Unmatched/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No completed run yet/i)).not.toBeInTheDocument();
  });

  test('navigates week plan comparison to previous week', async () => {
    const fetchMock = vi.fn((url: string) => {
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
      const weekStart = url.includes('week_start_date=2026-04-20') ? '2026-04-20' : '2026-04-27';
      const weekEnd = weekStart === '2026-04-20' ? '2026-04-26' : '2026-05-03';
      return Promise.resolve(
        jsonResponse({
          period: 'week',
          this_week: {
            distance_m: 10000,
            moving_time_s: 3600,
            run_count: 2,
            load: 140,
            longest_run_m: 6000,
            elevation_gain_m: 50,
          },
          trends: {
            week_distance_delta_m: 0,
            ramp_ratio: null,
            acute_load: 140,
            chronic_load: 140,
          },
          intensity_split: { easy_time_s: 1500, moderate_time_s: 2100, hard_time_s: 0, unknown_time_s: 0 },
          weekly: [],
          recent_activities: [{ id: 'a1', name: 'Run', sport_type: 'Run', start_time_utc: '2026-04-29T06:00:00Z', distance_m: 4000, moving_time_s: 1500, computed_load: 50, intensity_class: 'easy' }],
          upcoming_workouts: [],
          week_plan: {
            ...emptyWeekPlan(),
            week_start_date: weekStart,
            week_end_date: weekEnd,
            rows: weekStart === '2026-04-20'
              ? [
                  {
                    date: '2026-04-21',
                    planned_workout_id: 'p-prev',
                    planned_title: 'Previous week easy',
                    planned_type: 'easy',
                    planned_intensity: 'easy',
                    planned_distance_m: 5000,
                    planned_duration_s: 1800,
                    activity_id: 'a-prev',
                    activity_name: 'Previous week run',
                    actual_intensity: 'easy',
                    actual_distance_m: 5200,
                    actual_duration_s: 1850,
                    distance_delta_m: 200,
                    duration_delta_s: 50,
                    intensity_match: true,
                    outcome: 'as_planned',
                  },
                ]
              : [],
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <DashboardPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/4\/27\/2026 to 5\/3\/2026/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Previous week/i }));

    expect(await screen.findByText(/4\/20\/2026 to 4\/26\/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Previous week easy/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('week_start_date=2026-04-20'),
      expect.any(Object),
    );
  });

  test('shows guidance when all intensity time is unknown', async () => {
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
        return Promise.resolve(
          jsonResponse({
            period: 'week',
            this_week: {
              distance_m: 5000,
              moving_time_s: 1800,
              run_count: 1,
              load: 60,
              longest_run_m: 5000,
              elevation_gain_m: 0,
            },
            trends: {
              week_distance_delta_m: 0,
              ramp_ratio: null,
              acute_load: 60,
              chronic_load: 60,
            },
            intensity_split: { easy_time_s: 0, moderate_time_s: 0, hard_time_s: 0, unknown_time_s: 1800 },
            weekly: [
              {
                week_start_date: '2026-04-27',
                distance_m: 5000,
                moving_time_s: 1800,
                elevation_gain_m: 0,
                run_count: 1,
                load: 60,
                acute_load: 60,
                chronic_load: 60,
                ramp_ratio: null,
                easy_time_s: 0,
                moderate_time_s: 0,
                hard_time_s: 0,
                unknown_time_s: 1800,
                long_run_distance_m: 5000,
              },
            ],
            recent_activities: [{ id: 'a1', name: 'Run', sport_type: 'Run', start_time_utc: '2026-04-29T06:00:00Z', distance_m: 5000, moving_time_s: 1800, computed_load: 60, intensity_class: 'unknown' }],
            upcoming_workouts: [],
            week_plan: emptyWeekPlan(),
          }),
        );
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <DashboardPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Intensity needs HR zones or RPE/i)).toBeInTheDocument();
    expect(screen.getByText(/30m unknown/i)).toBeInTheDocument();
  });

  test('disables sync button and shows sync job status while running', async () => {
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
      if (url.includes('/connections/strava/sync/job-1')) {
        return Promise.resolve(
          jsonResponse({
            job_id: 'job-1',
            status: 'started',
            detail: 'Strava sync is running',
            result: null,
            error: null,
          }),
        );
      }
      if (url.includes('/connections/strava/sync') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ status: 'queued', detail: 'Strava sync queued', job_id: 'job-1' }));
      }
      return Promise.resolve(
        jsonResponse({
          period: 'week',
          this_week: {
            distance_m: 0,
            moving_time_s: 0,
            run_count: 0,
            load: 0,
            longest_run_m: 0,
            elevation_gain_m: 0,
          },
          trends: {
            week_distance_delta_m: 0,
            ramp_ratio: null,
            acute_load: 0,
            chronic_load: 0,
          },
          intensity_split: { easy_time_s: 0, moderate_time_s: 0, hard_time_s: 0 },
          weekly: [],
          recent_activities: [{ id: 'a1', name: 'Run', sport_type: 'Run', start_time_utc: '2026-04-29T06:00:00Z', distance_m: 4000, moving_time_s: 1500, computed_load: 50, intensity_class: 'easy' }],
          upcoming_workouts: [],
          week_plan: emptyWeekPlan(),
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <DashboardPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /Sync Strava/i }));

    const runningButton = await screen.findByRole('button', { name: /Sync running/i });
    expect(runningButton).toBeDisabled();
    expect(screen.getByText(/Strava sync is running/i)).toBeInTheDocument();
  });

  test('refreshes the today sidebar card after a Strava sync finishes', async () => {
    const today = toIsoDate(new Date());
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
                title: 'Easy run',
                target_duration_s: 2400,
                target_distance_m: 7000,
                target_intensity: 'easy',
                instructions: null,
                completed_activity_id: null,
                status: 'planned',
              },
            ],
            activities: calendarCalls > 1
              ? [{ id: 'activity-1', name: 'Synced today run', date: today, distance_m: 7100, moving_time_s: 2500, intensity_class: 'easy' }]
              : [],
            events: [],
          }),
        );
      }
      if (url.includes('/connections/strava/status')) {
        return Promise.resolve(jsonResponse(stravaStatusFixture()));
      }
      if (url.includes('/connections/strava/sync/job-1')) {
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
      return Promise.resolve(jsonResponse(dashboardFixture()));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <MemoryRouter initialEntries={['/dashboard']}>
            <AppShell user={{ id: 'u1', email: 'owner@example.com', display_name: null, timezone: 'Europe/Prague', units: 'metric' }}>
              <DashboardPage />
            </AppShell>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Easy run 7 km/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sync Strava/i }));

    expect(await screen.findByText(/Good work, today is done/i)).toBeInTheDocument();
    expect(screen.getByText(/Synced today run · 7\.10 km/i)).toBeInTheDocument();
    await waitFor(() => expect(calendarCalls).toBeGreaterThan(1));
  });

  test('shows onboarding checklist and can queue historical sync', async () => {
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
            active_job_id: null,
          }),
        );
      }
      if (url.includes('/profile/hr-zones')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/connections/strava/sync') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ status: 'queued', detail: 'Historical Strava sync queued', job_id: 'job-history' }));
      }
      return Promise.resolve(
        jsonResponse({
          period: 'week',
          this_week: {
            distance_m: 0,
            moving_time_s: 0,
            run_count: 0,
            load: 0,
            longest_run_m: 0,
            elevation_gain_m: 0,
          },
          trends: {
            week_distance_delta_m: 0,
            ramp_ratio: null,
            acute_load: 0,
            chronic_load: 0,
          },
          intensity_split: { easy_time_s: 0, moderate_time_s: 0, hard_time_s: 0, unknown_time_s: 0 },
          weekly: [],
          recent_activities: [],
          upcoming_workouts: [],
          week_plan: emptyWeekPlan(),
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <DashboardPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Setup checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/Import training history/i)).toBeInTheDocument();
    expect(screen.getByText(/Configure HR zones/i)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: /Sync history/i })[0]);
    const syncCall = fetchMock.mock.calls.find(([url, init]) => String(url).includes('/connections/strava/sync') && init?.method === 'POST');
    expect(JSON.parse(String(syncCall?.[1]?.body)).mode).toBe('history');
  });

  test('uses dashboard view preference without showing a dashboard mode switch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/connections/strava/status')) {
          return Promise.resolve(jsonResponse({ connected: true, status: 'connected', provider_user_id: '1', scopes_granted: [], missing_scopes: [], access_token_expires_at: null, last_sync_at: null, last_error: null, active_job_id: null }));
        }
        if (url.includes('/profile/preferences')) {
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
        if (url.includes('/profile/hr-zones')) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(
          jsonResponse({
            period: 'week',
            this_week: { distance_m: 10000, moving_time_s: 3600, run_count: 2, load: 140, longest_run_m: 6000, elevation_gain_m: 50 },
            trends: { week_distance_delta_m: 0, ramp_ratio: 1.2, acute_load: 140, chronic_load: 120 },
            intensity_split: { easy_time_s: 1200, moderate_time_s: 1800, hard_time_s: 600, unknown_time_s: 0 },
            weekly: [],
            recent_activities: [{ id: 'a1', name: 'Run', sport_type: 'Run', start_time_utc: '2026-04-29T06:00:00Z', distance_m: 4000, moving_time_s: 1500, computed_load: 50, intensity_class: 'easy' }],
            upcoming_workouts: [],
            week_plan: emptyWeekPlan(),
          }),
        );
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <DashboardPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Recent activities/i)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Dashboard mode/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Simple/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Weekly load/i)).not.toBeInTheDocument();
  });

  test('resumes active sync progress from connection status', async () => {
    const fetchMock = vi.fn((url: string) => {
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
            active_job_id: 'job-1',
          }),
        );
      }
      if (url.includes('/connections/strava/sync/job-1')) {
        return Promise.resolve(
          jsonResponse({
            job_id: 'job-1',
            status: 'started',
            detail: 'Strava sync is running',
            result: null,
            error: null,
            progress: {
              phase: 'importing',
              imported: 4,
              skipped: 1,
              streams: 8,
              current_activity: 'Morning route',
              started_at: '2026-05-05T06:00:00Z',
              updated_at: '2026-05-05T06:03:00Z',
            },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          period: 'week',
          this_week: {
            distance_m: 5000,
            moving_time_s: 1800,
            run_count: 1,
            load: 60,
            longest_run_m: 5000,
            elevation_gain_m: 0,
          },
          trends: {
            week_distance_delta_m: 0,
            ramp_ratio: null,
            acute_load: 60,
            chronic_load: 60,
          },
          intensity_split: { easy_time_s: 1800, moderate_time_s: 0, hard_time_s: 0, unknown_time_s: 0 },
          weekly: [],
          recent_activities: [{ id: 'a1', name: 'Run', sport_type: 'Run', start_time_utc: '2026-04-29T06:00:00Z', distance_m: 5000, moving_time_s: 1800, computed_load: 60, intensity_class: 'easy' }],
          upcoming_workouts: [],
          week_plan: emptyWeekPlan(),
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <DashboardPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Importing activities: Morning route/i)).toBeInTheDocument();
    expect(screen.getByText(/Imported 4/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sync running/i })).toBeDisabled();
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

function stravaStatusFixture() {
  return {
    connected: true,
    status: 'connected',
    provider_user_id: '1',
    scopes_granted: ['read', 'activity:read_all'],
    missing_scopes: [],
    access_token_expires_at: null,
    last_sync_at: null,
    last_error: null,
    active_job_id: null,
  };
}

function preferencesFixture() {
  return {
    locale: 'en-US',
    dashboard_mode: 'advanced',
    favorite_template_ids: [],
    recent_template_ids: [],
    pace_zones: [],
    elevation_correction_enabled: false,
    elevation_correction_mode: 'only_when_zero',
    elevation_provider_url: null,
  };
}

function dashboardFixture() {
  return {
    period: 'week',
    this_week: {
      distance_m: 0,
      moving_time_s: 0,
      run_count: 0,
      load: 0,
      longest_run_m: 0,
      elevation_gain_m: 0,
    },
    trends: {
      week_distance_delta_m: 0,
      ramp_ratio: null,
      acute_load: 0,
      chronic_load: 0,
    },
    intensity_split: { easy_time_s: 0, moderate_time_s: 0, hard_time_s: 0, unknown_time_s: 0 },
    weekly: [],
    recent_activities: [],
    upcoming_workouts: [],
    week_plan: emptyWeekPlan(),
  };
}

function emptyWeekPlan() {
  return {
    week_start_date: '2026-04-27',
    week_end_date: '2026-05-03',
    planned_distance_m: 0,
    completed_distance_m: 0,
    remaining_distance_m: 0,
    distance_delta_m: 0,
    planned_time_s: 0,
    completed_time_s: 0,
    remaining_time_s: 0,
    duration_delta_s: 0,
    planned_load: 0,
    completed_load: 0,
    load_delta: 0,
    planned_sessions: 0,
    completed_sessions: 0,
    remaining_sessions: 0,
    missed_sessions: 0,
    extra_sessions: 0,
    rows: [],
  };
}
