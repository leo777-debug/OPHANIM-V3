import { FileCheck2 } from "lucide-react";

export default function EvidenceStatus({
  count,
  missing = false,
}: {
  count: number;
  missing?: boolean;
}) {
  return (
    <span
      className={`ops-evidence-status${missing ? " ops-evidence-status--missing" : ""}`}
    >
      <FileCheck2 aria-hidden="true" size={13} />
      {count
        ? `${count} evidence record${count === 1 ? "" : "s"}`
        : missing
          ? "Evidence not recorded"
          : "No evidence recorded"}
    </span>
  );
}
