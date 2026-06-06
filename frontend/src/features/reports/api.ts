import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL, apiRequest } from '../../lib/api/client';
import type {
  GeneratedReport,
  ReportPrefillResponse,
  ReportRenderPayload,
  ReportTemplate,
  ReportTemplatePayload,
  ReportValues,
} from '../../lib/api/types';

export function useReportTemplates() {
  return useQuery({
    queryKey: ['reportTemplates'],
    queryFn: () => apiRequest<ReportTemplate[]>('/report-templates'),
  });
}

export function useCreateReportTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReportTemplatePayload) =>
      apiRequest<ReportTemplate>('/report-templates', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
    },
  });
}

export function useUpdateReportTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; updates: Partial<ReportTemplatePayload> }) =>
      apiRequest<ReportTemplate>(`/report-templates/${payload.id}`, { method: 'PATCH', body: payload.updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
    },
  });
}

export function useDeleteReportTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => apiRequest<void>(`/report-templates/${templateId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reportTemplates'] });
    },
  });
}

export function useReportPrefill() {
  return useMutation({
    mutationFn: (payload: { week_start_date: string; template_id?: string | null }) =>
      apiRequest<ReportPrefillResponse>('/reports/prefill', { method: 'POST', body: payload }),
  });
}

export function useCreateGeneratedReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      template_id?: string | null;
      title: string;
      period_start: string;
      period_end: string;
      values: ReportValues;
    }) => apiRequest<GeneratedReport>('/reports', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generatedReports'] });
    },
  });
}

export async function renderReportSvg(payload: ReportRenderPayload) {
  const response = await renderReport(payload, 'svg');
  return response.text();
}

export async function downloadRenderedReport(payload: ReportRenderPayload, format: 'svg' | 'png') {
  const response = await renderReport(payload, format);
  const blob = await response.blob();
  if (typeof URL.createObjectURL !== 'function') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `instagram-report.${format}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function renderReport(payload: ReportRenderPayload, format: 'svg' | 'png') {
  const response = await fetch(`${API_BASE_URL}/reports/render.${format}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error('Report render failed');
  }
  return response;
}
