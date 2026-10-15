// Ilustração da entrada: Ian e Lara de mãos dadas na areia, vendo o sol se pôr no mar de João Pessoa.
// Ancorada embaixo e no centro: em telas estreitas as laterais (coqueiros) são cortadas, o casal e o sol nunca.
const plum = '#3B2B4F';

export function LoginArt() {
  return <svg className="login-art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Ilustração: o casal de mãos dadas na areia, vendo o pôr do sol no mar">
    <defs>
      <linearGradient id="art-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E6DAF5"/><stop offset=".35" stopColor="#DCCBEF"/><stop offset=".62" stopColor="#F4D3E2"/><stop offset=".85" stopColor="#FFD8BE"/><stop offset="1" stopColor="#FFCFA8"/></linearGradient>
      <radialGradient id="art-sun" cx=".5" cy=".42" r=".6"><stop offset="0" stopColor="#FFF6EC"/><stop offset=".55" stopColor="#FFD3AE"/><stop offset="1" stopColor="#F79A86"/></radialGradient>
      <radialGradient id="art-glow"><stop offset="0" stopColor="#FFE3CC" stopOpacity=".9"/><stop offset=".45" stopColor="#FFCFA8" stopOpacity=".45"/><stop offset="1" stopColor="#FFCFA8" stopOpacity="0"/></radialGradient>
      <linearGradient id="art-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#AB93D4"/><stop offset="1" stopColor="#836AB0"/></linearGradient>
      <linearGradient id="art-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFDCC2"/><stop offset="1" stopColor="#F7BE93"/></linearGradient>
    </defs>
    <rect width="400" height="193" fill="url(#art-sky)"/>
    <circle cx="262" cy="190" r="78" fill="url(#art-glow)"/>
    <circle cx="262" cy="190" r="30" fill="url(#art-sun)"/>
    <path d="M0 193V179q32-7 62 1t50 13z" fill="#8E7BA8" opacity=".55"/>
    <rect y="192" width="400" height="60" fill="url(#art-sea)"/>
    <rect y="191.5" width="400" height="1.5" fill="#FFECDE" opacity=".9"/>
    <g fill="#FFE3CC" opacity=".8"><rect x="234" y="199" width="56" height="3" rx="1.5"/><rect x="242" y="207" width="40" height="3" rx="1.5"/><rect x="249" y="215" width="26" height="2.5" rx="1.25"/><rect x="255" y="223" width="14" height="2" rx="1"/></g>
    <g fill="none" stroke={plum} strokeWidth="2" strokeLinecap="round" opacity=".6"><path d="M292 86q6-6 12 0q6-6 12 0"/><path d="M322 72q4-4 8 0q4-4 8 0"/></g>
    <path d="M0 242q120-14 220-5t180-7v70H0z" fill="url(#art-sand)"/>
    <g fill={plum}>
      <path d="M48 300q-2-70 24-150" stroke={plum} strokeWidth="7" fill="none" strokeLinecap="round"/>
      <path d="M72 150q-26-22-54-10q30-4 54 13z"/><path d="M72 150q-12-32-38-42q24 14 36 44z"/><path d="M72 150q16-34 44-38q-24 14-42 40z"/><path d="M72 150q32-16 56 0q-28-8-54 4z"/><path d="M72 151q8 20 0 40q-2-22-2-38z"/>
      <circle cx="68" cy="157" r="3.5"/><circle cx="75" cy="158" r="3.5"/>
      <path d="M384 300q4-60-24-132" stroke={plum} strokeWidth="6" fill="none" strokeLinecap="round"/>
      <path d="M360 168q24-20 48-8q-26-2-46 11z"/><path d="M360 168q12-28 34-36q-20 12-32 38z"/><path d="M360 168q-14-30-38-34q20 12 36 36z"/><path d="M360 168q-28-14-50 0q24-6 48 3z"/>
    </g>
    <ellipse cx="167" cy="254" rx="36" ry="4" fill={plum} opacity=".12"/>
    <g fill={plum}>
      <circle cx="150" cy="176" r="8"/>
      <path d="M139 191q11-8 22 0l-1 33h-20z"/>
      <rect x="140" y="223" width="8" height="31" rx="3"/><rect x="152" y="223" width="8" height="31" rx="3"/>
      <path d="M177 179q-1 17 2 23h10q3-6 2-23q-1-8-7-7.5q-6-.5-7 7.5z" transform="rotate(-9 184 192)"/>
      <path d="M176 193q8-5 16 0l6 39h-28z"/>
      <rect x="177" y="231" width="6" height="23" rx="3"/><rect x="186" y="231" width="6" height="23" rx="3"/>
    </g>
    <g fill="none" stroke={plum} strokeWidth="5" strokeLinecap="round">
      <path d="M140 192q-6 15-4 29"/><path d="M160 192q6 13 10 22"/>
      <path d="M177 196q-5 11-7 18"/><path d="M191 196q5 13 3 26"/>
    </g>
  </svg>;
}
