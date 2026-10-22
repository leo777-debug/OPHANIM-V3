import { NextResponse } from 'next/server';
import { db } from '@/lib/watchlists/db';
export async function GET(){
 if(!process.env.DATABASE_URL)return NextResponse.json({receipts:[],notice:'No scored public receipts yet.'});
 try{return NextResponse.json({receipts:(await db().query('select * from ophanim_public_receipts order by month desc limit 120')).rows},{headers:{'Cache-Control':'public, max-age=300'}});}
 catch{return NextResponse.json({error:'Receipts unavailable.'},{status:503});}
}
