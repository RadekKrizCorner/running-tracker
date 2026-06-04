import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  test('submits owner credentials', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/auth/options')) {
        return Promise.resolve(jsonResponse({ demo_enabled: false }));
      }
      return Promise.resolve(
        jsonResponse({
          id: 'user-id',
          email: 'owner@example.com',
          display_name: null,
          timezone: 'Europe/Prague',
          units: 'metric',
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: /Přihlášení/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use demo account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Nastavit heslo vlastníka/i })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/E-mail/i), 'owner@example.com');
    await userEvent.type(screen.getByLabelText(/Heslo/i), 'passwordpassword');
    await userEvent.click(screen.getByRole('button', { name: /Přihlásit/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  test('hides demo login when backend reports demo disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ demo_enabled: false })));
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: /Přihlášení/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use demo account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Nastavit heslo vlastníka/i })).not.toBeInTheDocument();
  });

  test('starts a demo session from the demo button', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/auth/options')) {
        return Promise.resolve(jsonResponse({ demo_enabled: true }));
      }
      return Promise.resolve(
        jsonResponse({
          id: 'demo-user-id',
          email: 'demo@example.com',
          display_name: 'Portfolio Demo',
          timezone: 'Europe/Prague',
          units: 'metric',
          is_demo: true,
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /Use demo account/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/demo-login'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(payload),
  };
}
