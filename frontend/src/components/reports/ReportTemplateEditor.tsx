import { BarChart3, FileText, ListChecks } from 'lucide-react';
import type { ReportValues } from '../../lib/api/types';
import { useTranslation } from '../../lib/i18n';

type ReportTemplateEditorProps = {
  values: ReportValues;
  onChange: (values: ReportValues) => void;
  disabled?: boolean;
};

export function ReportTemplateEditor({ values, onChange, disabled = false }: ReportTemplateEditorProps) {
  const { t } = useTranslation();
  const stats = values.stats ?? {};

  const updateValue = (key: keyof ReportValues, value: string | number | string[]) => {
    onChange({ ...values, [key]: value });
  };
  const updateStats = (key: keyof NonNullable<ReportValues['stats']>, value: string) => {
    onChange({ ...values, stats: { ...stats, [key]: value } });
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
            label={t('reports.builderTitle')}
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
