import { BarChart3, FileText, ListChecks } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { ReportValues } from '../../lib/api/types';
import { useTranslation } from '../../lib/i18n';

type ReportTemplateEditorProps = {
  values: ReportValues;
  onChange: Dispatch<SetStateAction<ReportValues>>;
  disabled?: boolean;
};

export function ReportTemplateEditor({ values, onChange, disabled = false }: ReportTemplateEditorProps) {
  const { t } = useTranslation();
  const stats = values.stats ?? {};
  const volume = values.volume ?? {};

  const updateValue = (key: keyof ReportValues, value: string | number | string[]) => {
    onChange((current) => ({ ...current, [key]: value }));
  };
  const updateStats = (key: keyof NonNullable<ReportValues['stats']>, value: string) => {
    onChange((current) => ({ ...current, stats: { ...(current.stats ?? {}), [key]: value } }));
  };
  const updateVolume = (key: keyof NonNullable<ReportValues['volume']>, value: number) => {
    onChange((current) => ({ ...current, volume: { ...(current.volume ?? {}), [key]: value } }));
  };

  return (
    <div className="report-builder-editor">
      <div className="report-builder-fieldset">
        <div className="report-builder-subheader">
          <FileText size={18} />
          <h3>{t('reports.builderCopy')}</h3>
        </div>
        <div className="report-control-grid">
          <TextField
            disabled={disabled}
            label={t('reports.builderProgram')}
            value={textValue(values.program)}
            onChange={(value) => updateValue('program', value)}
          />
          <TextField
            disabled={disabled}
            label={t('reports.builderReportTitle')}
            value={textValue(values.title)}
            onChange={(value) => updateValue('title', value)}
          />
          <TextField
            disabled={disabled}
            label={t('reports.builderWeekLabel')}
            value={textValue(values.week)}
            onChange={(value) => updateValue('week', value)}
          />
          <TextField
            disabled={disabled}
            label={t('reports.builderMainDistance')}
            value={textValue(values.main_distance)}
            onChange={(value) => updateValue('main_distance', value)}
          />
          <TextField
            disabled={disabled}
            label={t('reports.builderMainUnit')}
            value={textValue(values.main_unit)}
            onChange={(value) => updateValue('main_unit', value)}
          />
          <TextField
            disabled={disabled}
            label={t('reports.builderMainLabel')}
            value={textValue(values.main_label)}
            onChange={(value) => updateValue('main_label', value)}
          />
        </div>
      </div>

      <div className="report-builder-fieldset">
        <div className="report-builder-subheader">
          <BarChart3 size={18} />
          <h3>{t('reports.builderMetrics')}</h3>
        </div>
        <div className="report-control-grid">
          <TextField
            disabled={disabled}
            label={t('reports.builderRuns')}
            value={textValue(stats.runs)}
            onChange={(value) => updateStats('runs', value)}
          />
          <TextField
            disabled={disabled}
            label={t('reports.builderTime')}
            value={textValue(stats.time)}
            onChange={(value) => updateStats('time', value)}
          />
          <TextField
            disabled={disabled}
            label={t('reports.builderPlanActual')}
            value={textValue(stats.plan_vs_actual)}
            onChange={(value) => updateStats('plan_vs_actual', value)}
          />
          <TextField
            disabled={disabled}
            label={t('reports.builderLongestRun')}
            value={textValue(stats.longest_run)}
            onChange={(value) => updateStats('longest_run', value)}
          />
          <TextField
            disabled={disabled}
            label={t('reports.builderAveragePace')}
            value={textValue(stats.avg_pace)}
            onChange={(value) => updateStats('avg_pace', value)}
          />
          <TextField
            disabled={disabled}
            label={t('reports.builderAdherence')}
            value={textValue(stats.training_adherence)}
            onChange={(value) => updateStats('training_adherence', value)}
          />
          <NumberField
            disabled={disabled}
            label={t('reports.builderCompletion')}
            min={0}
            max={100}
            value={numberValue(values.completion_percent)}
            onChange={(value) => updateValue('completion_percent', value)}
          />
          <NumberField
            disabled={disabled}
            label={t('reports.builderPlannedVolume')}
            min={0}
            value={numberValue(volume.planned)}
            onChange={(value) => updateVolume('planned', value)}
          />
          <NumberField
            disabled={disabled}
            label={t('reports.builderActualVolume')}
            min={0}
            value={numberValue(volume.actual)}
            onChange={(value) => updateVolume('actual', value)}
          />
        </div>
      </div>

      <div className="report-builder-fieldset">
        <div className="report-builder-subheader">
          <ListChecks size={18} />
          <h3>{t('reports.builderNarrative')}</h3>
        </div>
        <div className="report-builder-textareas">
          <LinesField
            disabled={disabled}
            label={t('reports.builderSummary')}
            value={values.summary_lines}
            onChange={(value) => updateValue('summary_lines', value)}
          />
          <LinesField
            disabled={disabled}
            label={t('reports.builderWentWell')}
            value={values.went_well}
            onChange={(value) => updateValue('went_well', value)}
          />
          <LinesField
            disabled={disabled}
            label={t('reports.builderFocusNext')}
            value={values.focus_next}
            onChange={(value) => updateValue('focus_next', value)}
          />
          <LinesField
            disabled={disabled}
            label={t('reports.builderFooter')}
            value={values.footer}
            onChange={(value) => updateValue('footer', value)}
          />
        </div>
      </div>
    </div>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

function TextField({ label, value, disabled, onChange }: TextFieldProps) {
  return (
    <label className="report-field">
      <span>{label}</span>
      <input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  disabled: boolean;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
};

function NumberField({ label, value, disabled, min, max, onChange }: NumberFieldProps) {
  return (
    <label className="report-field">
      <span>{label}</span>
      <input
        disabled={disabled}
        max={max}
        min={min}
        type="number"
        value={value}
        onChange={(event) => onChange(clampedNumber(event.target.value, min, max))}
      />
    </label>
  );
}

type LinesFieldProps = {
  label: string;
  value: string[] | undefined;
  disabled: boolean;
  onChange: (value: string[]) => void;
};

function LinesField({ label, value, disabled, onChange }: LinesFieldProps) {
  return (
    <label className="report-field">
      <span>{label}</span>
      <textarea
        disabled={disabled}
        rows={4}
        value={(value ?? []).join('\n')}
        onChange={(event) => onChange(splitLines(event.target.value))}
      />
    </label>
  );
}

function splitLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clampedNumber(value: string, min?: number, max?: number) {
  const parsed = Number(value);
  let next = Number.isFinite(parsed) ? parsed : 0;
  if (typeof min === 'number') {
    next = Math.max(min, next);
  }
  if (typeof max === 'number') {
    next = Math.min(max, next);
  }
  return next;
}
