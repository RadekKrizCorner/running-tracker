import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { addDaysToIso, weekStartIso } from '../lib/date';
import { LanguageProvider } from '../lib/i18n';
import { CalendarPage } from './CalendarPage';

describe('CalendarPage', () => {
  test('renders planned workouts, completed activities, and custom events', async () => {
    const weekStart = weekStartIso();
    const workoutDate = addDaysToIso(weekStart, 1);
    const eventDate = addDaysToIso(weekStart, 2);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/calendar/events')) {
          return Promise.resolve(jsonResponse({ id: 'event-2', event_date: eventDate, event_type: 'race', title: 'New race', notes: null }));
        }
        return Promise.resolve(
          jsonResponse({
            planned_workouts: [
              {
                id: 'planned-1',
                plan_id: null,
                scheduled_date: workoutDate,
                workout_type: 'easy',
                title: 'Easy planned',
                target_duration_s: 2400,
                target_distance_m: 7000,
                target_intensity: 'easy',
                instructions: 'Keep it relaxed.',
                completed_activity_id: null,
                status: 'planned',
              },
            ],
            activities: [
              {
                id: 'activity-1',
                name: 'Completed run',
                date: workoutDate,
                distance_m: 7200,
                moving_time_s: 2500,
                intensity_class: 'easy',
              },
            ],
            events: [{ id: 'event-1', event_date: eventDate, event_type: 'race', title: 'Local 10K race', notes: 'Tune-up.' }],
          }),
        );
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <CalendarPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Easy planned')).toBeInTheDocument();
    expect(screen.getByText('Completed run')).toBeInTheDocument();
    expect(screen.getByText('Local 10K race')).toBeInTheDocument();
    expect(screen.getByText(/1 planned/i)).toBeInTheDocument();
    expect(screen.getByText(/1 completed/i)).toBeInTheDocument();
    expect(screen.getByText(/1 event/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('calendar-day')).toHaveLength(42);
  });

  test('hides a planned workout when its completed activity is shown', async () => {
    const weekStart = weekStartIso();
    const workoutDate = addDaysToIso(weekStart, 1);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            planned_workouts: [
              {
                ...planned('planned-1', workoutDate, 'Easy planned'),
                completed_activity_id: 'activity-1',
              },
            ],
            activities: [
              {
                id: 'activity-1',
                name: 'Completed run',
                date: workoutDate,
                distance_m: 7200,
                moving_time_s: 2500,
                intensity_class: 'easy',
              },
            ],
            events: [],
          }),
        ),
      ),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <CalendarPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Completed run')).toBeInTheDocument();
    expect(screen.queryByText('Easy planned')).not.toBeInTheDocument();
    expect(screen.queryByText(/1 planned/i)).not.toBeInTheDocument();
    expect(screen.getByText(/1 completed/i)).toBeInTheDocument();
  });

  test('switches between week and month calendar grids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            planned_workouts: [],
            activities: [],
            events: [],
          }),
        ),
      ),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <CalendarPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findAllByTestId('calendar-day')).toHaveLength(42);
    await userEvent.click(screen.getByRole('button', { name: /Week/i }));

    expect(await screen.findAllByTestId('calendar-day')).toHaveLength(7);
    expect(screen.getByRole('button', { name: /Month/i })).toBeInTheDocument();
  });

  test('month navigation moves by calendar month from month-end dates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            planned_workouts: [],
            activities: [],
            events: [],
          }),
        ),
      ),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <CalendarPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const dateInput = screen.getByLabelText('Calendar date') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-05-31' } });
    await userEvent.click(screen.getByRole('button', { name: /Previous/i }));

    expect(dateInput.value).toBe('2026-04-30');
    expect(await screen.findAllByTestId('calendar-day')).toHaveLength(42);
  });

  test('visually distinguishes planned runs from rest days', async () => {
    const weekStart = weekStartIso();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            planned_workouts: [
              planned('planned-run', addDaysToIso(weekStart, 1), 'Easy planned', 'easy'),
              planned('planned-rest', addDaysToIso(weekStart, 2), 'Rest day', 'rest'),
            ],
            activities: [],
            events: [],
          }),
        ),
      ),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <CalendarPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const plannedRun = await screen.findByText('Easy planned');
    const restDay = await screen.findByText('Rest day');

    expect(plannedRun.closest('.calendar-item')).toHaveClass('planned', 'run');
    expect(restDay.closest('.calendar-item')).toHaveClass('planned', 'rest');
    expect(screen.getByText('Planned run')).toBeInTheDocument();
    expect(screen.getByText('Rest')).toBeInTheDocument();
  });

  test('opens a day drawer and summarizes hidden month items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            planned_workouts: [
              planned('planned-1', '2026-05-05', 'Easy planned'),
              planned('planned-2', '2026-05-05', 'Tempo planned'),
              planned('planned-3', '2026-05-05', 'Strength planned'),
              planned('planned-4', '2026-05-05', 'Mobility planned'),
            ],
            activities: [
              {
                id: 'activity-1',
                name: 'Completed run',
                date: '2026-05-05',
                distance_m: 7200,
                moving_time_s: 2500,
                intensity_class: 'easy',
              },
            ],
            events: [],
          }),
        ),
      ),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <CalendarPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('Calendar date'), { target: { value: '2026-05-05' } });
    expect(await screen.findByText(/\+2 more/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Open 5\/5\/2026/i }));

    const drawer = screen.getByRole('dialog', { name: /5\/5\/2026/i });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText('Mobility planned')).toBeInTheDocument();
    expect(within(drawer).getByText('Completed run')).toBeInTheDocument();
    expect(within(drawer).getByText(/Quick actions/i)).toBeInTheDocument();
  });

  test('creates a custom race event from the header dialog', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/calendar/events')) {
        expect(init?.method).toBe('POST');
        return Promise.resolve(jsonResponse({ id: 'event-2', event_date: '2026-05-04', event_type: 'race', title: 'New race', notes: null }));
      }
      return Promise.resolve(jsonResponse({ planned_workouts: [], activities: [], events: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider initialLocale="en-US">
          <CalendarPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('heading', { name: /^Add event$/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Add event/i }));
    const dialog = screen.getByRole('dialog', { name: /Add event/i });
    await userEvent.type(within(dialog).getByLabelText('Event title'), 'New race');
    fireEvent.change(within(dialog).getByLabelText('Event date'), { target: { value: '2026-05-04' } });
    await userEvent.selectOptions(within(dialog).getByLabelText('Event type'), 'race');
    await userEvent.click(within(dialog).getByRole('button', { name: /Save event/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/calendar/events'),
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });
  });
});

function planned(id: string, scheduledDate: string, title: string, workoutType = 'easy') {
  return {
    id,
    plan_id: null,
    scheduled_date: scheduledDate,
    workout_type: workoutType,
    title,
    target_duration_s: workoutType === 'rest' ? null : 2400,
    target_distance_m: workoutType === 'rest' ? null : 7000,
    target_intensity: workoutType === 'rest' ? 'rest' : 'easy',
    instructions: workoutType === 'rest' ? 'No running planned.' : 'Keep it relaxed.',
    completed_activity_id: null,
    status: 'planned',
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
