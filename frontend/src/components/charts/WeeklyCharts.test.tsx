import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { DurabilityChart, EasyRunEfficiencyChart, IntensityChart, WeeklyLoadChart, WeeklyLoadVolumeChart, buildDurabilityChartData } from './WeeklyCharts';
import type { WeeklyMetric } from '../../lib/api/types';
import { LanguageProvider } from '../../lib/i18n';

const weekly: WeeklyMetric[] = [
  {
    week_start_date: '2026-04-27',
    distance_m: 12000,
    moving_time_s: 4200,
    elevation_gain_m: 120,
    run_count: 2,
    load: 140,
    acute_load: 140,
    chronic_load: 120,
    ramp_ratio: 1.16,
    easy_time_s: 2400,
    moderate_time_s: 1200,
    hard_time_s: 600,
    unknown_time_s: 0,
    long_run_distance_m: 7000,
  },
];

describe('WeeklyCharts', () => {
  test('renders weekly load volume chart with distance and time context', () => {
    render(<LanguageProvider initialLocale="en-US"><WeeklyLoadVolumeChart weekly={weekly} /></LanguageProvider>);

    expect(screen.getByRole('heading', { name: /Weekly load/i })).toBeInTheDocument();
    expect(screen.getByText(/Distance \(km\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Time \(h\)/i)).toBeInTheDocument();
  });

  test('renders load chart with load legend context', () => {
    render(<LanguageProvider initialLocale="en-US"><WeeklyLoadChart weekly={weekly} /></LanguageProvider>);

    expect(screen.getByText(/Load trend/i)).toBeInTheDocument();
    expect(screen.getByText(/Weekly load/i)).toBeInTheDocument();
    expect(screen.getByText(/4-week baseline/i)).toBeInTheDocument();
  });

  test('renders durability chart with long-run context', () => {
    render(<LanguageProvider initialLocale="en-US"><DurabilityChart weekly={weekly} /></LanguageProvider>);

    expect(screen.getByText(/Durability/i)).toBeInTheDocument();
    expect(screen.getByText(/Longest run \(km\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Long-run share/i)).toBeInTheDocument();
  });

  test('maps missing durability weeks to zero long-run share', () => {
    const data = buildDurabilityChartData([
      weekly[0],
      {
        ...weekly[0],
        week_start_date: '2026-05-04',
        distance_m: 0,
        long_run_distance_m: 0,
      },
    ]);

    expect(data[1]).toMatchObject({
      long_run_km: 0,
      long_run_share: 0,
    });
  });

  test('renders easy-run efficiency chart with pace and heart-rate context', () => {
    render(
      <LanguageProvider initialLocale="en-US">
        <EasyRunEfficiencyChart points={[{ date: '2026-04-27', pace_s_per_km: 345, average_hr: 138, elevation_gain_per_km: 6 }]} />
      </LanguageProvider>,
    );

    expect(screen.getByText(/Easy-run efficiency trend/i)).toBeInTheDocument();
    expect(screen.getByText(/Pace/i)).toBeInTheDocument();
    expect(screen.getByText(/Heart rate/i)).toBeInTheDocument();
  });

  test('renders intensity chart with all split labels', () => {
    render(<LanguageProvider initialLocale="en-US"><IntensityChart weekly={weekly} /></LanguageProvider>);

    expect(screen.getByText(/Easy/i)).toBeInTheDocument();
    expect(screen.getByText(/Moderate/i)).toBeInTheDocument();
    expect(screen.getByText(/Hard/i)).toBeInTheDocument();
    expect(screen.getByText(/Unknown/i)).toBeInTheDocument();
  });
});
