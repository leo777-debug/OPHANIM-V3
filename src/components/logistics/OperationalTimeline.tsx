import {
  CheckCircle2,
  CircleDashed,
  Clock3,
  TriangleAlert,
} from "lucide-react";
import { isoDate } from "@/lib/logistics/client";

export type TimelineEvent = {
  id: string;
  label: string;
  at?: string;
  state: "completed" | "upcoming" | "delayed" | "missed" | "unknown";
  detail?: string;
};

const icons = {
  completed: CheckCircle2,
  upcoming: Clock3,
  delayed: TriangleAlert,
  missed: TriangleAlert,
  unknown: CircleDashed,
};

export default function OperationalTimeline({
  events,
}: {
  events: TimelineEvent[];
}) {
  if (!events.length)
    return <p className="ops-muted">No operational milestones recorded.</p>;
  return (
    <ol className="ops-timeline">
      {events.map((event) => {
        const Icon = icons[event.state];
        return (
          <li
            key={event.id}
            className={`ops-timeline__item ops-timeline__item--${event.state}`}
          >
            <Icon aria-hidden="true" size={15} />
            <div>
              <strong>{event.label}</strong>
              <span>{event.at ? isoDate(event.at) : "Date unavailable"}</span>
              {event.detail && <small>{event.detail}</small>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
