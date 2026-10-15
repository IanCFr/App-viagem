import { useState, type CSSProperties } from 'react';
import { money, paceSeries, today, type DayTotal } from '../shared/model';
import { Amount } from './Amount';

const weekday = (date: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(`${date}T12:00:00-03:00`)).replace('.', '');
const longDate = (date: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(`${date}T12:00:00-03:00`));

// Interpolação monotônica (Fritsch–Carlson): a curva acumulada nunca desce entre dois dias.
function smoothPath(points: [number, number][]) {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : '';
  const n = points.length, dx: number[] = [], slope: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(points[i + 1][0] - points[i][0]); slope.push((points[i + 1][1] - points[i][1]) / dx[i]); }
  const m = [slope[0]];
  for (let i = 1; i < n - 1; i++) m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  m.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / slope[i], b = m[i + 1] / slope[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * slope[i]; m[i + 1] = t * b * slope[i]; }
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) { const [x0, y0] = points[i], [x1, y1] = points[i + 1], h = dx[i] / 3; d += ` C${x0 + h},${y0 + m[i] * h} ${x1 - h},${y1 - m[i + 1] * h} ${x1},${y1}`; }
  return d;
}

export function TripPace({ days, budget, startDate, endDate, hidden }: { days: DayTotal[]; budget: number | null; startDate: string; endDate: string; hidden: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const series = paceSeries(days, budget, startDate, endDate);
  const dayTotal = (index: number) => series[index].cashCents + series[index].ticketCents;
  const latest = series.map((_, i) => i).reverse().find(i => dayTotal(i) > 0);
  const selectedIndex = picked ? series.findIndex(d => d.date === picked) : latest ?? -1;
  const selected = series[selectedIndex];
  const top = Math.max(...series.map(d => Math.max(d.cumulativeCents, d.paceCents ?? 0)), 1) * 1.15;
  const x = (i: number) => (i + 0.5) / series.length * 100;
  const y = (cents: number) => 100 - cents / top * 100;
  // A curva para hoje (ou no último gasto, se houver lançamento com data futura); dias à frente ainda não aconteceram.
  const now = today();
  let lastDrawn = latest ?? -1;
  series.forEach((d, i) => { if (d.date <= now && i > lastDrawn) lastDrawn = i; });
  const line = series.slice(0, lastDrawn + 1).map((d, i) => [x(i), y(d.cumulativeCents)] as [number, number]);
  const curve = smoothPath(line);
  const area = line.length ? `${curve} L${line[line.length - 1][0]},100 L${line[0][0]},100 Z` : '';
  const ideal = budget === null ? '' : series.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.paceCents!)}`).join(' ');
  return <section className="pace" aria-label="Ritmo da viagem">
    <div className="section-heading"><h2>Ritmo da viagem</h2></div>
    <div className="pace-card">
      <div className="pace-legend" aria-hidden="true"><span className="legend-line">Acumulado no orçamento</span>{budget !== null && <span className="legend-ideal">Ritmo ideal</span>}</div>
      <div className="pace-chart">
        <div className="pace-plot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="pace-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D6537F" stopOpacity=".26"/><stop offset="1" stopColor="#D6537F" stopOpacity="0"/></linearGradient></defs>
            <path d={area} fill="url(#pace-fill)"/>
            {ideal && <path d={ideal} className="pace-ideal" vectorEffect="non-scaling-stroke"/>}
            <path d={curve} className="pace-curve" vectorEffect="non-scaling-stroke"/>
          </svg>
          {selected && selectedIndex <= lastDrawn && <span className="pace-marker" style={{ left: `${x(selectedIndex)}%`, top: `${y(selected.cumulativeCents)}%` } as CSSProperties}/>}
        </div>
        <div className="pace-days" role="group" aria-label="Dias da viagem">
          {series.map((d, i) => <button type="button" key={d.date} className="pace-day" aria-pressed={i === selectedIndex} aria-label={`${longDate(d.date)}: ${hidden ? 'valor oculto' : money(dayTotal(i))}`} onClick={() => setPicked(d.date)}>
            <span className="pace-label"><strong>{d.date.slice(8)}</strong>{weekday(d.date)}</span>
          </button>)}
        </div>
      </div>
      <div className="pace-detail" data-testid="day-detail" aria-live="polite">
        {selected ? <>
          <strong className="pace-date">{longDate(selected.date)}</strong>
          <dl>
            <div><dt>Gasto do dia</dt><dd><Amount cents={dayTotal(selectedIndex)} hidden={hidden}/></dd></div>
            {selected.ticketCents > 0 && <div><dt>No ticket</dt><dd><Amount cents={selected.ticketCents} hidden={hidden}/></dd></div>}
            <div><dt>Acumulado no orçamento</dt><dd><Amount cents={selected.cumulativeCents} hidden={hidden}/></dd></div>
            {selected.paceCents !== null && <div><dt>Ritmo ideal</dt><dd><Amount cents={selected.paceCents} hidden={hidden}/></dd></div>}
          </dl>
        </> : <p>Registrem o primeiro gasto para ver o ritmo da viagem.</p>}
      </div>
    </div>
  </section>;
}
