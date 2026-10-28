import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/dashboard.css';
import '../styles/habit-history.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const startMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
const key = (kind,id) => `${kind}:${id}`;

export default function HabitHistory() {
  const navigate = useNavigate();
  const [month,setMonth] = useState(startMonth(new Date()));
  const [selected,setSelected] = useState(iso(new Date()));
  const [filter,setFilter] = useState('all');
  const [data,setData] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const today = iso(new Date());
  const monthKey = iso(month).slice(0,7);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    fetch(`${API}/api/habit-history?month=${monthKey}`,{credentials:'include',signal:controller.signal})
      .then(async res => {const json = await res.json(); if (!res.ok) {const e = new Error(json.message || 'Unable to load history'); e.status=res.status; throw e;} return json;})
      .then(json=>setData(json))
      .catch(e => {if (e.name==='AbortError') return; if(e.status===401) navigate('/login',{replace:true}); else setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted) setLoading(false);});
    return ()=>controller.abort();
  },[monthKey,navigate]);

  const catalog = data?.habits || [];
  const options = [...catalog].sort((a,b)=>a.name.localeCompare(b.name));
  const days = useMemo(()=>{
    if (!data) return {};
    const entries = new Map(data.entries.map(e=>[`${e.entryDate}:${key(e.kind,e.habitId)}`,e]));
    const result={};
    const count = new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    for(let d=1;d<=count;d++) {
      const date = iso(new Date(month.getFullYear(),month.getMonth(),d));
      if(date>today) {result[date]={status:'future',items:[],percentage:null};continue;}
      const active = new Map();
      for(const period of data.periods) {
        const id=key(period.kind,period.habitId);
        if((filter==='all' || filter===id) && period.startDate<=date && (!period.endDate || period.endDate>=date)) {
          active.set(id,{key:id,name:period.name,unit:period.unit,kind:period.kind,habitId:period.habitId});
        }
      }
      // Also show previously logged entries from before schedule tracking was introduced.
      for(const entry of data.entries) {
        if(entry.entryDate!==date) continue;
        const id=key(entry.kind,entry.habitId);
        if(filter!=='all' && filter!==id) continue;
        if(!active.has(id)) {
          const info=catalog.find(h=>key(h.kind,h.habitId)===id);
          if(info) active.set(id,{key:id,name:info.name,unit:info.unit,kind:entry.kind,habitId:entry.habitId});
        }
      }
      const items=[...active.values()].map(h=>({...h,entry:entries.get(`${date}:${h.key}`),completed:Number(entries.get(`${date}:${h.key}`)?.value)>0})).sort((a,b)=>a.name.localeCompare(b.name));
      const completed=items.filter(h=>h.completed).length;
      result[date]={items,completed,total:items.length,percentage:items.length?Math.round(completed/items.length*100):null,status:!items.length?'empty':completed===0?'none':completed===items.length?'all':'some'};
    }
    return result;
  },[data,monthKey,filter,today]);
  const firstWeekday = month.getDay();
  const dayCount=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const dayCells=[...Array(firstWeekday).fill(null),...Array.from({length:dayCount},(_,i)=>iso(new Date(month.getFullYear(),month.getMonth(),i+1)))];
  const chosen=days[selected];
  const changeMonth=direction=>{const next=new Date(month.getFullYear(),month.getMonth()+direction,1);setMonth(next);setSelected(iso(next)===today?today:iso(next));};
  const goToday=()=>{const now=new Date();setMonth(startMonth(now));setSelected(iso(now));};
  return <main className="dashboard-page history-page">
    <header className="dashboard-header"><Link to="/dashboard" className="dashboard-brand"><img src="/ontrack-logo.png" alt="OnTrack" /></Link><nav className="dashboard-nav" aria-label="Habit history navigation"><Link className="dashboard-nav-link" to="/dashboard">Dashboard</Link><Link className="dashboard-nav-link" to="/habits/manage">Manage habits</Link><Link className="dashboard-nav-link is-active" to="/habits/history">Habit History</Link></nav></header>
    <div className="history-container">
      <div className="history-intro"><div><span className="dashboard-kicker">YOUR PROGRESS</span><h1>Habit History</h1><p>Review your daily habits, completions, and consistency over time.</p></div><Link to="/dashboard" className="history-return">← Back to dashboard</Link></div>
      <div className="history-panel"><div className="history-controls"><div className="history-month-controls"><button type="button" onClick={()=>changeMonth(-1)} aria-label="Previous month">‹</button><h2>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><button type="button" onClick={()=>changeMonth(1)} aria-label="Next month">›</button><button type="button" className="history-today" onClick={goToday}>Today</button></div><label className="history-filter">Show habit <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All habits</option>{options.map(h=><option key={key(h.kind,h.habitId)} value={key(h.kind,h.habitId)}>{h.name}{h.kind==='custom'?' (custom)':''}</option>)}</select></label></div>
      <div className="history-legend"><span><i className="history-indicator all"/>All completed</span><span><i className="history-indicator some"/>Some completed</span><span><i className="history-indicator none"/>None completed</span><span><i className="history-indicator empty"/>No scheduled habits</span><span><i className="history-indicator future"/>Future</span></div>
      {error && <p role="alert" className="history-error">{error}</p>}{loading && <p role="status">Loading history...</p>}
      <div className="history-calendar" aria-label="Habit completion calendar">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div key={d} className="history-weekday">{d}</div>)}{dayCells.map((date,i)=>date?<button type="button" key={date} aria-pressed={selected===date} aria-label={`${date}, ${days[date]?.status||'loading'}${days[date]?.percentage!=null?`, ${days[date].percentage}% completed`:''}`} className={`history-day ${days[date]?.status||'empty'} ${selected===date?'selected':''}`} onClick={()=>setSelected(date)}><span>{Number(date.slice(-2))}</span>{days[date]?.percentage!=null&&<small>{days[date].percentage}%</small>}{days[date]?.status==='empty'&&<small>—</small>}</button>:<div className="history-placeholder" key={`blank-${i}`}/> )}</div>
      </div>
      <section className="history-panel history-details" aria-live="polite"><h2>{new Date(`${selected}T12:00:00`).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</h2>{loading?<p>Loading...</p>:!chosen?<p>Select a day in this month.</p>:chosen.status==='future'?<p>Future dates do not have completion results.</p>:chosen.status==='empty'?<p>No habits were scheduled for this day.</p>:<><p className="history-percent"><strong>{chosen.percentage}% complete</strong> · {chosen.completed} of {chosen.total} scheduled habits</p><ul className="history-habits">{chosen.items.map(h=><li key={h.key} className={h.completed?'completed':'incomplete'}><span className="history-check">{h.completed?'✓':'○'}</span><span><strong>{h.name}</strong><small>{h.completed?`Completed${h.entry?.value!=null?` · ${h.entry.value} ${h.unit}`:''}`:'Not completed'}</small></span></li>)}</ul></>}</section>
    </div>
  </main>;
}
