import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';

type DrawerProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Drawer({ title, open, onClose, children }: DrawerProps) {
  const { t } = useTranslation();
  if (!open) {
    return null;
  }
  return (
    <div className="drawer-backdrop">
      <aside aria-label={title} className="drawer-panel" role="dialog">
        <header>
          <h2>{title}</h2>
          <button aria-label={t('common.close')} className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}
