// The original atlas mark, retained rather than replacing the Ophanim identity.
export default function OphanimMark() {
  return <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
    {[50,35,20].map((r,i)=><circle key={r} cx="60" cy="60" r={r} stroke="#29cfbe" strokeWidth={i===0?2.2:1.4} opacity={.9-i*.2} />)}
    {[0,30,60,90,120,150].map(deg=><line key={deg} x1="60" y1="10" x2="60" y2="110" stroke="#29cfbe" strokeWidth=".8" opacity=".36" transform={`rotate(${deg} 60 60)`} />)}
    {[0,45,90,135,180,225,270,315].map(deg=><circle key={deg} cx={60+Math.cos(deg*Math.PI/180)*35} cy={60+Math.sin(deg*Math.PI/180)*35} r="3.1" fill="#080b0e" stroke="#29cfbe" strokeWidth="1.2" />)}
    <path d="M44 60c6-9 26-9 32 0-6 9-26 9-32 0Z" stroke="#eaf9f4" strokeWidth="1.5" opacity=".88" />
    <circle cx="60" cy="60" r="4.4" fill="#ff608b" />
  </svg>;
}
