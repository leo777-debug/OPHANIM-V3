import type { ReactNode } from "react";

export default function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="ops-empty-state">
      <p className="ops-empty-state__title">{title}</p>
      <p className="ops-empty-state__detail">{detail}</p>
      {action && <div className="ops-empty-state__action">{action}</div>}
    </div>
  );
}
