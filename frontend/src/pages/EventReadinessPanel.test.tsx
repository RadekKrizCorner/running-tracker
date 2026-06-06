import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { EventReadinessPanel } from '../components/events/EventReadinessPanel';
import { LanguageProvider } from '../lib/i18n';

describe('EventReadinessPanel', () => {
  test('renders transparent event readiness metrics', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(readinessFixture())));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <LanguageProvider initialLocale="en-US">
          <EventReadinessPanel eventId="event-1" />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: /Event readiness dashboard/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/events/event-1/readiness'),
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(screen.getByText(/33 days/i)).toBeInTheDocument();
    expect(screen.getAllByText('5:00/km').length).toBeGreaterThan(0);
    expect(screen.getByText('27.0 km')).toBeInTheDocument();
    expect(screen.getByText('360')).toBeInTheDocument();
    expect(screen.getByText(/3 runs/i)).toBeInTheDocument();
    expect(screen.getByText('18.0 km')).toBeInTheDocument();
    expect(screen.getByText(/Long run covers 180%/i)).toBeInTheDocument();
    expect(screen.getByText('23.0 km')).toBeInTheDocument();
    expect(screen.getByText(/2 sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/1 missed/i)).toBeInTheDocument();
    expect(screen.getByText(/Easy/i)).toBeInTheDocument();
    expect(screen.getByText(/Moderate/i)).toBeInTheDocument();
    expect(screen.getByText(/Hard/i)).toBeInTheDocument();
    expect(screen.getByText(/Unknown/i)).toBeInTheDocument();
    expect(screen.getByText(/Plan to event/i)).toBeInTheDocument();
    expect(screen.getByText(/Long run is close/i)).toBeInTheDocument();
    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.queryByText('success')).not.toBeInTheDocument();
    expect(screen.queryByText('warning')).not.toBeInTheDocument();
    expect(screen.queryByText('neutral')).not.toBeInTheDocument();
  });
});

function readinessFixture() {
  return {
    event_id: 'event-1',
    phase: 'build',
    days_until_start: 33,
    target_pace_s_per_km: 300,
    recent_4w_distance_m: 27000,
    recent_4w_load: 360,
    recent_4w_run_count: 3,
    longest_run_8w_m: 18000,
    long_run_event_distance_ratio: 1.8,
    planned_distance_to_event_m: 23000,
    planned_load_to_event: 500,
    planned_sessions_to_event: 2,
    missed_planned_sessions: 1,
    intensity_mix: {
      easy_time_s: 3000,
      moderate_time_s: 5400,
      hard_time_s: 1200,
      unknown_time_s: 0,
    },
    readiness_items: [
      {
        key: 'target_pace',
        label: 'Target pace',
        value: '5:00/km',
        detail: 'Target time divided by event distance.',
        status: 'good',
      },
      {
        key: 'future_plan',
        label: 'Plan to event',
        value: '23.0 km / 2',
        detail: 'Planned running sessions from today through event day.',
        status: 'good',
      },
    ],
    guidance_messages: [
      {
        tone: 'success',
        title: 'Long run is close',
        detail: 'Your recent long run is already near the event distance.',
      },
      {
        tone: 'warning',
        title: 'Sharpen taper plan',
        detail: 'Reduce load before race week if fatigue rises.',
      },
      {
        tone: 'neutral',
        title: 'Course notes',
        detail: 'Keep course logistics visible in the event details.',
      },
    ],
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
