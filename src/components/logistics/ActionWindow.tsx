"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { isoDate } from "@/lib/logistics/client";

function remaining(deadline: string, now: number): string {
  const milliseconds = new Date(deadline).getTime() - now;
  if (!Number.isFinite(milliseconds)) return "Action deadline unavailable";
  if (milliseconds <= 0) return "Deadline passed";
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  return `${days ? `${days}d ` : ""}${hours}h ${minutes}m remaining`;
}

export default function ActionWindow({
  deadline,
  label = "Current action window",
}: {
  deadline?: string;
  label?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const initialTimer = window.setTimeout(updateNow, 0);
    const intervalTimer = window.setInterval(updateNow, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
    };
  }, []);
  if (!deadline)
    return (
      <span className="ops-action-window ops-action-window--unknown">
        <Clock3 aria-hidden="true" size={14} />
        Action deadline unavailable
      </span>
    );
  const text =
    now === null ? `Deadline ${isoDate(deadline)}` : remaining(deadline, now);
  return (
    <span className="ops-action-window" aria-label={`${label}: ${text}`}>
      <Clock3 aria-hidden="true" size={14} />
      <span>
        <small>{label}</small>
        {text}
      </span>
    </span>
  );
}
