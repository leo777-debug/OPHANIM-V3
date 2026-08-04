import { LifeBuoy } from "lucide-react";
import { label } from "@/lib/logistics/client";

export default function RescueStatus({ status }: { status?: string }) {
  return (
    <span
      className={`ops-rescue-status ops-rescue-status--${status ?? "none"}`}
    >
      <LifeBuoy aria-hidden="true" size={13} />
      {status ? label(status) : "No rescue case"}
    </span>
  );
}
