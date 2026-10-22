import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StoryAnalysis from './StoryAnalysis';
import type { ExplorerData } from './IntelligenceExplorer';

describe('convergence evidence in current and replay displays', () => {
  it('never turns recorded evidence into current convergence alerts', () => {
    const time = new Date().toISOString();
    const data: ExplorerData = {
      news: [{ id:'n',title:'Public fixture report',description:'Synthetic test only',source:'BBC',link:'https://example.invalid/news',published:time,
        risk_score:0,coords:[25,55],coords_default:false,location_precision:'reported',source_data_mode:'fresh' }],
      earthquakes: [{id:'q',place:'Synthetic fixture',magnitude:4,time:Date.parse(time),url:'https://example.invalid/quake',lat:25,lng:55}],
      fires: [{lat:25,lng:55,observedAt:time,title:'Synthetic fire observation'}],
    };
    const current=renderToStaticMarkup(<StoryAnalysis data={data} onLocate={()=>{}}/>);
    expect(current).toContain('Indicative score');
    const replay=renderToStaticMarkup(<StoryAnalysis data={data} onLocate={()=>{}} replay/>);
    expect(replay).toContain('Current convergence detection is disabled');
    expect(replay).not.toContain('Indicative score');
    expect(replay).toContain('Public fixture report');
  });
});
