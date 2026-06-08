import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { addDaysToIso, weekStartIso } from '../lib/date';
import { LanguageProvider } from '../lib/i18n';
import { PlansPage } from './PlansPage';

describe('PlansPage', () => {
  test('saves a week from a selected workout template', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve([
              {
                id: 'easy-template',
                name: 'Easy run',
                workout_type: 'easy',
                title: 'Easy run',
                target_duration_s: 2700,
                target_distance_m: 7000,
                target_intensity: 'easy',
                instructions: 'Run easy.',
              },
            ]),
        });
      }
      if (url.includes('/calendar/week')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ planned_workouts: [], activities: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ planned_workouts: [], activities: [] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: /Weekly plan/i })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Use Easy run on selected day/i }));
    await userEvent.click(screen.getByRole('button', { name: /Save week/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/calendar/week'),
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });
    const saveCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/calendar/week'));
    expect(JSON.parse(String(saveCall?.[1]?.body)).workouts[0].template_id).toBe('easy-template');
  });

  test('updates planned overview while editing a week', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve([
              {
                id: 'easy-template',
                name: 'Easy run',
                workout_type: 'easy',
                title: 'Easy run',
                target_duration_s: 3600,
                target_distance_m: 10000,
                target_intensity: 'easy',
                instructions: 'Run easy.',
              },
            ]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ planned_workouts: [], activities: [] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /Use Easy run on selected day/i }));

    expect((await screen.findAllByText('10.0 km')).length).toBeGreaterThan(0);
    expect(screen.getByText('1h 0m')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('opens a day editor modal when a day is selected', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve([
              {
                id: 'easy-template',
                name: 'Easy run',
                workout_type: 'easy',
                title: 'Easy run',
                target_duration_s: 2700,
                target_distance_m: 7000,
                target_intensity: 'easy',
                instructions: 'Run easy.',
              },
            ]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ planned_workouts: [], activities: [] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Template library/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('week-board-day')).toHaveLength(7);
    const tuesdayCard = screen.getByRole('button', { name: /Select Tue/i }).closest('[data-testid="week-board-day"]');
    expect(tuesdayCard).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Select Tue/i }));
    expect(screen.getByRole('dialog', { name: /Edit/i })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Use Easy run on selected day/i }));

    expect(tuesdayCard).toHaveTextContent('Easy run');
    expect(within(tuesdayCard as HTMLElement).getByText(/planned day/i)).toBeInTheDocument();
  });

  test('shows clear distance and time labels in the day editor modal', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="cs-CZ">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Knihovna šablon/i)).toBeInTheDocument();
    const tuesdayCard = screen.getAllByTestId('week-board-day')[1];
    await userEvent.click(within(tuesdayCard).getByRole('button', { name: /Vybrat/i }));

    const dialog = screen.getByRole('dialog', { name: /Upravit/i });
    expect(within(dialog).getByText('Tréninkové cíle')).toBeInTheDocument();
    expect(within(dialog).getByText('Vzdálenost')).toBeInTheDocument();
    expect(within(dialog).getByText('Čas')).toBeInTheDocument();
    expect(within(dialog).getByText('Cílová vzdálenost běhu')).toBeInTheDocument();
    expect(within(dialog).getByText('Cílový čas tréninku')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Vzdálenost.*km/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Čas.*min/i)).toBeInTheDocument();
  });

  test('supports day quick actions for rest clear and add easy run', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve([
              {
                id: 'easy-template',
                name: 'Easy run',
                workout_type: 'easy',
                title: 'Easy run',
                target_duration_s: 2700,
                target_distance_m: 7000,
                target_intensity: 'easy',
                instructions: 'Run easy.',
              },
            ]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ planned_workouts: [], activities: [] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const mondayCard = (await screen.findByRole('button', { name: /Select Mon/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Add easy run/i }));
    expect(mondayCard).toHaveTextContent('Easy run');

    await userEvent.click(within(mondayCard).getByRole('button', { name: /Select Mon/i }));
    const dialog = screen.getByRole('dialog', { name: /Edit/i });
    await userEvent.click(within(dialog).getByRole('button', { name: /Mark whole day rest/i }));
    expect(mondayCard).toHaveTextContent('Rest day');

    await userEvent.click(within(dialog).getByRole('button', { name: /Clear whole day/i }));
    expect(mondayCard).toHaveTextContent('Unscheduled');

    await userEvent.click(within(mondayCard).getByRole('button', { name: /Add easy run/i }));
    expect(mondayCard).toHaveTextContent('Easy run');

    confirmSpy.mockRestore();
  });

  test('adds a double threshold day as two labeled sessions', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const mondayCard = (await screen.findByRole('button', { name: /Select Mon/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Add double threshold/i }));

    expect(mondayCard).toHaveTextContent('Morning');
    expect(mondayCard).toHaveTextContent('Threshold intervals');
    expect(mondayCard).toHaveTextContent('Afternoon');
    expect(mondayCard).toHaveTextContent('Threshold tempo');

    await userEvent.click(screen.getByRole('button', { name: /Save week/i }));

    const saveCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/calendar/week'));
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.workouts).toMatchObject([
      {
        scheduled_date: weekStartIso(),
        session_label: 'Morning',
        sort_order: 0,
        title: 'Threshold intervals',
        workout_type: 'tempo',
        target_duration_s: 2700,
        target_intensity: 'hard',
      },
      {
        scheduled_date: weekStartIso(),
        session_label: 'Afternoon',
        sort_order: 1,
        title: 'Threshold tempo',
        workout_type: 'tempo',
        target_duration_s: 2700,
        target_intensity: 'hard',
      },
    ]);
  });

  test('deletes one session without clearing the rest of the day', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const mondayCard = (await screen.findByRole('button', { name: /Select Mon/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Add double threshold/i }));
    await userEvent.click(screen.getByRole('button', { name: /Select Mon/i }));

    const dialog = screen.getByRole('dialog', { name: /Edit/i });
    await userEvent.click(within(dialog).getByRole('button', { name: /Delete session 2/i }));

    expect(within(dialog).getByDisplayValue('Threshold intervals')).toBeInTheDocument();
    expect(within(dialog).queryByDisplayValue('Threshold tempo')).not.toBeInTheDocument();
    expect(mondayCard).toHaveTextContent('1 session');
    expect(mondayCard).not.toHaveTextContent('Threshold tempo');
  });

  test('moves one selected session to another day', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const mondayCard = (await screen.findByRole('button', { name: /Select Mon/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    const tuesdayCard = screen.getByRole('button', { name: /Select Tue/i }).closest('[data-testid="week-board-day"]') as HTMLElement;
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Add double threshold/i }));
    await userEvent.click(screen.getByRole('button', { name: /Select Mon/i }));

    await userEvent.click(screen.getByRole('button', { name: /Move session 2 later/i }));

    expect(mondayCard).toHaveTextContent('Threshold intervals');
    expect(mondayCard).not.toHaveTextContent('Threshold tempo');
    expect(tuesdayCard).toHaveTextContent('Threshold tempo');
  });

  test('adds the requested session to the workout pool', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('/workout-pool') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            id: 'pool-threshold',
            source_template_id: null,
            workout_type: 'tempo',
            title: 'Threshold tempo',
            target_duration_s: 2700,
            target_distance_m: null,
            target_intensity: 'hard',
            instructions: 'Afternoon work.',
          }),
        );
      }
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const mondayCard = (await screen.findByRole('button', { name: /Select Mon/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Add double threshold/i }));
    await userEvent.click(screen.getByRole('button', { name: /Select Mon/i }));
    await userEvent.click(screen.getByRole('button', { name: /Add session 2 to pool/i }));

    await waitFor(() => expect(calls.some(([url, init]) => url.includes('/workout-pool') && init?.method === 'POST')).toBe(true));
    const createPoolCall = calls.find(([url, init]) => url.includes('/workout-pool') && init?.method === 'POST');
    expect(JSON.parse(String(createPoolCall?.[1]?.body))).toEqual(
      expect.objectContaining({ title: 'Threshold tempo', workout_type: 'tempo', target_duration_s: 2700 }),
    );
  });

  test('requires confirmation before replacing planned sessions with rest', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const mondayCard = (await screen.findByRole('button', { name: /Select Mon/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Add easy run/i }));
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Select Mon/i }));
    const dialog = screen.getByRole('dialog', { name: /Edit/i });
    await userEvent.click(within(dialog).getByRole('button', { name: /Mark whole day rest/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/delete 1 planned session/i));
    expect(mondayCard).toHaveTextContent('Easy run');

    confirmSpy.mockReturnValue(true);
    await userEvent.click(within(dialog).getByRole('button', { name: /Mark whole day rest/i }));

    expect(mondayCard).toHaveTextContent('Rest day');
    confirmSpy.mockRestore();
  });

  test('shows unsaved state and disables saving when the week is clean', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/calendar/week') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
      }
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const saveButton = await screen.findByRole('button', { name: /Save week/i });
    expect(saveButton).toBeDisabled();

    const mondayCard = (await screen.findByRole('button', { name: /Select Mon/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Add easy run/i }));

    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    await userEvent.click(saveButton);

    await waitFor(() => expect(screen.queryByText(/Unsaved changes/i)).not.toBeInTheDocument());
    expect(saveButton).toBeDisabled();
  });

  test('keeps demo planning in a clearly read-only state', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('/auth/me')) {
        return Promise.resolve(
          jsonResponse({
            id: 'demo-user',
            email: 'demo@example.com',
            display_name: 'Demo user',
            is_demo: true,
            timezone: 'Europe/Prague',
            units: 'metric',
          }),
        );
      }
      if (url.includes('/workout-templates')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 'easy-template',
              name: 'Easy run',
              workout_type: 'easy',
              title: 'Easy run',
              target_duration_s: 2700,
              target_distance_m: 7000,
              target_intensity: 'easy',
              instructions: 'Run easy.',
            },
          ]),
        );
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Read-only demo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save week/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Copy previous week/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Copy to next week/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Add$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Use Easy run on selected day/i })).toBeDisabled();

    const mondayCard = (await screen.findByRole('button', { name: /Select Mon/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    expect(within(mondayCard).getByRole('button', { name: /Add easy run/i })).toBeDisabled();
    expect(screen.queryByText(/Unsaved changes/i)).not.toBeInTheDocument();
    expect(calls.some(([url, init]) => url.includes('/calendar/week') && init?.method === 'POST')).toBe(false);
  });

  test('shows day quick actions only for the selected day card', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const mondayCard = (await screen.findByRole('button', { name: /Select Mon/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    const tuesdayCard = screen.getByRole('button', { name: /Select Tue/i }).closest('[data-testid="week-board-day"]') as HTMLElement;

    expect(within(mondayCard).getByRole('button', { name: /Add easy run/i })).toBeInTheDocument();
    expect(within(tuesdayCard).queryByRole('button', { name: /Add easy run/i })).not.toBeInTheDocument();

    await userEvent.click(within(tuesdayCard).getByRole('button', { name: /Select Tue/i }));

    expect(within(mondayCard).queryByRole('button', { name: /Add easy run/i })).not.toBeInTheDocument();
    expect(within(tuesdayCard).getByRole('button', { name: /Add easy run/i })).toBeInTheDocument();
  });

  test('separates destructive day editor actions and names icon buttons with tooltips', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const mondayCard = (await screen.findByRole('button', { name: /Select Mon/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Add double threshold/i }));
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Select Mon/i }));

    const dialog = screen.getByRole('dialog', { name: /Edit/i });
    const primaryActions = dialog.querySelector('.day-editor-primary-actions') as HTMLElement;
    const dangerActions = dialog.querySelector('.day-editor-danger-actions') as HTMLElement;

    expect(primaryActions).not.toBeNull();
    expect(dangerActions).not.toBeNull();
    expect(within(primaryActions).getByRole('button', { name: /Add easy run/i })).toBeInTheDocument();
    expect(within(primaryActions).getByRole('button', { name: /Add double threshold/i })).toBeInTheDocument();
    expect(within(dangerActions).getByRole('button', { name: /Mark whole day rest/i })).toBeInTheDocument();
    expect(within(dangerActions).getByRole('button', { name: /Clear whole day/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Delete session 1/i })).toHaveAttribute('title', 'Delete session 1');
    expect(within(dialog).getByRole('button', { name: /Move session 1 later/i })).toHaveAttribute('title', 'Move session 1 later');
  });

  test('uses Czech singular label for one session', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="cs-CZ">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const mondayCard = (await screen.findByRole('button', { name: /Vybrat po/i })).closest('[data-testid="week-board-day"]') as HTMLElement;
    await userEvent.click(within(mondayCard).getByRole('button', { name: /Přidat lehký běh/i }));

    expect(mondayCard).toHaveTextContent('1 trénink');
    expect(mondayCard).not.toHaveTextContent('1 tréninky');
  });

  test('applies a dragged template to a dropped day', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 'easy-template',
              name: 'Easy run',
              workout_type: 'easy',
              title: 'Easy run',
              target_duration_s: 2700,
              target_distance_m: 7000,
              target_intensity: 'easy',
              instructions: 'Run easy.',
            },
          ]),
        );
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const template = await screen.findByRole('button', { name: /Use Easy run on selected day/i });
    const tuesdayCard = screen.getByRole('button', { name: /Select Tue/i }).closest('[data-testid="week-board-day"]') as HTMLElement;
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(template, { dataTransfer });
    fireEvent.dragOver(tuesdayCard, { dataTransfer });
    fireEvent.drop(tuesdayCard, { dataTransfer });

    expect(tuesdayCard).toHaveTextContent('Easy run');
  });

  test('copies previous week and moves selected workout to another day', async () => {
    const currentWeek = weekStartIso();
    const previousWeek = weekStartIso(addDaysToIso(currentWeek, -7));
    const previousTuesday = addDaysToIso(previousWeek, 1);
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes(`/calendar?start_date=${previousWeek}`)) {
        return Promise.resolve(
          jsonResponse({
            planned_workouts: [
              {
                id: 'previous-easy',
                plan_id: null,
                scheduled_date: previousTuesday,
                workout_type: 'easy',
                title: 'Copied easy run',
                target_duration_s: 2700,
                target_distance_m: 7000,
                target_intensity: 'easy',
                instructions: 'Repeat this.',
                completed_activity_id: null,
                status: 'planned',
              },
            ],
            activities: [],
            events: [],
          }),
        );
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /Copy previous week/i }));
    const tuesdayCard = screen.getByRole('button', { name: /Select Tue/i }).closest('[data-testid="week-board-day"]') as HTMLElement;
    expect(tuesdayCard).toHaveTextContent('Copied easy run');

    await userEvent.click(screen.getByRole('button', { name: /Select Tue/i }));
    expect(screen.getByRole('dialog', { name: /Edit/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Move session 1 later/i }));

    const wednesdayCard = screen.getByRole('button', { name: /Select Wed/i }).closest('[data-testid="week-board-day"]') as HTMLElement;
    expect(wednesdayCard).toHaveTextContent('Copied easy run');
    expect(tuesdayCard).toHaveTextContent('Unscheduled');
  });

  test('loads template preferences and persists favorite and recent templates', async () => {
    const preferenceBodies: unknown[] = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/profile/preferences') && init?.method === 'PATCH') {
        preferenceBodies.push(JSON.parse(String(init.body)));
        return Promise.resolve(
          jsonResponse({
            locale: 'cs-CZ',
            dashboard_mode: 'advanced',
            favorite_template_ids: ['easy-template'],
            recent_template_ids: ['easy-template'],
            pace_zones: [],
          }),
        );
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(
          jsonResponse({
            locale: 'cs-CZ',
            dashboard_mode: 'advanced',
            favorite_template_ids: ['long-template'],
            recent_template_ids: [],
            pace_zones: [],
          }),
        );
      }
      if (url.includes('/workout-templates')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 'easy-template',
              name: 'Easy run',
              workout_type: 'easy',
              title: 'Easy run',
              target_duration_s: 2700,
              target_distance_m: 7000,
              target_intensity: 'easy',
              instructions: 'Run easy.',
            },
            {
              id: 'long-template',
              name: 'Long run',
              workout_type: 'long',
              title: 'Long run',
              target_duration_s: 5400,
              target_distance_m: 14000,
              target_intensity: 'easy',
              instructions: 'Run long.',
            },
          ]),
        );
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /Favorite Easy run/i }));
    await userEvent.click(screen.getByRole('button', { name: /Use Easy run on selected day/i }));

    await waitFor(() => expect(preferenceBodies.length).toBeGreaterThanOrEqual(2));
    expect(preferenceBodies).toContainEqual(
      expect.objectContaining({ favorite_template_ids: expect.arrayContaining(['long-template', 'easy-template']) }),
    );
    expect(preferenceBodies).toContainEqual(
      expect.objectContaining({ recent_template_ids: ['easy-template'] }),
    );
  });

  test('schedules an unscheduled workout pool item on the selected day', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('/workout-pool/pool-1/schedule')) {
        return Promise.resolve(
          jsonResponse({
            id: 'planned-from-pool',
            plan_id: null,
            scheduled_date: weekStartIso(),
            workout_type: 'easy',
            title: 'Pool easy',
            target_duration_s: 2400,
            target_distance_m: 6000,
            target_intensity: 'easy',
            instructions: 'Ready to schedule.',
            completed_activity_id: null,
            status: 'planned',
          }),
        );
      }
      if (url.includes('/workout-pool')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 'pool-1',
              source_template_id: null,
              workout_type: 'easy',
              title: 'Pool easy',
              target_duration_s: 2400,
              target_distance_m: 6000,
              target_intensity: 'easy',
              instructions: 'Ready to schedule.',
            },
          ]),
        );
      }
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Workout pool/i)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Schedule Pool easy on selected day/i }));

    await waitFor(() => {
      expect(calls.some(([url]) => url.includes('/workout-pool/pool-1/schedule'))).toBe(true);
    });
    const scheduleCall = calls.find(([url]) => url.includes('/workout-pool/pool-1/schedule'));
    expect(JSON.parse(String(scheduleCall?.[1]?.body))).toEqual({ scheduled_date: weekStartIso(), session_label: null, sort_order: 0 });
  });

  test('creates a template from the template library dialog', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('/workout-templates') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            id: 'new-template',
            name: 'Short easy',
            workout_type: 'easy',
            title: 'Short easy',
            target_duration_s: 1800,
            target_distance_m: 5000,
            target_intensity: 'easy',
            instructions: null,
          }),
        );
      }
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /^Add$/i }));
    const dialog = screen.getByRole('dialog', { name: /Add template/i });
    await userEvent.clear(within(dialog).getByLabelText(/Template name/i));
    await userEvent.type(within(dialog).getByLabelText(/Template name/i), 'Short easy');
    await userEvent.click(within(dialog).getByRole('button', { name: /Save template/i }));

    await waitFor(() => {
      expect(calls.some(([url, init]) => url.includes('/workout-templates') && init?.method === 'POST')).toBe(true);
    });
    const createCall = calls.find(([url, init]) => url.includes('/workout-templates') && init?.method === 'POST');
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual(
      expect.objectContaining({ name: 'Short easy', title: 'Short easy', workout_type: 'easy' }),
    );
  });

  test('shows planned metric comparisons against previous week', async () => {
    const currentWeek = weekStartIso();
    const previousWeek = weekStartIso(addDaysToIso(currentWeek, -7));
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 'easy-template',
              name: 'Easy run',
              workout_type: 'easy',
              title: 'Easy run',
              target_duration_s: 3600,
              target_distance_m: 10000,
              target_intensity: 'easy',
              instructions: 'Run easy.',
            },
          ]),
        );
      }
      if (url.includes(`/calendar?start_date=${previousWeek}`)) {
        return Promise.resolve(
          jsonResponse({
            planned_workouts: [
              {
                id: 'previous-easy',
                plan_id: null,
                scheduled_date: addDaysToIso(previousWeek, 0),
                workout_type: 'easy',
                title: 'Previous easy run',
                target_duration_s: 1800,
                target_distance_m: 5000,
                target_intensity: 'easy',
                instructions: null,
                completed_activity_id: null,
                status: 'planned',
              },
            ],
            activities: [],
            events: [],
          }),
        );
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /Use Easy run on selected day/i }));

    expect((await screen.findAllByText('+100% vs last week')).length).toBeGreaterThan(0);
  });

  test('shows long-term weekly rows with planned day summaries and load outlook', async () => {
    const currentWeek = weekStartIso();
    const nextWeek = weekStartIso(addDaysToIso(currentWeek, 7));
    const nextTuesday = addDaysToIso(nextWeek, 1);
    const longTermEnd = addDaysToIso(currentWeek, 83);
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/analytics/recent-weeks?weeks=6')) {
        return Promise.resolve(
          jsonResponse([
            weeklyMetric(addDaysToIso(currentWeek, -14), 82),
            weeklyMetric(addDaysToIso(currentWeek, -7), 96),
          ]),
        );
      }
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      if (url.includes(`/calendar?start_date=${currentWeek}&end_date=${longTermEnd}`)) {
        return Promise.resolve(
          jsonResponse({
            planned_workouts: [
              {
                id: 'future-long',
                plan_id: null,
                scheduled_date: nextTuesday,
                workout_type: 'long',
                title: 'Long run',
                target_duration_s: 5400,
                target_distance_m: 14000,
                target_intensity: 'easy',
                instructions: 'Keep it relaxed.',
                completed_activity_id: null,
                status: 'planned',
              },
            ],
            activities: [],
            events: [],
          }),
        );
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: /Long-term plan/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Planned load outlook/i })).toBeInTheDocument();
    expect(screen.getByText(/Actual \+ planned/i)).toBeInTheDocument();

    const futureWeekRow = await screen.findByTestId(`long-term-week-${nextWeek}`);
    expect(within(futureWeekRow).getByText('Long run')).toBeInTheDocument();
    expect(within(futureWeekRow).getAllByText('14.0 km').length).toBeGreaterThan(0);
    expect(within(futureWeekRow).getAllByText('1h 30m').length).toBeGreaterThan(0);
    expect(within(futureWeekRow).getByRole('button', { name: /Open Tue, Long run/i })).toHaveClass('long-term-day-button');
  });

  test('opens a future long-term day in the day editor and saves that week', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const currentWeek = weekStartIso();
    const futureWeek = weekStartIso(addDaysToIso(currentWeek, 14));
    const futureWednesday = addDaysToIso(futureWeek, 2);
    const longTermEnd = addDaysToIso(currentWeek, 83);
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('/calendar/week') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
      }
      if (url.includes('/analytics/recent-weeks?weeks=6')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      if (url.includes(`/calendar?start_date=${currentWeek}&end_date=${longTermEnd}`)) {
        return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <PlansPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const futureWeekRow = await screen.findByTestId(`long-term-week-${futureWeek}`);
    await userEvent.click(within(futureWeekRow).getByRole('button', { name: /Open Wed, Unscheduled/i }));

    const dialog = await screen.findByRole('dialog', { name: /Edit Wed/i });
    await userEvent.type(within(dialog).getByLabelText(new RegExp(`Title ${futureWednesday} 1`, 'i')), 'Steady aerobic');
    await userEvent.type(within(dialog).getByLabelText(new RegExp(`Distance km ${futureWednesday} 1`, 'i')), '9');
    await userEvent.type(within(dialog).getByLabelText(new RegExp(`Time min ${futureWednesday} 1`, 'i')), '50');
    expect(within(dialog).getByDisplayValue('Steady aerobic')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Save week/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /Save week/i }));

    await waitFor(() => expect(calls.some(([url, init]) => url.includes('/calendar/week') && init?.method === 'POST')).toBe(true));
    const saveCall = calls.find(([url, init]) => url.includes('/calendar/week') && init?.method === 'POST');
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.week_start_date).toBe(futureWeek);
    expect(body.workouts[0]).toEqual(
      expect.objectContaining({
        scheduled_date: futureWednesday,
        title: 'Steady aerobic',
        target_duration_s: 3000,
        target_distance_m: 9000,
      }),
    );
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

function defaultPreferences() {
  return {
    locale: 'cs-CZ',
    dashboard_mode: 'advanced',
    favorite_template_ids: [],
    recent_template_ids: [],
    pace_zones: [],
  };
}

function createDataTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: 'copy',
    dropEffect: 'copy',
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
  };
}

function weeklyMetric(weekStartDate: string, load: number) {
  return {
    week_start_date: weekStartDate,
    distance_m: 30000,
    moving_time_s: 10800,
    elevation_gain_m: 250,
    run_count: 4,
    load,
    acute_load: load,
    chronic_load: load * 4,
    ramp_ratio: 1,
    easy_time_s: 7200,
    moderate_time_s: 2400,
    hard_time_s: 1200,
    unknown_time_s: 0,
    long_run_distance_m: 12000,
  };
}
