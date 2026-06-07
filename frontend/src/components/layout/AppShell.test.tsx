import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { toIsoDate } from '../../lib/date';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  test('opens mobile more navigation for secondary routes', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(jsonResponse(responseForAppShellUrl(url)))));
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/trends']}>
          <AppShell user={{ id: 'u1', email: 'owner@example.com', display_name: null, timezone: 'Europe/Prague', units: 'metric' }}>
            <div>Page content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /Více/i }));

    const moreMenu = screen.getByRole('dialog', { name: /Další navigace/i });
    expect(within(moreMenu).getByRole('link', { name: /Události/i })).toBeInTheDocument();
    expect(within(moreMenu).getByRole('link', { name: /Reporty/i })).toBeInTheDocument();
    expect(within(moreMenu).getByRole('link', { name: /Trendy/i })).toBeInTheDocument();
    expect(within(moreMenu).queryByRole('link', { name: /Vybavení/i })).not.toBeInTheDocument();
    expect(within(moreMenu).getByRole('link', { name: /Nastavení/i })).toBeInTheDocument();
    expect(within(moreMenu).getByRole('button', { name: /Odhlásit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Více/i })).toHaveClass('active');
  });

  test('scrolls to the top after changing pages', async () => {
    const scrollToMock = vi.fn();
    vi.stubGlobal('scrollTo', scrollToMock);
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(jsonResponse(responseForAppShellUrl(url)))));
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell user={{ id: 'u1', email: 'owner@example.com', display_name: null, timezone: 'Europe/Prague', units: 'metric' }}>
            <div>Page content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    scrollToMock.mockClear();
    await userEvent.click(screen.getByRole('link', { name: /Trendy/i }));

    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  test('shows unread notifications near the profile area and links to activity notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/notifications/n1/read')) {
          expect(init?.method).toBe('POST');
          return Promise.resolve(jsonResponse({ ...notificationFixture, read_at: '2026-05-05T07:00:00Z' }));
        }
        if (url.includes('/notifications/summary')) {
          return Promise.resolve(jsonResponse({ unread_count: 1 }));
        }
        if (url.includes('/notifications')) {
          return Promise.resolve(jsonResponse([notificationFixture]));
        }
        return Promise.resolve(jsonResponse(responseForAppShellUrl(url)));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell user={{ id: 'u1', email: 'owner@example.com', display_name: null, timezone: 'Europe/Prague', units: 'metric' }}>
            <div>Page content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const notificationsButton = await screen.findByRole('button', { name: /Notifikace, 1 nepřečtená/i });
    expect(notificationsButton).toBeInTheDocument();
    await userEvent.click(notificationsButton);

    const panel = screen.getByRole('dialog', { name: /Notifikace/i });
    const link = within(panel).getByRole('link', { name: /Add notes to Morning run/i });
    expect(link).toHaveAttribute('href', '/activities/activity-1?focus=notes');
    await userEvent.click(link);
  });

  test('opens avatar picker and saves a generated icon choice', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/profile/preferences') && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({
          avatar_icon: 'runner_route',
          avatar_image_data_url: null,
        });
        return Promise.resolve(jsonResponse({ ...preferencesFixture, avatar_icon: 'runner_route' }));
      }
      return Promise.resolve(jsonResponse(responseForAppShellUrl(url)));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell user={{ id: 'u1', email: 'owner@example.com', display_name: null, timezone: 'Europe/Prague', units: 'metric' }}>
            <div>Page content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /Upravit profilovou ikonu/i }));
    const dialog = screen.getByRole('dialog', { name: /Profilová ikona/i });
    await userEvent.click(within(dialog).getByRole('button', { name: /Běžec s trasou/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Uložit/i }));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/profile/preferences'), expect.objectContaining({ method: 'PATCH' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Profilová ikona/i })).not.toBeInTheDocument());
  });

  test('deletes notifications from the popover', async () => {
    let deleted = false;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/notifications/n1') && init?.method === 'DELETE') {
        deleted = true;
        return Promise.resolve(noContentResponse());
      }
      if (url.includes('/notifications/summary')) {
        return Promise.resolve(jsonResponse({ unread_count: deleted ? 0 : 1 }));
      }
      if (url.includes('/notifications')) {
        return Promise.resolve(jsonResponse(deleted ? [] : [notificationFixture]));
      }
      return Promise.resolve(jsonResponse(responseForAppShellUrl(url)));
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell user={{ id: 'u1', email: 'owner@example.com', display_name: null, timezone: 'Europe/Prague', units: 'metric' }}>
            <div>Page content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /Notifikace, 1 nepřečtená/i }));
    expect(screen.getByText(/Add notes to Morning run/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Odstranit/i }));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/notifications/n1'), expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByText(/Add notes to Morning run/i)).not.toBeInTheDocument());
  });

  test('keeps notification popover above page content when it extends past the sidebar', () => {
    const styles = readFileSync('src/styles.css', 'utf8');
    const sidebarLayer = Number(cssDeclaration(styles, '.sidebar', 'z-index'));
    const popoverLayer = Number(cssDeclaration(styles, '.notification-popover', 'z-index'));

    expect(cssDeclaration(styles, '.sidebar', 'position')).toBe('sticky');
    expect(Number.isFinite(sidebarLayer)).toBe(true);
    expect(sidebarLayer).toBeGreaterThanOrEqual(30);
    expect(cssDeclaration(styles, '.notification-popover', 'position')).toBe('fixed');
    expect(popoverLayer).toBeGreaterThan(sidebarLayer);
  });

  test('keeps the notification bell away from its button border', () => {
    const styles = readFileSync('src/styles.css', 'utf8');

    expect(cssDeclaration(styles, '.notification-button', 'width')).toBe('42px');
    expect(cssDeclaration(styles, '.notification-button', 'height')).toBe('42px');
    expect(cssDeclaration(styles, '.notification-button', 'padding')).toBe('10px');
    expect(cssDeclaration(styles, '.brand > div:not(.brand-actions)', 'min-width')).toBe('0');
    expect(cssDeclaration(styles, '.brand-actions', 'margin-right')).toBe('12px');
  });

  test('shows today plan details in the sidebar route card', async () => {
    const today = toIsoDate(new Date());
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/calendar')) {
          return Promise.resolve(
            jsonResponse({
              plan: null,
              planned_workouts: [
                {
                  id: 'planned-1',
                  plan_id: null,
                  scheduled_date: today,
                  workout_type: 'easy',
                  title: '',
                  target_duration_s: 2400,
                  target_distance_m: 7000,
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
        return Promise.resolve(jsonResponse(responseForAppShellUrl(url)));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell user={{ id: 'u1', email: 'owner@example.com', display_name: null, timezone: 'Europe/Prague', units: 'metric' }}>
            <div>Page content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Lehký běh 7 km/i)).toBeInTheDocument();
  });

  test('shows demo badge and disables shell mutation controls for demo sessions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/notifications/summary')) {
          return Promise.resolve(jsonResponse({ unread_count: 1 }));
        }
        if (url.includes('/notifications')) {
          return Promise.resolve(jsonResponse([notificationFixture]));
        }
        return Promise.resolve(jsonResponse(responseForAppShellUrl(url)));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell user={{ id: 'u1', email: 'demo@example.com', display_name: 'Portfolio Demo', timezone: 'Europe/Prague', units: 'metric', is_demo: true }}>
            <div>Page content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/^Demo$/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Upravit profilovou ikonu/i })).toBeDisabled();
    await userEvent.click(await screen.findByRole('button', { name: /Notifikace/i }));

    const panel = screen.getByRole('dialog', { name: /Notifikace/i });
    expect(within(panel).queryByRole('button', { name: /Označit vše jako přečtené/i })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Odstranit/i })).toBeDisabled();
  });

  test('shows multiple today sessions in the sidebar route card', async () => {
    const today = toIsoDate(new Date());
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/calendar')) {
          return Promise.resolve(
            jsonResponse({
              plan: null,
              planned_workouts: [
                {
                  id: 'planned-1',
                  plan_id: null,
                  scheduled_date: today,
                  session_label: 'Morning',
                  sort_order: 0,
                  workout_type: 'tempo',
                  title: 'Threshold intervals',
                  target_duration_s: 2700,
                  target_distance_m: null,
                  target_intensity: 'hard',
                  instructions: null,
                  completed_activity_id: null,
                  status: 'planned',
                },
                {
                  id: 'planned-2',
                  plan_id: null,
                  scheduled_date: today,
                  session_label: 'Afternoon',
                  sort_order: 1,
                  workout_type: 'tempo',
                  title: 'Threshold tempo',
                  target_duration_s: 2700,
                  target_distance_m: null,
                  target_intensity: 'hard',
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
        return Promise.resolve(jsonResponse(responseForAppShellUrl(url)));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell user={{ id: 'u1', email: 'owner@example.com', display_name: null, timezone: 'Europe/Prague', units: 'metric' }}>
            <div>Page content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/2 tréninky dnes/i)).toBeInTheDocument();
    expect(screen.getByText(/Morning · Threshold intervals/i)).toBeInTheDocument();
  });

  test('shows completed message in the sidebar route card after a run today', async () => {
    const today = toIsoDate(new Date());
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/calendar')) {
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
              activities: [{ id: 'activity-1', name: 'Morning run', date: today, distance_m: 7100, moving_time_s: 2500, intensity_class: 'easy' }],
              events: [],
            }),
          );
        }
        return Promise.resolve(jsonResponse(responseForAppShellUrl(url)));
      }),
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppShell user={{ id: 'u1', email: 'owner@example.com', display_name: null, timezone: 'Europe/Prague', units: 'metric' }}>
            <div>Page content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Dobrá práce, dneska hotovo/i)).toBeInTheDocument();
  });
});

