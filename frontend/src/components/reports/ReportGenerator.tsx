import { CalendarDays, Download, Eye, FileText, Save, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  downloadRenderedReport,
  renderReportSvg,
  useCreateGeneratedReport,
  useCreateReportTemplate,
  useReportPrefill,
  useReportTemplates,
} from '../../features/reports/api';
import type { ReportTemplate, ReportValues } from '../../lib/api/types';
import { addDaysToIso } from '../../lib/date';
import { useTranslation } from '../../lib/i18n';
import { ReportTemplateEditor } from './ReportTemplateEditor';

type ReportGeneratorProps = {
  weekStart: string;
  onWeekStartChange: (value: string) => void;
};

export function ReportGenerator({ weekStart, onWeekStartChange }: ReportGeneratorProps) {
  const { t } = useTranslation();
  const templatesQuery = useReportTemplates();
  const prefill = useReportPrefill();
  const saveReport = useCreateGeneratedReport();
  const createTemplate = useCreateReportTemplate();
  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : [];
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [values, setValues] = useState<ReportValues>(defaultReportValues());
  const [templateName, setTemplateName] = useState('');
  const [previewSvg, setPreviewSvg] = useState('');
  const [rendering, setRendering] = useState(false);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId),
    [selectedTemplateId, templates],
  );

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      const firstTemplate = templates[0];
      setSelectedTemplateId(firstTemplate.id);
      setTemplateName(`${firstTemplate.name} kopie`);
      setValues(mergeReportValues(defaultReportValues(), firstTemplate.field_defaults));
    }
  }, [selectedTemplateId, templates]);

  const selectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (template) {
      setTemplateName(`${template.name} kopie`);
      setValues(mergeReportValues(defaultReportValues(), template.field_defaults));
      setPreviewSvg('');
    }
  };

  const prefillWeek = async () => {
    const response = await prefill.mutateAsync({
      week_start_date: weekStart,
      template_id: selectedTemplateId || null,
    });
    setValues(mergeReportValues(values, response.values));
    setPreviewSvg('');
  };

  const previewReport = async () => {
    setRendering(true);
    try {
      setPreviewSvg(await renderReportSvg({ values }));
    } finally {
      setRendering(false);
    }
  };

  const exportReport = async (format: 'svg' | 'png') => {
    setRendering(true);
    try {
      await downloadRenderedReport({ values }, format);
    } finally {
      setRendering(false);
    }
  };

  const saveCurrentReport = async () => {
    await saveReport.mutateAsync({
      template_id: selectedTemplateId || null,
      title: values.title || t('reports.builderDefaultReportTitle'),
      period_start: weekStart,
      period_end: addDaysToIso(weekStart, 6),
      values,
    });
  };

  const saveTemplateCopy = async () => {
    const baseTemplate = selectedTemplate ?? defaultTemplate();
    const created = await createTemplate.mutateAsync({
      name: templateName.trim() || t('reports.builderNewTemplate'),
      description: baseTemplate.description,
      format: baseTemplate.format,
      theme: baseTemplate.theme,
      sections: baseTemplate.sections,
      field_defaults: values,
      is_default: false,
    });
    setSelectedTemplateId(created.id);
  };

  return (
    <section className="report-builder-panel" aria-label={t('reports.builderTitle')}>
      <div className="report-card-header">
        <div className="report-card-icon">
          <FileText size={22} />
        </div>
        <div>
          <p className="eyebrow">{t('reports.builderEyebrow')}</p>
          <h2>{t('reports.builderTitle')}</h2>
          <p>{t('reports.builderDetail')}</p>
        </div>
      </div>

      <div className="report-builder-toolbar">
        <label className="report-field">
          <span>
            <FileText size={16} />
            {t('reports.builderTemplate')}
          </span>
          <select
            aria-label={t('reports.builderTemplate')}
            disabled={templatesQuery.isLoading}
            value={selectedTemplateId}
            onChange={(event) => selectTemplate(event.target.value)}
          >
            {templates.length === 0 ? <option value="">{t('reports.builderNoTemplates')}</option> : null}
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label className="report-field">
          <span>
            <CalendarDays size={16} />
            {t('reports.builderWeek')}
          </span>
          <input
            aria-label={t('reports.builderWeek')}
            type="date"
            value={weekStart}
            onChange={(event) => onWeekStartChange(event.target.value)}
          />
        </label>
        <button className="primary-button" type="button" disabled={!weekStart || prefill.isPending} onClick={prefillWeek}>
          <Wand2 size={17} />
          {t('reports.builderPrefill')}
        </button>
      </div>

      <ReportTemplateEditor values={values} onChange={setValues} disabled={prefill.isPending || rendering} />

      <div className="report-builder-save-row">
        <label className="report-field">
          <span>{t('reports.builderTemplateName')}</span>
          <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
        </label>
        <button className="secondary-button" type="button" disabled={createTemplate.isPending} onClick={saveTemplateCopy}>
          <Save size={17} />
          {t('reports.builderSaveTemplate')}
        </button>
        <button className="secondary-button" type="button" disabled={saveReport.isPending} onClick={saveCurrentReport}>
          <Save size={17} />
          {t('reports.builderSaveReport')}
        </button>
      </div>

      <div className="report-builder-preview-row">
        <div className="report-builder-actions">
          <button className="primary-button" type="button" disabled={rendering} onClick={previewReport}>
            <Eye size={17} />
            {t('reports.builderPreviewSvg')}
          </button>
          <button className="secondary-button" type="button" disabled={rendering} onClick={() => exportReport('svg')}>
            <Download size={17} />
            {t('reports.builderExportSvg')}
          </button>
          <button className="secondary-button" type="button" disabled={rendering} onClick={() => exportReport('png')}>
            <Download size={17} />
            {t('reports.builderExportPng')}
          </button>
        </div>
        <iframe className="report-builder-preview" title={t('reports.builderPreviewTitle')} srcDoc={previewSvg} />
      </div>
    </section>
  );
}

function defaultReportValues(): ReportValues {
  return {
    program: 'MARATONSKÁ PŘÍPRAVA',
    title: 'Týdenní běžecký report',
    week: 'Týden 1',
    main_distance: '0,0',
    main_unit: 'km',
    main_label: 'naběháno tento týden',
    completion_percent: 0,
    stats: {
      runs: '0',
      time: '0 h 00 min',
      plan_vs_actual: '0,0 / 0,0 km',
      longest_run: '0,0 km',
      avg_pace: '0:00 min/km',
      training_adherence: '0/0',
    },
    volume: { planned: 0, actual: 0, difference: 0 },
    summary_lines: [],
    went_well: [],
    focus_next: [],
    footer: ['Běžecký plán', 'konzistence', 'vytrvalost', 'maraton 2026'],
  };
}

function mergeReportValues(base: ReportValues, next: ReportValues): ReportValues {
  return {
    ...base,
    ...next,
    stats: { ...base.stats, ...next.stats },
    volume: { ...base.volume, ...next.volume },
  };
}

function defaultTemplate(): ReportTemplate {
  return {
    id: '',
    name: 'Maratonská příprava',
    description: null,
    format: 'instagram_story',
    theme: {},
    sections: [],
    field_defaults: defaultReportValues(),
    is_default: false,
    created_at: '',
    updated_at: '',
  };
}
