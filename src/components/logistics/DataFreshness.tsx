import { RefreshCw } from "lucide-react";
import { isoDate } from "@/lib/logistics/client";

export default function DataFreshness({
  updatedAt,
  onRefresh,
  busy = false,
}: {
  updatedAt?: string;
  onRefresh?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="ops-freshness">
      <span>Last refresh {isoDate(updatedAt)}</span>
      {onRefresh && (
        <button
          type="button"
          className="ops-icon-button"
          onClick={onRefresh}
          disabled={busy}
          aria-label="Refresh operational data"
        >
          <RefreshCw
            aria-hidden="true"
            size={15}
            className={busy ? "animate-spin" : ""}
          />
        </button>
      )}
    </div>
  );
}
