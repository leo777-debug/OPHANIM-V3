import ShipmentWorkspace from '@/components/ShipmentWorkspace';

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <ShipmentWorkspace shipmentId={(await params).id} />;
}
