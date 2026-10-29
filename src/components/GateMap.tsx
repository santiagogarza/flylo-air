export function GateMap({ gate, terminal, walkMinutes }: { gate: string; terminal: string; walkMinutes: number }) {
  const concourse = gate.charAt(0);
  const number = Number(gate.slice(1));
  const first = Math.max(1, number - 3);
  const gates = Array.from({ length: 8 }, (_, index) => first + index);
  const slot = (index: number) => 70 + Math.floor(index / 2) * 56;
  const mine = gates.indexOf(number);
  const pinX = slot(mine) + 14;
  const pinY = mine % 2 === 0 ? 22 : 108;

  return (
    <figure className="gate-map">
      <svg viewBox="0 0 300 130" role="img" aria-label={`Placeholder map of Terminal ${terminal}, concourse ${concourse}, with gate ${gate} highlighted`}>
        <rect x="8" y="44" width="284" height="42" rx="21" fill="#eef4ff" stroke="#dbe7ff" />
        <rect x="8" y="50" width="44" height="30" rx="8" fill="#0b2545" />
        <text x="30" y="69" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">
          SEC
        </text>
        {gates.map((value, index) => {
          const top = index % 2 === 0;
          const highlighted = value === number;
          return (
            <g key={value}>
              <rect
                x={slot(index)}
                y={top ? 16 : 90}
                width="28"
                height="24"
                rx="6"
                fill={highlighted ? '#f97316' : '#fff'}
                stroke={highlighted ? '#9a3412' : '#b6c2d3'}
              />
              <text x={slot(index) + 14} y={top ? 32 : 106} textAnchor="middle" fontSize="8.5" fontWeight="700" fill={highlighted ? '#fff' : '#475569'}>
                {concourse}
                {value}
              </text>
            </g>
          );
        })}
        <path d={`M52 65 H${pinX} V${pinY < 65 ? 44 : 86}`} fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeDasharray="1 6" strokeLinecap="round" />
        <circle cx="58" cy="65" r="4" fill="#1d4ed8" />
      </svg>
      <figcaption>
        <strong>
          Terminal {terminal} · Gate {gate}
        </strong>
        <span>About {walkMinutes} min walk from security. Map is a placeholder, not to scale.</span>
      </figcaption>
    </figure>
  );
}
