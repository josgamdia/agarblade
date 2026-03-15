export default function Legend() {
  return (
    <div id="legend">
      <div className="leg"><span className="dot" style={{ background: '#44ff88' }} />Pequeño — huye</div>
      <div className="leg"><span className="dot" style={{ background: '#f7c948' }} />Similar — neutral</div>
      <div className="leg"><span className="dot" style={{ background: '#ff4455' }} />Grande — te caza</div>
      <div className="leg"><span className="dot" style={{ border: '2px solid gold', background: 'transparent' }} />Con pistola</div>
    </div>
  );
}