const notificationFixture = {
  id: 'n1',
  type: 'activity_notes_reminder',
  title: 'Add notes to Morning run',
  body: 'Morning run was synced. Add notes while it is fresh.',
  action_url: '/activities/activity-1?focus=notes',
  action_label: 'Add notes',
  source_type: 'activity',
  source_id: 'activity-1',
  read_at: null,
  created_at: '2026-05-05T06:00:00Z',
};

const preferencesFixture = {
  locale: 'cs-CZ',
  dashboard_mode: 'advanced',
  favorite_template_ids: [],
  recent_template_ids: [],
  pace_zones: [],
  elevation_correction_enabled: false,
  elevation_correction_mode: 'only_when_zero',
  elevation_provider_url: null,
  avatar_icon: null,
  avatar_image_data_url: null,
};

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
  };
}

function noContentResponse() {
  return {
    ok: true,
    status: 204,
    headers: new Headers(),
    json: () => Promise.resolve(null),
  };
}

function responseForAppShellUrl(url: string) {
  if (url.includes('/notifications/summary')) {
    return { unread_count: 0 };
  }
  if (url.includes('/notifications')) {
    return [];
  }
  if (url.includes('/calendar')) {
    return { plan: null, planned_workouts: [], activities: [], events: [] };
  }
  if (url.includes('/profile/preferences')) {
    return preferencesFixture;
  }
  return {};
}

function cssDeclaration(styles: string, selector: string, property: string) {
  const selectorPattern = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`));
  const declaration = match?.[1].match(new RegExp(`${property}\\s*:\\s*([^;]+)`));
  return declaration?.[1].trim();
}
