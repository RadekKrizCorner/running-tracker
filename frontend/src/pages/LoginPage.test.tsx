import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  test('submits owner credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          id: 'user-id',
          email: 'owner@example.com',
          display_name: null,
          timezone: 'Europe/Prague',
          units: 'metric',
        }),
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
    await userEvent.type(screen.getByLabelText(/E-mail/i), 'owner@example.com');
    await userEvent.type(screen.getByLabelText(/Heslo/i), 'passwordpassword');
    await userEvent.click(screen.getByRole('button', { name: /Přihlásit/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});
