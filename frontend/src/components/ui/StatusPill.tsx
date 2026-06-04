import type { ReactNode } from 'react';

type StatusPillProps = {
  tone?: 'neutral' | 'easy' | 'moderate' | 'hard' | 'warning' | 'success';
  children: ReactNode;
};

export function StatusPill({ tone = 'neutral', children }: StatusPillProps) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
