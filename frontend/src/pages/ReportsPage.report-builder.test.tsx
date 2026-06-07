import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('svg{display:block;width:100%;height:auto'));
    expect(preview.parentElement).toHaveClass('report-builder-preview-frame');
    expect(preview).toHaveAttribute('sandbox', '');

    await userEvent.click(screen.getByRole('button', { name: 'Export SVG' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reports/render.svg'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  test('loads updates and deletes a saved Instagram report', async () => {
    const fetchMock = reportBuilderFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderReportsPage();

    expect(await screen.findByRole('heading', { name: 'Uložené reporty' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Načíst Uložený týden' }));

    expect(screen.getByLabelText('Nadpis reportu')).toHaveValue('Uložený týden');
    expect(screen.getByDisplayValue('12,3')).toBeInTheDocument();
    expect(screen.getByLabelText('Týden reportu')).toHaveValue('2026-05-11');

    fireEvent.change(screen.getByLabelText('Nadpis reportu'), { target: { value: 'Aktualizovaný týden' } });
    await userEvent.click(screen.getByRole('button', { name: 'Aktualizovat report' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reports/report-1'),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('Aktualizovaný týden'),
        }),
      );
    });

    await userEvent.click(screen.getByRole('button', { name: 'Smazat Aktualizovaný týden' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reports/report-1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    expect(screen.queryByRole('button', { name: 'Načíst Aktualizovaný týden' })).not.toBeInTheDocument();
  });

  test('edits main metric, volume and footer fields before preview', async () => {
    const fetchMock = reportBuilderFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderReportsPage();

    expect(await screen.findByRole('option', { name: 'Maratonská příprava' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Jednotka hlavní metriky')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Jednotka hlavní metriky'), { target: { value: 'mi' } });
    fireEvent.change(screen.getByLabelText('Popisek hlavní metriky'), { target: { value: 'trailový objem' } });
    fireEvent.change(screen.getByLabelText('Splnění plánu (%)'), { target: { value: '75' } });
    fireEvent.change(screen.getByLabelText('Plánovaný objem'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Skutečný objem'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Patička'), { target: { value: 'trail\nsíla' } });

    await userEvent.click(screen.getByRole('button', { name: 'Náhled SVG' }));

    await waitFor(() => {
      const renderCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/reports/render.svg'));
      expect(renderCall).toBeDefined();
      const body = JSON.parse(String(renderCall?.[1]?.body));
      expect(body.values.main_unit).toBe('mi');
      expect(body.values.main_label).toBe('trailový objem');
      expect(body.values.completion_percent).toBe(75);
      expect(body.values.volume).toMatchObject({ planned: 40, actual: 30, difference: -10 });
      expect(body.values.footer).toEqual(['trail', 'síla']);
      expect(body.template.theme).toBeDefined();
    });
  });

  test('applies selected report visual variant before preview', async () => {
    const fetchMock = reportBuilderFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderReportsPage();

    expect(await screen.findByRole('option', { name: 'Maratonská příprava' })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Vizuální styl'), { target: { value: 'medal_glow' } });

    await userEvent.click(screen.getByRole('button', { name: 'Náhled SVG' }));

    await waitFor(() => {
      const renderCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/reports/render.svg'));
      expect(renderCall).toBeDefined();
      const body = JSON.parse(String(renderCall?.[1]?.body));
      expect(body.template.theme).toMatchObject({ primary: '#B7FF2A', variant: 'medal_glow' });
    });
  });

  test('saves selected report visual variant with a template copy', async () => {
    const fetchMock = reportBuilderFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderReportsPage();

    expect(await screen.findByRole('option', { name: 'Maratonská příprava' })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Vizuální styl'), { target: { value: 'race_bib' } });
    fireEvent.change(screen.getByLabelText('Název šablony'), { target: { value: 'Startovní report' } });

    await userEvent.click(screen.getByRole('button', { name: 'Uložit jako šablonu' }));

    await waitFor(() => {
      const templateCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes('/report-templates') && init?.method === 'POST',
      );
      expect(templateCall).toBeDefined();
      const body = JSON.parse(String(templateCall?.[1]?.body));
      expect(body.name).toBe('Startovní report');
      expect(body.theme).toMatchObject({ primary: '#B7FF2A', variant: 'race_bib' });
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
  const generatedReports = [
    {
      id: 'report-1',
      template_id: 'template-1',
      title: 'Uložený týden',
      period_start: '2026-05-11',
      period_end: '2026-05-17',
      values: {
        ...reportValues(),
        title: 'Uložený týden',
        week: 'Týden 0',
        main_distance: '12,3',
      },
      created_at: '2026-06-06T11:00:00Z',
      updated_at: '2026-06-06T11:00:00Z',
    },
  ];

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
    if (url.includes('/report-templates') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return Promise.resolve(
        jsonResponse({
          id: 'template-created',
          description: null,
          format: 'instagram_story',
          sections: [],
          is_default: false,
          created_at: '2026-06-06T13:00:00Z',
          updated_at: '2026-06-06T13:00:00Z',
          ...body,
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
            theme: { primary: '#B7FF2A' },
            sections: [{ id: 'volume', label: 'Objem týdne' }],
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
    if (url.includes('/reports/report-1') && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      generatedReports[0] = {
        ...generatedReports[0],
        ...body,
        title: body.title,
        updated_at: '2026-06-06T12:00:00Z',
      };
      return Promise.resolve(jsonResponse(generatedReports[0]));
    }
    if (url.includes('/reports/report-1') && init?.method === 'DELETE') {
      generatedReports.splice(0, generatedReports.length);
      return Promise.resolve(new Response(null, { status: 204 }));
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
    if (url.endsWith('/reports')) {
      return Promise.resolve(jsonResponse(generatedReports));
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
    if (url.includes('/reports') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const created = {
        id: 'report-created',
        ...body,
        created_at: '2026-06-06T12:30:00Z',
        updated_at: '2026-06-06T12:30:00Z',
      };
      generatedReports.unshift(created);
      return Promise.resolve(jsonResponse(created));
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
