import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LanguageProvider } from '../lib/i18n';
import { ReportsPage } from './ReportsPage';

describe('ReportsPage report builder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('prefills previews and exports an Instagram report from a template', async () => {
    const fetchMock = reportBuilderFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderReportsPage();

    expect(await screen.findByRole('heading', { name: 'Instagram report builder' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Maratonská příprava' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Předvyplnit týden' }));

    expect(await screen.findByDisplayValue('25,4')).toBeInTheDocument();
    expect(screen.getByDisplayValue('46,0 / 25,4 km')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Náhled SVG' }));

    const preview = await screen.findByTitle('Náhled reportu');
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('<svg'));
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('25,4'));

    await userEvent.click(screen.getByRole('button', { name: 'Export SVG' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reports/render.svg'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
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

function reportBuilderFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/analytics/yearly-summary')) {
      return Promise.resolve(
        jsonResponse({
          year: 2026,
          distance_m: 123456,
          elevation_gain_m: 1234,
          moving_time_s: 43200,
        }),
      );
    }
    if (url.includes('/report-templates')) {
      return Promise.resolve(
        jsonResponse([
          {
            id: 'template-1',
            name: 'Maratonská příprava',
            description: 'Výchozí šablona',
            format: 'instagram_story',
            theme: {},
            sections: [],
            field_defaults: {
              title: 'Týdenní běžecký report',
              main_unit: 'km',
            },
            is_default: true,
            created_at: '2026-06-06T10:00:00Z',
            updated_at: '2026-06-06T10:00:00Z',
          },
        ]),
      );
    }
    if (url.includes('/reports/prefill')) {
      expect(init?.method).toBe('POST');
      return Promise.resolve(
        jsonResponse({
          template_id: 'template-1',
          period_start: '2026-05-18',
          period_end: '2026-05-24',
          values: reportValues(),
        }),
      );
    }
    if (url.includes('/reports/render.svg')) {
      expect(init?.method).toBe('POST');
      return Promise.resolve(
        new Response('<svg><text>25,4</text></svg>', {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml' },
        }),
      );
    }
    return Promise.resolve(jsonResponse({}));
  });
}

function reportValues() {
  return {
    program: 'MARATONSKÁ PŘÍPRAVA',
    title: 'Týdenní běžecký report',
    week: 'Týden 1',
    main_distance: '25,4',
    main_unit: 'km',
    main_label: 'naběháno tento týden',
    completion_percent: 55,
    stats: {
      runs: '3',
      time: '3 h 06 min',
      plan_vs_actual: '46,0 / 25,4 km',
      longest_run: '9,0 km',
      avg_pace: '7:20 min/km',
      training_adherence: '3/5',
    },
    volume: { planned: 46.0, actual: 25.4, difference: -20.6 },
    summary_lines: ['Solidní týden se třemi běhy.'],
    went_well: ['pravidelný pohyb'],
    focus_next: ['držet pravidelnost'],
    footer: ['Běžecký plán', 'konzistence'],
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
