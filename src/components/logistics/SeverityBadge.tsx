import { AlertTriangle, CircleAlert, Eye, Info } from "lucide-react";
import { label } from "@/lib/logistics/client";

type Severity =
  | "critical"
  | "high"
  | "medium"
  | "moderate"
  | "low"
  | "monitoring"
  | string
  | undefined;

export default function SeverityBadge({ value }: { value: Severity }) {
  const normalized = value === "moderate" ? "medium" : (value ?? "monitoring");
  const Icon =
    normalized === "critical"
      ? AlertTriangle
      : normalized === "high"
        ? CircleAlert
        : normalized === "monitoring"
          ? Eye
          : Info;
  return (
    <span className={`ops-severity ops-severity--${normalized}`}>
      <Icon aria-hidden="true" size={13} />
      {label(normalized)}
    </span>
  );
}
