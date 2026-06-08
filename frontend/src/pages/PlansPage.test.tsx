import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import { addDaysToIso, weekStartIso } from '../lib/date';
import { formatShortDate } from '../lib/format';
import { LanguageProvider } from '../lib/i18n';
import type { AppLocale } from '../lib/i18n';
import { PlansPage } from './PlansPage';

describe('PlansPage', () => {
  test('saves a week from a selected workout template', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([workoutTemplate()]));
      }
      if (url.includes('/calendar/week')) {
        return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPlansPage();

    expect(await screen.findByRole('heading', { name: /Weekly plan/i })).toBeInTheDocument();
    await applyTemplateFromLibrary('Easy run');
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

  test('opens a day editor modal from the long-term plan and shows clear Czech labels', async () => {
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
    renderPlansPage('cs-CZ');

    const dialog = await openLongTermDay('Tue', weekStartIso(), /Otevřít út/i, /Upravit út/i);

    expect(within(dialog).getByText('Tréninkové cíle')).toBeInTheDocument();
    expect(within(dialog).getByText('Vzdálenost')).toBeInTheDocument();
    expect(within(dialog).getByText('Čas')).toBeInTheDocument();
    expect(within(dialog).getByText('Cílová vzdálenost běhu')).toBeInTheDocument();
    expect(within(dialog).getByText('Cílový čas tréninku')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Vzdálenost.*km/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Čas.*min/i)).toBeInTheDocument();
  });

  test('organizes the day editor into a day overview quick actions and session cards', async () => {
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
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');

    expect(within(dialog).getByRole('heading', { name: /Day setup/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /Quick actions/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /Planned sessions/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/Plan concrete work for/i)).toBeInTheDocument();
    expect(dialog.querySelector('.day-editor-session-card')).not.toBeNull();
  });

  test('supports day editor quick actions for easy run rest and clear', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([workoutTemplate()]));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add easy run/i }));
    expect(within(dialog).getByDisplayValue('Easy run')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: /Mark whole day rest/i }));
    expect(within(dialog).getByDisplayValue('Rest day')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: /Clear whole day/i }));
    expect(within(dialog).getByLabelText(/Title .* 1/i)).toHaveValue('');

    await userEvent.click(within(dialog).getByRole('button', { name: /Add easy run/i }));
    expect(within(dialog).getByDisplayValue('Easy run')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  test('updates the long-term day tile immediately after editing a day', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([workoutTemplate()]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add easy run/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Close day editor/i }));

    const weekRow = await screen.findByTestId(`long-term-week-${weekStartIso()}`);
    expect(within(weekRow).getByRole('button', { name: /Open Mon, Easy run/i })).toBeInTheDocument();
    expect(within(weekRow).queryByRole('button', { name: /Open Mon, Unscheduled/i })).not.toBeInTheDocument();
  });

  test('keeps edits for multiple weeks and saves each changed week', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const currentWeek = weekStartIso();
    const nextWeek = weekStartIso(addDaysToIso(currentWeek, 7));
    const nextTuesday = addDaysToIso(nextWeek, 1);
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('/calendar/week') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
      }
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([workoutTemplate()]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPlansPage();

    const currentDialog = await openLongTermDay('Mon');
    await userEvent.click(within(currentDialog).getByRole('button', { name: /Add easy run/i }));
    await userEvent.click(within(currentDialog).getByRole('button', { name: /Close day editor/i }));

    const nextWeekRow = await screen.findByTestId(`long-term-week-${nextWeek}`);
    await userEvent.click(within(nextWeekRow).getByRole('button', { name: /Open Tue, Unscheduled/i }));
    const nextDialog = await screen.findByRole('dialog', { name: /Edit Tue/i });
    await userEvent.click(within(nextDialog).getByRole('button', { name: /Add easy run/i }));
    await userEvent.click(within(nextDialog).getByRole('button', { name: /Close day editor/i }));

    expect(within(await screen.findByTestId(`long-term-week-${currentWeek}`)).getByRole('button', { name: /Open Mon, Easy run/i })).toBeInTheDocument();
    expect(within(await screen.findByTestId(`long-term-week-${nextWeek}`)).getByRole('button', { name: /Open Tue, Easy run/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(calls.filter(([url, init]) => url.includes('/calendar/week') && init?.method === 'POST')).toHaveLength(2));
    const saveBodies = calls
      .filter(([url, init]) => url.includes('/calendar/week') && init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init?.body)));

    expect(saveBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          week_start_date: currentWeek,
          workouts: [expect.objectContaining({ scheduled_date: currentWeek, template_id: 'easy-template' })],
        }),
        expect.objectContaining({
          week_start_date: nextWeek,
          workouts: [expect.objectContaining({ scheduled_date: nextTuesday, template_id: 'easy-template' })],
        }),
      ]),
    );
  });

  test('shows favorite templates in day editor quick actions and applies them', async () => {
    const preferenceBodies: unknown[] = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/profile/preferences') && init?.method === 'PATCH') {
        preferenceBodies.push(JSON.parse(String(init.body)));
        return Promise.resolve(
          jsonResponse({
            locale: 'cs-CZ',
            dashboard_mode: 'advanced',
            favorite_template_ids: ['long-template'],
            recent_template_ids: ['long-template'],
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
        return Promise.resolve(jsonResponse([workoutTemplate(), workoutTemplate('long-template', 'Long run', 'long', 5400, 14000)]));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');
    const quickActions = dialog.querySelector('.day-editor-actions') as HTMLElement;

    expect(quickActions).not.toBeNull();
    await userEvent.click(within(quickActions).getByRole('button', { name: /Add favorite template Long run/i }));

    expect(within(dialog).getByDisplayValue('Long run')).toBeInTheDocument();
    await waitFor(() => expect(preferenceBodies).toContainEqual(expect.objectContaining({ recent_template_ids: ['long-template'] })));
  });

  test('adds a double threshold day as two labeled sessions and saves them', async () => {
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
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add double threshold/i }));

    expect(within(dialog).getByDisplayValue('Morning')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Threshold intervals')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Afternoon')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Threshold tempo')).toBeInTheDocument();

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

  test('adds a race session from calendar events and saves it as a planned race workout', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const currentWeek = weekStartIso();
    const raceEvents = [
      calendarEvent('event-1', currentWeek, 'Prague 10K'),
      calendarEvent('event-2', currentWeek, 'Night trail'),
    ];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('/calendar/week') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
      }
      if (url.includes('/workout-templates')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: raceEvents }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add race/i }));
    await userEvent.selectOptions(within(dialog).getByLabelText(new RegExp(`Race event ${currentWeek} 1`, 'i')), 'event-2');

    expect(within(dialog).getByDisplayValue('Night trail')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(new RegExp(`Workout type ${currentWeek} 1`, 'i'))).toHaveValue('race');
    expect(within(dialog).getByLabelText(new RegExp(`Intensity ${currentWeek} 1`, 'i'))).toHaveValue('race');

    await userEvent.click(screen.getByRole('button', { name: /Save week/i }));

    await waitFor(() => expect(calls.some(([url, init]) => url.includes('/calendar/week') && init?.method === 'POST')).toBe(true));
    const saveCall = calls.find(([url, init]) => url.includes('/calendar/week') && init?.method === 'POST');
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.workouts).toHaveLength(1);
    expect(body.workouts[0]).toEqual(
      expect.objectContaining({
        scheduled_date: currentWeek,
        title: 'Night trail',
        workout_type: 'race',
        target_intensity: 'race',
        instructions: expect.stringContaining('Night trail'),
      }),
    );
  });

  test('deletes one session without clearing the rest of the day', async () => {
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
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add double threshold/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Delete session 2/i }));

    expect(within(dialog).getByDisplayValue('Threshold intervals')).toBeInTheDocument();
    expect(within(dialog).queryByDisplayValue('Threshold tempo')).not.toBeInTheDocument();
  });

  test('moves one selected session to another day', async () => {
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
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add double threshold/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Move session 2 later/i }));

    const tuesdayDialog = screen.getByRole('dialog', { name: /Edit Tue/i });
    expect(within(tuesdayDialog).getByDisplayValue('Threshold tempo')).toBeInTheDocument();
    expect(within(tuesdayDialog).queryByDisplayValue('Threshold intervals')).not.toBeInTheDocument();
  });

  test('adds the requested session to the workout pool', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('/workout-pool') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(workoutPoolItem('pool-threshold', 'Threshold tempo')));
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
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add double threshold/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Add session 2 to pool/i }));

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
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add easy run/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Mark whole day rest/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/delete 1 planned session/i));
    expect(within(dialog).getByDisplayValue('Easy run')).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(within(dialog).getByRole('button', { name: /Mark whole day rest/i }));
    expect(within(dialog).getByDisplayValue('Rest day')).toBeInTheDocument();
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
    renderPlansPage();

    const saveButton = await screen.findByRole('button', { name: /Save week/i });
    expect(saveButton).toBeDisabled();

    const dialog = await openLongTermDay('Mon');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add easy run/i }));

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
        return Promise.resolve(jsonResponse([workoutTemplate()]));
      }
      if (url.includes('/profile/preferences')) {
        return Promise.resolve(jsonResponse(defaultPreferences()));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPlansPage();

    expect(await screen.findByText(/Read-only demo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save week/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Copy previous week/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy to next week/i })).not.toBeInTheDocument();

    const library = await openTemplateLibrary();
    expect(within(library).getByRole('button', { name: /^Add$/i })).toBeDisabled();
    expect(within(library).getByRole('button', { name: /Use Easy run on selected day/i })).toBeDisabled();
    expect(calls.some(([url, init]) => url.includes('/calendar/week') && init?.method === 'POST')).toBe(false);
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
    renderPlansPage();

    const dialog = await openLongTermDay('Mon');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add double threshold/i }));

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
        return Promise.resolve(jsonResponse([workoutTemplate(), workoutTemplate('long-template', 'Long run', 'long', 5400, 14000)]));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPlansPage();

    const library = await openTemplateLibrary();
    await userEvent.click(within(library).getByRole('button', { name: /Favorite Easy run/i }));
    await userEvent.click(within(library).getByRole('button', { name: /Use Easy run on selected day/i }));

    await waitFor(() => expect(preferenceBodies.length).toBeGreaterThanOrEqual(2));
    expect(preferenceBodies).toContainEqual(
      expect.objectContaining({ favorite_template_ids: expect.arrayContaining(['long-template', 'easy-template']) }),
    );
    expect(preferenceBodies).toContainEqual(expect.objectContaining({ recent_template_ids: ['easy-template'] }));
  });

  test('schedules an unscheduled workout pool item on the selected day', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.includes('/workout-pool/pool-1/schedule')) {
        return Promise.resolve(jsonResponse(plannedWorkout('planned-from-pool', weekStartIso(), 'Pool easy', 'easy', 2400, 6000)));
      }
      if (url.includes('/workout-pool')) {
        return Promise.resolve(jsonResponse([workoutPoolItem('pool-1', 'Pool easy')]));
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
    renderPlansPage();

    const library = await openTemplateLibrary();
    await userEvent.click(await within(library).findByRole('button', { name: /Schedule Pool easy on selected day/i }));

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
        return Promise.resolve(jsonResponse(workoutTemplate('new-template', 'Short easy', 'easy', 1800, 5000)));
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
    renderPlansPage();

    const library = await openTemplateLibrary();
    await userEvent.click(within(library).getByRole('button', { name: /^Add$/i }));
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

  test('shows long-term weekly rows with planned day summaries and mileage time outlook', async () => {
    const currentWeek = weekStartIso();
    const nextWeek = weekStartIso(addDaysToIso(currentWeek, 7));
    const nextTuesday = addDaysToIso(nextWeek, 1);
    const longTermEnd = addDaysToIso(currentWeek, 83);
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/analytics/recent-weeks?weeks=6')) {
        return Promise.resolve(
          jsonResponse([
            weeklyMetric(addDaysToIso(currentWeek, -14), 82, 18000, 7200),
            weeklyMetric(addDaysToIso(currentWeek, -7), 96, 22000, 8400),
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
            planned_workouts: [plannedWorkout('future-long', nextTuesday, 'Long run', 'long', 5400, 14000)],
            activities: [],
            events: [],
          }),
        );
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPlansPage();

    expect(await screen.findByRole('heading', { name: /Long-term plan/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Mileage and time outlook/i })).toBeInTheDocument();
    expect(screen.getByText(/Actual distance/i)).toBeInTheDocument();
    expect(screen.getByText(/Planned distance/i)).toBeInTheDocument();
    expect(screen.getByText(/Actual time/i)).toBeInTheDocument();
    expect(screen.getByText(/Planned time/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Planned load outlook/i })).not.toBeInTheDocument();

    const futureWeekRow = await screen.findByTestId(`long-term-week-${nextWeek}`);
    expect(within(futureWeekRow).getByText(compactWeekRange(nextWeek))).toBeInTheDocument();
    expect(within(futureWeekRow).getByText('Long run')).toBeInTheDocument();
    expect(within(futureWeekRow).getAllByText('14.0 km').length).toBeGreaterThan(0);
    expect(within(futureWeekRow).getAllByText('1h 30m').length).toBeGreaterThan(0);
    expect(futureWeekRow.querySelector('.long-term-summary-distance')).toHaveTextContent('14.0 km');
    expect(futureWeekRow.querySelector('.long-term-summary-time')).toHaveTextContent('1h 30m');
    expect(within(futureWeekRow).getByRole('button', { name: /Open Tue, Long run/i })).toHaveClass('long-term-day-button');
  });

  test('maps rest recovery long run and race plan types to the updated long-term colors', () => {
    const css = readFileSync('src/styles.css', 'utf8');

    expect(css).toMatch(/\.long-term-day-button\.type-recovery\s*{[^}]*border-top-color:\s*var\(--blue\)/s);
    expect(css).toMatch(/\.long-term-day-button\.type-rest,\s*\.long-term-day-button\.rest\s*{[^}]*border-top-color:\s*var\(--blue\)/s);
    expect(css).toMatch(/\.long-term-day-button\.type-long\s*{[^}]*border-top-color:\s*var\(--amber\)/s);
    expect(css).toMatch(/\.long-term-day-button\.type-race\s*{[^}]*border-top-color:\s*#[0-9a-fA-F]{6}/s);
  });

  test('keeps long-term week label and summary compact so day tiles get more width', () => {
    const css = readFileSync('src/styles.css', 'utf8');

    expect(cssDeclaration(css, '.planning-long-term-layout', 'grid-template-columns')).toBe('minmax(320px, 0.75fr) minmax(0, 1.25fr)');
    expect(cssDeclaration(css, '.long-term-week-row', 'grid-template-columns')).toBe('76px minmax(0, 1fr) 78px');
    expect(cssDeclaration(css, '.long-term-week-row', 'gap')).toBe('5px');
    expect(cssDeclaration(css, '.long-term-day-grid', 'gap')).toBe('4px');
    expect(cssDeclaration(css, '.long-term-summary-row', 'white-space')).toBe('nowrap');
    expect(css).toMatch(/\.long-term-week-summary\s*{[^}]*text-align:\s*right;/s);
    expect(css).toMatch(/@media \(max-width: 980px\)[\s\S]*?\.long-term-week-row\s*\{\s*grid-template-columns:\s*76px minmax\(0, 1fr\);/);
  });

  test('keeps simplified long-term planning controls on the main page', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/analytics/recent-weeks?weeks=6')) {
        return Promise.resolve(jsonResponse([]));
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
    renderPlansPage();

    expect(await screen.findByRole('heading', { name: /Long-term plan/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy previous week/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy to next week/i })).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('week-board-day')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: /Template library/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Plan title/i)).toHaveAttribute('readonly');

    const dialog = await openTemplateLibrary();
    expect(within(dialog).getByRole('heading', { level: 2, name: /Template library/i })).toBeInTheDocument();
  });

  test('opens a future long-term day in the day editor and saves that week without shifting the horizon', async () => {
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
    renderPlansPage();

    const futureWeekRow = await screen.findByTestId(`long-term-week-${futureWeek}`);
    await userEvent.click(within(futureWeekRow).getByRole('button', { name: /Open Wed, Unscheduled/i }));

    const dialog = await screen.findByRole('dialog', { name: /Edit Wed/i });
    expect(screen.getByTestId(`long-term-week-${currentWeek}`)).toBeInTheDocument();
    expect(screen.getByTestId(`long-term-week-${futureWeek}`)).toBeInTheDocument();
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

function renderPlansPage(initialLocale: AppLocale = 'en-US') {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider initialLocale={initialLocale}>
        <PlansPage />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

async function openLongTermDay(dayName = 'Mon', weekStart = weekStartIso(), buttonName: RegExp | null = null, dialogName: RegExp | null = null) {
  const weekRow = await screen.findByTestId(`long-term-week-${weekStart}`);
  await userEvent.click(within(weekRow).getByRole('button', { name: buttonName ?? new RegExp(`Open ${dayName},`, 'i') }));
  return screen.findByRole('dialog', { name: dialogName ?? new RegExp(`Edit ${dayName}`, 'i') });
}

async function openTemplateLibrary() {
  await userEvent.click(await screen.findByRole('button', { name: /^Template library$/i }));
  return screen.findByRole('dialog', { name: /Template library/i });
}

async function applyTemplateFromLibrary(templateName: string) {
  const library = await openTemplateLibrary();
  await userEvent.click(await within(library).findByRole('button', { name: new RegExp(`Use ${templateName} on selected day`, 'i') }));
  await userEvent.click(within(library).getByRole('button', { name: /Close template library/i }));
}

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

function workoutTemplate(id = 'easy-template', name = 'Easy run', workoutType = 'easy', durationS = 2700, distanceM = 7000) {
  return {
    id,
    name,
    workout_type: workoutType,
    title: name,
    target_duration_s: durationS,
    target_distance_m: distanceM,
    target_intensity: 'easy',
    instructions: 'Run easy.',
  };
}

function workoutPoolItem(id: string, title: string) {
  return {
    id,
    source_template_id: null,
    workout_type: title.includes('Threshold') ? 'tempo' : 'easy',
    title,
    target_duration_s: title.includes('Threshold') ? 2700 : 2400,
    target_distance_m: title.includes('Threshold') ? null : 6000,
    target_intensity: title.includes('Threshold') ? 'hard' : 'easy',
    instructions: 'Ready to schedule.',
  };
}

function plannedWorkout(id: string, date: string, title: string, workoutType: string, durationS: number, distanceM: number) {
  return {
    id,
    plan_id: null,
    scheduled_date: date,
    workout_type: workoutType,
    title,
    target_duration_s: durationS,
    target_distance_m: distanceM,
    target_intensity: 'easy',
    instructions: null,
    completed_activity_id: null,
    status: 'planned',
  };
}

function calendarEvent(id: string, date: string, title: string, eventType = 'race') {
  return {
    id,
    event_date: date,
    event_type: eventType,
    title,
    notes: 'Race day note.',
    source_type: 'event',
    source_id: id,
  };
}

function weeklyMetric(weekStartDate: string, load: number, distanceM = 30000, movingTimeS = 10800) {
  return {
    week_start_date: weekStartDate,
    distance_m: distanceM,
    moving_time_s: movingTimeS,
    elevation_gain_m: 250,
    run_count: 4,
    load,
    acute_load: load,
    chronic_load: load * 4,
    ramp_ratio: 1,
    easy_time_s: Math.round(movingTimeS * 0.67),
    moderate_time_s: Math.round(movingTimeS * 0.22),
    hard_time_s: Math.round(movingTimeS * 0.11),
    unknown_time_s: 0,
    long_run_distance_m: 12000,
  };
}

function compactWeekRange(weekStart: string) {
  return `${compactShortDate(weekStart)}-${compactShortDate(addDaysToIso(weekStart, 6))}`;
}

function compactShortDate(value: string) {
  return formatShortDate(value).replace(/\s+/g, '');
}

function cssDeclaration(styles: string, selector: string, property: string) {
  const selectorPattern = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`));
  const declaration = match?.[1].match(new RegExp(`${property}\\s*:\\s*([^;]+)`));
  return declaration?.[1].trim();
}
