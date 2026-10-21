export interface CalibrationBin{lower:number;n:number;predicted:number;observed:number;}
export default function CalibrationChart({bins}:{bins:CalibrationBin[]}){
 if(!bins.length)return <p>No resolved calibration bins yet.</p>;
 return <figure><figcaption>Calibration: predicted probability vs observed frequency</figcaption><svg viewBox="0 0 240 240" role="img" aria-label="Calibration plot; dots near the diagonal indicate agreement between predicted and observed frequency" style={{width:'100%',maxWidth:300}}>
  <path d="M30 15V210H225 M30 210L225 15" fill="none" stroke="#6b8793" strokeDasharray="3 3"/>
  {bins.map((b,i)=><circle key={i} cx={30+195*b.predicted} cy={210-195*b.observed} r={4} fill="#72e0c8"><title>{Math.round(b.predicted*100)}% predicted, {Math.round(b.observed*100)}% observed, n={b.n}</title></circle>)}
  <text x="85" y="233" fill="currentColor" fontSize="10">Predicted probability</text><text x="5" y="15" fill="currentColor" fontSize="10">1</text><text x="15" y="215" fill="currentColor" fontSize="10">0</text>
 </svg><p>Bins with few cases remain uncertain; agreement is not independently verified accuracy.</p></figure>;
}
