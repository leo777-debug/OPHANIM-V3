import type { ReactNode } from "react";
import Link from "next/link";

export default function OperationalStat({
  label,
  value,
  detail,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  href?: string;
  tone?: "neutral" | "attention" | "critical";
}) {
  const content: ReactNode = (
    <>
      <span className="ops-stat__label">{label}</span>
      <strong className="ops-stat__value">{value}</strong>
      <span className="ops-stat__detail">{detail}</span>
    </>
  );
  return href ? (
    <Link className={`ops-stat ops-stat--${tone}`} href={href}>
      {content}
    </Link>
  ) : (
    <div className={`ops-stat ops-stat--${tone}`}>{content}</div>
  );
}
