export const DOCUMENT_FIELDS: Record<string,string[]> = {
  extract_awb: ['awb_number','shipper','consignee','origin_airport','destination_airport','pieces','gross_weight_kg','flight_number','departure_date'],
  extract_bill_of_lading: ['bl_number','shipper','consignee','container_number','port_of_loading','port_of_discharge','vessel','voyage','pieces','gross_weight_kg'],
  extract_invoice: ['invoice_number','seller','buyer','currency','total_amount','pieces','invoice_date'],
  extract_packing_list: ['reference','shipper','consignee','pieces','gross_weight_kg','net_weight_kg'],
  extract_booking_confirmation: ['booking_number','carrier','origin','destination','departure_date','arrival_date','cutoff_date'],
  extract_arrival_notice: ['reference','carrier','place','arrival_date','free_time_end','pieces'],
  extract_delivery_order: ['order_number','reference','consignee','release_date','delivery_place','pieces'],
};
export const TASK_SCHEMAS: Record<string,unknown> = {
  ...Object.fromEntries(Object.entries(DOCUMENT_FIELDS).map(([task,fields])=>[task,Object.fromEntries(fields.map(f=>[f,'value or null']))])),
  understand_email: { references:['reference'],milestones:[{type:'milestone type',date:'date or null'}],deadlines:['date'],requested_actions:['action'] },
  classify_document: { document_type:'string',confidence:'number 0..1' },
  grounded_qa: { statements:[{label:'FACT or NOT FOUND',text:'verbatim evidence quote or not-found message',quote:'same evidence quote',citations:['chunk id']}] },
  parse_claim: { claim_type:'string',place:'string or null',time_window:{start:null,end:null},entities:[] },
  explain_mistake: { explanation:'one or two plain-language sentences in requested language' },
  flag_incident: { is_incident:'boolean',type:'string or null',severity:'low|moderate|high|unknown',place:null,time:null,entities:[],confidence:'number 0..1' },
  summarise_event: { summary:'neutral text with citation ids',confirmed:[{text:'confirmed fact',citations:['source id']}],reported:[{text:'reported claim',citations:['source id']}],unknown:['unknown detail'],timeline:[{time:'source timestamp',event:'event',citations:['source id']}] },
  forecast: { label:'FORECAST',question:'string',time_horizon:'string',outcomes:[{outcome:'possible outcome',uncertainty:'uncertainty'}],uncertainty:'string',evidence:['source id'],would_change_outlook:['new evidence'] },
  parse_watch: { places:['place'],dates:['date'],routes:[{origin:'place or airport',destination:'place or airport'}],topics:['topic'] },
};
