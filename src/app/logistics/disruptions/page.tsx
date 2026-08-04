import { Suspense } from "react";
import DisruptionWorkspace from "@/components/DisruptionWorkspace";

export default function LogisticsDisruptionsPage() {
  return (
    <Suspense fallback={null}>
      <DisruptionWorkspace />
    </Suspense>
  );
}
