import { Link2, ScanSearch } from "lucide-react";
import { label } from "@/lib/logistics/client";

export default function ExposureBadge({
  status,
  confidence,
}: {
  status?: string;
  confidence?: number;
}) {
  if (!status)
    return (
      <span className="ops-exposure ops-exposure--unknown">
        <ScanSearch aria-hidden="true" size={13} />
        Not assessed
      </span>
    );
  return (
    <span className={`ops-exposure ops-exposure--${status}`}>
      <Link2 aria-hidden="true" size={13} />
      {label(status)}
      {confidence !== undefined ? ` · ${confidence}% confidence` : ""}
    </span>
  );
}
