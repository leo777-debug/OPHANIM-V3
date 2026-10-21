export function demurrageExposure(analogs:Array<{delay_hours:number}>,plannedAt:string,lastFreeAt:string,dailyAed:number){
 if(analogs.length<10||!Number.isFinite(dailyAed)||dailyAed<0||![plannedAt,lastFreeAt].every(d=>Number.isFinite(Date.parse(d))))return null;
 const costs=analogs.map(a=>Math.max(0,Math.ceil((Date.parse(plannedAt)+a.delay_hours*3600000-Date.parse(lastFreeAt))/86400000))*dailyAed).sort((a,b)=>a-b);
 const quantile=(p:number)=>costs[Math.min(costs.length-1,Math.floor(p*costs.length))];
 return {n:costs.length,probability:costs.filter(c=>c>0).length/costs.length,expectedAed:costs.reduce((a,b)=>a+b,0)/costs.length,p10:quantile(.1),p50:quantile(.5),p90:quantile(.9)};
}
