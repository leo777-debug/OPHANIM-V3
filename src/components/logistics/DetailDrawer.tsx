import type { ReactNode } from "react";
import { X } from "lucide-react";

export default function DetailDrawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <aside className="ops-detail-drawer" aria-label={title}>
      <header>
        <h2>{title}</h2>
        {onClose && (
          <button
            type="button"
            className="ops-icon-button"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <X aria-hidden="true" size={16} />
          </button>
        )}
      </header>
      <div className="ops-detail-drawer__content">{children}</div>
    </aside>
  );
}
