import { CalendarDays, Download, Eye, FileText, Save, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  downloadRenderedReport,
  renderReportSvg,
  useCreateGeneratedReport,
  useCreateReportTemplate,
  useDeleteGeneratedReport,
  useGeneratedReports,
  useReportPrefill,
  useReportTemplates,
  useUpdateGeneratedReport,
} from '../../features/reports/api';
import type {
  GeneratedReport,
  GeneratedReportPayload,
  ReportTemplate,
  ReportTemplateRenderConfig,
  ReportValues,
} from '../../lib/api/types';
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
  const savedReportsQuery = useGeneratedReports();
  const prefill = useReportPrefill();
  const saveReport = useCreateGeneratedReport();
  const updateReport = useUpdateGeneratedReport();
  const deleteReport = useDeleteGeneratedReport();
  const createTemplate = useCreateReportTemplate();
  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : [];
  const savedReports = Array.isArray(savedReportsQuery.data) ? savedReportsQuery.data : [];
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [activeReportId, setActiveReportId] = useState('');
  const [values, setValues] = useState<ReportValues>(defaultReportValues());
  const [theme, setTheme] = useState<Record<string, unknown>>({});
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
      setTheme(templateTheme(firstTemplate.theme));
    }
  }, [selectedTemplateId, templates]);

  const selectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setActiveReportId('');
    const template = templates.find((item) => item.id === templateId);
    if (template) {
      setTemplateName(`${template.name} kopie`);
      setValues(mergeReportValues(defaultReportValues(), template.field_defaults));
      setTheme(templateTheme(template.theme));
      setPreviewSvg('');
    }
  };

  const prefillWeek = async () => {
    const response = await prefill.mutateAsync({
      week_start_date: weekStart,
      template_id: selectedTemplateId || null,
    });
    setValues((current) => mergeReportValues(current, response.values));
    setPreviewSvg('');
  };

  const previewReport = async () => {
    setRendering(true);
    try {
      setPreviewSvg(await renderReportSvg({ values, template: renderTemplateConfig(selectedTemplate, theme) }));
    } finally {
      setRendering(false);
    }
  };

  const exportReport = async (format: 'svg' | 'png') => {
    setRendering(true);
    try {
      await downloadRenderedReport({ values, template: renderTemplateConfig(selectedTemplate, theme) }, format);
    } finally {
      setRendering(false);
    }
  };

  const reportPayload = (): GeneratedReportPayload => ({
    template_id: selectedTemplateId || null,
    title: values.title || t('reports.builderDefaultReportTitle'),
    period_start: weekStart,
    period_end: addDaysToIso(weekStart, 6),
    values,
  });

  const saveCurrentReport = async () => {
    const created = await saveReport.mutateAsync(reportPayload());
    setActiveReportId(created.id);
  };

  const updateCurrentReport = async () => {
    if (!activeReportId) {
      return;
    }
    await updateReport.mutateAsync({ id: activeReportId, updates: reportPayload() });
  };

  const loadSavedReport = (report: GeneratedReport) => {
    setActiveReportId(report.id);
    setSelectedTemplateId(report.template_id ?? '');
    setTemplateName(report.title);
    setValues(mergeReportValues(defaultReportValues(), report.values));
    setTheme(templateTheme(templates.find((template) => template.id === report.template_id)?.theme));
    onWeekStartChange(report.period_start);
    setPreviewSvg('');
  };

  const deleteSavedReport = async (report: GeneratedReport) => {
    await deleteReport.mutateAsync(report.id);
    if (activeReportId === report.id) {
      setActiveReportId('');
    }
  };

  const saveTemplateCopy = async () => {
    const baseTemplate = selectedTemplate ?? defaultTemplate();
    const created = await createTemplate.mutateAsync({
      name: templateName.trim() || t('reports.builderNewTemplate'),
      description: baseTemplate.description,
      format: baseTemplate.format,
      theme,
      sections: baseTemplate.sections,
      field_defaults: values,
      is_default: false,
    });
    setSelectedTemplateId(created.id);
    setTheme(templateTheme(created.theme));
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

      <SavedReportsPanel
        activeReportId={activeReportId}
        reports={savedReports}
        isLoading={savedReportsQuery.isLoading}
        deletingReportId={deleteReport.variables ?? ''}
        onDelete={deleteSavedReport}
        onLoad={loadSavedReport}
      />

      <ReportTemplateEditor
        disabled={prefill.isPending || rendering}
        theme={theme}
        values={values}
        onChange={setValues}
        onThemeChange={setTheme}
      />

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
          {t('reports.builderSaveNewReport')}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!activeReportId || updateReport.isPending}
          onClick={updateCurrentReport}
        >
          <Save size={17} />
          {t('reports.builderUpdateReport')}
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
        <div className="report-builder-preview-frame">
          <iframe
            className="report-builder-preview"
            sandbox=""
            title={t('reports.builderPreviewTitle')}
            srcDoc={previewSvg ? reportPreviewDocument(previewSvg) : ''}
          />
        </div>
      </div>
    </section>
  );
}

type SavedReportsPanelProps = {
  activeReportId: string;
  reports: GeneratedReport[];
  isLoading: boolean;
  deletingReportId: string;
  onLoad: (report: GeneratedReport) => void;
  onDelete: (report: GeneratedReport) => void;
};

function SavedReportsPanel({
  activeReportId,
  reports,
  isLoading,
  deletingReportId,
  onLoad,
  onDelete,
}: SavedReportsPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="report-builder-fieldset">
      <div className="report-builder-subheader">
        <FileText size={18} />
        <h3>{t('reports.builderSavedReports')}</h3>
      </div>
      {isLoading ? <p className="muted-text">{t('reports.builderSavedReportsLoading')}</p> : null}
      {!isLoading && reports.length === 0 ? <p className="muted-text">{t('reports.builderNoSavedReports')}</p> : null}
      {reports.length > 0 ? (
        <div className="report-builder-saved-list">
          {reports.map((report) => (
            <div className={activeReportId === report.id ? 'report-builder-saved-row active' : 'report-builder-saved-row'} key={report.id}>
              <button
                aria-label={t('reports.builderLoadNamedReport', { title: report.title })}
                className="secondary-button"
                type="button"
                onClick={() => onLoad(report)}
              >
                <FileText size={16} />
                {report.title}
              </button>
              <span>
                {report.period_start} - {report.period_end}
              </span>
              <button
                aria-label={t('reports.builderDeleteNamedReport', { title: report.title })}
                className="icon-button danger"
                disabled={deletingReportId === report.id}
                type="button"
                onClick={() => onDelete(report)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
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

function reportPreviewDocument(svg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>html,body{margin:0;min-height:100%;background:#0b1020;}body{display:flex;justify-content:center;align-items:flex-start;}svg{display:block;width:100%;height:auto;max-width:100%;}</style></head><body>${svg}</body></html>`;
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

function renderTemplateConfig(template: ReportTemplate | undefined, theme: Record<string, unknown>): ReportTemplateRenderConfig {
  return {
    theme,
    sections: template?.sections ?? [],
  };
}

function templateTheme(theme: Record<string, unknown> | undefined): Record<string, unknown> {
  return theme ? { ...theme } : {};
}
