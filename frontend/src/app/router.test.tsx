import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { LanguageProvider } from '../lib/i18n';
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
      <LanguageProvider initialLocale="cs-CZ">
        <MemoryRouter initialEntries={[initialEntry]}>
          <AppRoutes />
        </MemoryRouter>
      </LanguageProvider>
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
    expect(screen.queryByRole('link', { name: /Nastavit vlastníka/i })).not.toBeInTheDocument();
  });

  test('shows public landing language and repository actions', async () => {
    renderRoutes('/');

    const githubLink = screen.getByRole('link', { name: /GitHub/i });
    expect(githubLink).toHaveAttribute('href', 'https://github.com/RadekKrizCorner/running-tracker');
    expect(githubLink).toHaveAttribute('target', '_blank');

    expect(screen.getByRole('button', { name: 'CZ' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));

    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '#overview');
  });

  test('uses smooth scrolling for landing anchor navigation', () => {
    const styles = readFileSync('src/styles.css', 'utf8');

    expect(styles).toMatch(/html\s*\{[^}]*scroll-behavior:\s*smooth;/s);
    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*html\s*\{[^}]*scroll-behavior:\s*auto;/s);
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
