import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type { RouteSuggestionRequest, RouteSuggestionResponse } from '../../lib/api/types';

export function useSuggestLoopRoute() {
  return useMutation({
    mutationFn: (payload: RouteSuggestionRequest) =>
      apiRequest<RouteSuggestionResponse>('/routes/suggest-loop', { method: 'POST', body: payload }),
  });
}
