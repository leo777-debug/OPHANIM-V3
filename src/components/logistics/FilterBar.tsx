import type { ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";

export default function FilterBar({
  children,
  onReset,
}: {
  children: ReactNode;
  onReset?: () => void;
}) {
  return (
    <div className="ops-filter-bar">
      <SlidersHorizontal aria-hidden="true" size={15} />
      <div className="ops-filter-bar__fields">{children}</div>
      {onReset && (
        <button type="button" className="ops-filter-reset" onClick={onReset}>
          <X aria-hidden="true" size={14} />
          Reset
        </button>
      )}
    </div>
  );
}
