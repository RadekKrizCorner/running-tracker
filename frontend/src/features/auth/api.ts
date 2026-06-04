import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type { User } from '../../lib/api/types';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiRequest<User>('/auth/me'),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; password: string }) =>
      apiRequest<User>('/auth/login', { method: 'POST', body: payload }),
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  });
}

export function useSetupOwner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; password: string }) =>
      apiRequest<User>('/auth/setup-owner', { method: 'POST', body: payload }),
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => queryClient.clear(),
  });
}

