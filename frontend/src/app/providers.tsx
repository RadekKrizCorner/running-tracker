import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './queryClient';
import { APP_BASE_PATH } from '../lib/routes';
import { LanguageProvider } from '../lib/i18n';

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <BrowserRouter basename={APP_BASE_PATH} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          {children}
        </BrowserRouter>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
