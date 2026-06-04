import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type { Notification, NotificationSummary } from '../../lib/api/types';

export function useNotificationSummary() {
  return useQuery({
    queryKey: ['notificationSummary'],
    queryFn: () => apiRequest<NotificationSummary>('/notifications/summary'),
    refetchInterval: 30_000,
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<Notification[]>('/notifications'),
    enabled,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      apiRequest<Notification>(`/notifications/${notificationId}/read`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationSummary'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationSummary'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => apiRequest<void>(`/notifications/${notificationId}`, { method: 'DELETE' }),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ['notificationSummary'] });
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const previousNotifications = queryClient.getQueryData<Notification[]>(['notifications']);
      const previousSummary = queryClient.getQueryData<NotificationSummary>(['notificationSummary']);
      const deletedNotification = previousNotifications?.find((notification) => notification.id === notificationId);

      queryClient.setQueryData<Notification[]>(['notifications'], (current) =>
        current ? current.filter((notification) => notification.id !== notificationId) : current,
      );
      if (previousSummary && deletedNotification?.read_at === null) {
        queryClient.setQueryData<NotificationSummary>(['notificationSummary'], {
          unread_count: Math.max(0, previousSummary.unread_count - 1),
        });
      }

      return { previousNotifications, previousSummary };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(['notifications'], context.previousNotifications);
      }
      if (context?.previousSummary) {
        queryClient.setQueryData(['notificationSummary'], context.previousSummary);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationSummary'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
