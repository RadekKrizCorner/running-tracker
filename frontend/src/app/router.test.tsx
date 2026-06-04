import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { AppRoutes } from './router';

const authState = vi.hoisted(() => ({
  useMeResult: {
    isLoading: false,
    isError: true,
    data: undefined,
  },
}));

vi.mock('../features/auth/api', async () => {
  const actual = await vi.importActual<typeof import('../features/auth/api')>('../features/auth/api');

  return {
    ...actual,
    useMe: () => authState.useMeResult,
  };
});

function renderRoutes(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppRoutes', () => {
  test('renders the public landing page at the root route', () => {
    renderRoutes('/');

    expect(screen.getByRole('heading', { name: /Running Tracker/i })).toBeInTheDocument();
    const loginLinks = screen.getAllByRole('link', { name: /Pokračovat k přihlášení/i });
    expect(loginLinks).toHaveLength(2);
    loginLinks.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });

  test('navigates from the landing page to login', async () => {
    renderRoutes('/');

    const loginLinks = screen.getAllByRole('link', { name: /Pokračovat k přihlášení/i });
    await userEvent.click(loginLinks[0]);

    expect(screen.getByRole('heading', { name: /Přihlášení/i })).toBeInTheDocument();
  });

  test('keeps dashboard protected for signed-out visitors', async () => {
    renderRoutes('/dashboard');

    expect(screen.getByRole('heading', { name: /Přihlášení/i })).toBeInTheDocument();
  });
});
