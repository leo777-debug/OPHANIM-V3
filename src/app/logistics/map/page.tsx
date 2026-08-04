import { Suspense } from "react";
import LogisticsMapWorkspace from "@/components/logistics/LogisticsMapWorkspace";

export default function LogisticsMapPage() {
  return (
    <Suspense fallback={null}>
      <LogisticsMapWorkspace />
    </Suspense>
  );
}
