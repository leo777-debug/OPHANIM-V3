import { isFeatureEnabled } from '@/lib/operations/feature-flags';
import { ImportError, type ImportType } from './types';

export function assertImportFeature(importType: ImportType): void {
  if (!isFeatureEnabled('imports')) throw new ImportError('Imports are unavailable in this Ophanim edition.');
  if (importType === 'shipment' && !isFeatureEnabled('logistics')) throw new ImportError('Shipment imports require the Logistics edition.');
  if (importType !== 'shipment' && !isFeatureEnabled('cyber')) throw new ImportError('Cyber imports require the Cyber edition.');
}
