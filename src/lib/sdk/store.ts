export interface SdkEntity {
  id: string;
  organizationId: string;
  [key: string]: unknown;
}
export interface SdkIngestion { organizationId: string; source: string; count: number; timestamp: string }
export function sdkStore() {
  const state=globalThis as typeof globalThis & {sdkEntityStore?:Map<string,SdkEntity>;sdkLastUpdate?:number;sdkIngestLog?:SdkIngestion[]};
  state.sdkEntityStore ??=new Map();state.sdkLastUpdate ??=Date.now();state.sdkIngestLog ??=[];
  return {entities:state.sdkEntityStore,log:state.sdkIngestLog,get version(){return state.sdkLastUpdate!;},touch(){state.sdkLastUpdate=Date.now();}};
}
export function organizationSdkEntities(organizationId:string) {
  return [...sdkStore().entities.values()].filter((entity)=>entity.organizationId===organizationId);
}
