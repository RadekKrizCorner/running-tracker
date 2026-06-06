import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiRequest } from '../../lib/api/client';
import type {
  GeneratedReport,
  GeneratedReportPayload,
  ReportPrefillResponse,
  ReportRenderPayload,
  ReportTemplate,
  ReportTemplatePayload,
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
    mutationFn: (payload: GeneratedReportPayload) => apiRequest<GeneratedReport>('/reports', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generatedReports'] });
    },
  });
}

export function useGeneratedReports() {
  return useQuery({
    queryKey: ['generatedReports'],
    queryFn: () => apiRequest<GeneratedReport[]>('/reports'),
  });
}

export function useUpdateGeneratedReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; updates: Partial<GeneratedReportPayload> }) =>
      apiRequest<GeneratedReport>(`/reports/${payload.id}`, { method: 'PATCH', body: payload.updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generatedReports'] });
    },
  });
}

export function useDeleteGeneratedReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) => apiRequest<void>(`/reports/${reportId}`, { method: 'DELETE' }),
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
  return apiFetch(`/reports/render.${format}`, {
    method: 'POST',
    body: payload,
  });
}
