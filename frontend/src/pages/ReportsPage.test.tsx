import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LanguageProvider } from '../lib/i18n';
import { ReportsPage } from './ReportsPage';

describe('ReportsPage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('renders weekly report download controls and annual statistics for the current week', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T10:00:00+02:00'));
    vi.stubGlobal('fetch', yearlySummaryFetch());

    renderReportsPage();
    vi.useRealTimers();

    expect(screen.getByRole('heading', { name: 'Reporty' })).toBeInTheDocument();
    expect(await screen.findByText('Naběhnuté kilometry')).toBeInTheDocument();
    expect(await screen.findByText('123.5 km')).toBeInTheDocument();
    expect(screen.getByText('Celkové převýšení')).toBeInTheDocument();
    expect(await screen.findByText('1 234 m')).toBeInTheDocument();
    expect(screen.getByText('Čas běhu')).toBeInTheDocument();
    expect(await screen.findByText('12h 0m')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Týdenní běžecký report' })).toBeInTheDocument();
    expect(screen.getByLabelText('Týden')).toHaveValue('2026-05-18');
    expect(screen.getByRole('button', { name: 'PNG' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /Stáhnout PNG/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/api/v1/analytics/weekly-report.png?week_start_date=2026-05-18'),
    );
  });

  test('updates the weekly report URL when week or format changes', async () => {
    vi.stubGlobal('fetch', yearlySummaryFetch());
    renderReportsPage();

    await userEvent.clear(screen.getByLabelText('Týden'));
    await userEvent.type(screen.getByLabelText('Týden'), '2026-06-01');
    await userEvent.click(screen.getByRole('button', { name: 'SVG' }));

    expect(screen.getByRole('button', { name: 'SVG' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /Stáhnout SVG/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/api/v1/analytics/weekly-report.svg?week_start_date=2026-06-01'),
    );
  });

  test('refetches annual statistics when the selected year changes', async () => {
    const fetchMock = yearlySummaryFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderReportsPage();

    expect(await screen.findByText('123.5 km')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Rok'));
    await userEvent.type(screen.getByLabelText('Rok'), '2025');

    expect(await screen.findByText('98.8 km')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/analytics/yearly-summary?year=2025'),
      expect.any(Object),
    );
  });
});

function renderReportsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LanguageProvider initialLocale="cs-CZ">
          <ReportsPage />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function yearlySummaryFetch() {
  return vi.fn((url: string) => {
    if (url.includes('/analytics/yearly-summary?year=2025')) {
      return Promise.resolve(
        jsonResponse({
          year: 2025,
          distance_m: 98765,
          elevation_gain_m: 987,
          moving_time_s: 36000,
        }),
      );
    }
    return Promise.resolve(
      jsonResponse({
        year: 2026,
        distance_m: 123456,
        elevation_gain_m: 1234,
        moving_time_s: 43200,
      }),
    );
  });
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
