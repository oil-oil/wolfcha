/** Ivory bone and a few ink contours; the purple belongs to the poison around it. */
export function PoisonSkull({ id }: { id: string }) {
  return <>
    <defs>
      <linearGradient id={id + "-bone"} x1="0.2" y1="0" x2="0.8" y2="1"><stop stopColor="#fff5dd" /><stop offset="0.34" stopColor="#e6d6b8" /><stop offset="0.72" stopColor="#b8a180" /><stop offset="1" stopColor="#74604e" /></linearGradient>
      <linearGradient id={id + "-jaw"} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f4e9ce" /><stop offset="0.58" stopColor="#ceb994" /><stop offset="1" stopColor="#8c735b" /></linearGradient>
      <radialGradient id={id + "-socket"} cx="48%" cy="35%"><stop stopColor="#662287" /><stop offset="0.56" stopColor="#321340" /><stop offset="1" stopColor="#180d24" /></radialGradient>
      <radialGradient id={id + "-bubble"} cx="31%" cy="25%"><stop stopColor="#ead0ff" stopOpacity="0.42" /><stop offset="0.35" stopColor="#ac56d9" stopOpacity="0.17" /><stop offset="0.8" stopColor="#673090" stopOpacity="0.38" /><stop offset="1" stopColor="#cf91ff" stopOpacity="0.64" /></radialGradient>
    </defs>
    <g data-skill-core className="wc-skill-core">
    <g data-skull-sway className="wc-skull-sway">
      <path d="M150 208c-17-24-21-61-6-87 13-23 37-34 66-34s53 11 66 34c15 26 11 63-6 87l-13 12-3 24-16 13h-56l-16-13-3-24z" fill={"url(#" + id + "-bone)"} stroke="#34291f" strokeWidth="3" strokeLinejoin="round" />
      <path d="M143 154c-1-29 21-52 52-56m20 0c23 1 41 14 50 33" fill="none" stroke="#fff8e5" strokeWidth="2.3" strokeLinecap="round" opacity="0.75" />
      <path d="M149 204l20 15 9 25-12-2-4-21zm122 0-20 15-9 25 12-2 4-21z" fill="#705742" opacity="0.7" />
      <path d="M160 179c10-12 28-11 40-2l-4 24c-13 11-35 4-37-8zM260 179c-10-12-28-11-40-2l4 24c13 11 35 4 37-8z" fill={"url(#" + id + "-socket)"} stroke="#47332d" strokeWidth="2.4" />
      <path d="M156 176c11-9 26-11 44-6m64 6c-11-9-26-11-44-6" fill="none" stroke="#fbebce" strokeWidth="3" strokeLinecap="round" />
      <path d="M210 203c-2 9-13 15-11 25l10-4 12 4c2-10-9-16-11-25" fill="#2b2026" stroke="#6c584b" strokeWidth="1" />
      <path d="M174 239q36-12 72 0l-9 30h-54z" fill="#2a1237" />
      <path d="M162 238l9 25c5 17 19 27 39 29 20-2 34-12 39-29l9-25-9 2-8 17q-31 15-62 0l-8-17z" fill={"url(#" + id + "-jaw)"} stroke="#48382a" strokeWidth="2" />
      {[0, 1, 2, 3, 4, 5].map((tooth) => <path key={tooth} d={`M${177 + tooth * 11} 236q5-2 10 0l-1 13q-4 3-8 0z`} fill={"url(#" + id + "-jaw)"} stroke="#564331" strokeWidth="1" />)}
      {[0, 1, 2, 3, 4].map((tooth) => <path key={tooth} d={`M${184 + tooth * 11} 264v-8q4-3 9 0v8z`} fill="#e0c9a3" stroke="#654d36" strokeWidth="0.8" />)}
      <path d="M180 270q30 20 60 0M169 221l8-5m74 5-8-5" fill="none" stroke="#fbebc9" strokeWidth="1" opacity="0.75" />
      <path d="m193 96 4 16-7 11 9 8" fill="none" stroke="#5a4533" strokeWidth="1.4" opacity="0.65" strokeLinejoin="round" />
    </g>
    </g>
  </>;
}
