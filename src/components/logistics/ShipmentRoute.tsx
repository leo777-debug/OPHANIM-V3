import { ArrowRight } from "lucide-react";

export default function ShipmentRoute({
  origin,
  destination,
  transshipments = [],
}: {
  origin?: string;
  destination?: string;
  transshipments?: string[];
}) {
  const stops = [origin, ...transshipments, destination].filter(
    (stop): stop is string => Boolean(stop),
  );
  if (stops.length === 0)
    return (
      <span className="ops-route ops-route--unknown">Route unavailable</span>
    );
  return (
    <span className="ops-route">
      {stops.map((stop, index) => (
        <span key={`${stop}-${index}`} className="ops-route__stop">
          {index > 0 && <ArrowRight aria-hidden="true" size={13} />}
          {stop}
        </span>
      ))}
    </span>
  );
}
