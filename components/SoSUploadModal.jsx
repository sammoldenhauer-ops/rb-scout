import React from 'react';

export default function SoSUploadModal({onClose, onSave, existing}) {
  const [year, setYear]         = React.useState(new Date().getFullYear() + 1);
  const [rawText, setRawText]   = React.useState('');
  const [parsed, setParsed]     = React.useState(null);
  const [error, setError]       = React.useState('');
  const [saved, setSaved]       = React.useState(false);

  // Normalise rating → 0–1 mag, then → label
  function magFromRating(rating, allRatings) {
    const mn = Math.min(...allRatings), mx = Math.max(...allRatings);
    if (mx === mn) return 0.5;
    return (rating - mn) / (mx - mn);
  }
  function labelFromMag(mag) {
    if (mag >= 0.60) return 'Elite';
    if (mag >= 0.38) return 'Strong';
    if (mag >= 0.10) return 'Average';
    if (mag >= 0.01) return 'Weak';
    return 'Very Weak';
  }
  // Strip record like "(12-1)" from team names
  function cleanTeam(t) {
    return t.replace(/\s*\([\d\-]+\)\s*$/, '').trim();
  }

  function parseCSV() {
    setError(''); setParsed(null);
    const lines = rawText.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { setError('No data found.'); return; }

    // Auto-detect separator
    const sep = lines[0].includes('\t') ? '\t' : ',';

    // Parse all rows
    const rows = lines.map(l => l.split(sep).map(c => c.trim().replace(/^["']|["']$/g, '')));

    // Find header row
    const headerIdx = rows.findIndex(r =>
      r.some(c => /^(team|school|name)/i.test(c)) &&
      r.some(c => /^(rank|rk|#)/i.test(c) || /^(rating|sos|score)/i.test(c))
    );
    const dataRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows;
    const header   = headerIdx >= 0 ? rows[headerIdx].map(c => c.toLowerCase()) : null;

    // Column indices
    let teamCol = 1, rankCol = 0, ratingCol = 2;
    if (header) {
      const ti = header.findIndex(h => /team|school|name/i.test(h));
      const ri = header.findIndex(h => /^rank|^rk|^#/i.test(h));
      const vi = header.findIndex(h => /rating|sos|score|value/i.test(h));
      if (ti >= 0) teamCol   = ti;
      if (ri >= 0) rankCol   = ri;
      if (vi >= 0) ratingCol = vi;
    }

    const teams = [];
    for (const row of dataRows) {
      const maxCol = Math.max(teamCol, rankCol, ratingCol);
      if (row.length <= maxCol) continue;
      const rawTeam  = row[teamCol] || '';
      const teamName = cleanTeam(rawTeam);
      const rank     = parseInt(row[rankCol]) || null;
      const rating   = parseFloat(row[ratingCol]);
      if (!teamName || isNaN(rating)) continue;
      teams.push({ team: teamName, rank, rating });
    }

    if (!teams.length) { setError('Could not parse any rows. Check your CSV format.'); return; }

    const allRatings = teams.map(t => t.rating);
    const result = teams.map(t => ({
      ...t,
      mag:   parseFloat(magFromRating(t.rating, allRatings).toFixed(3)),
      label: labelFromMag(magFromRating(t.rating, allRatings)),
    }));

    setParsed(result);
  }

  function handleSave() {
    if (!parsed) return;
    const lookup = {};
    parsed.forEach(({ team, rank, mag, label }) => {
      lookup[team.toLowerCase()] = { rank, mag, label, team };
    });
    onSave(String(year), lookup);
    setSaved(true);
  }

  const labelColor = l => l==='Elite'?'#f0c040':l==='Strong'?'#5dbf6a':l==='Average'?'#4da6ff':l==='Weak'?'#f0873a':'#e05050';

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#0d1117',border:'1px solid rgba(77,166,255,0.3)',borderRadius:12,width:'100%',maxWidth:640,maxHeight:'90vh',overflowY:'auto',padding:24,fontFamily:'monospace'}}>

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#4da6ff',letterSpacing:1}}>UPLOAD STRENGTH OF SCHEDULE</div>
            <div style={{fontSize:10,color:'#555',marginTop:3}}>Paste or upload a CSV for a new season</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#555',fontSize:18,cursor:'pointer'}}>✕</button>
        </div>

        {/* Year */}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:9,color:'#555',letterSpacing:2,display:'block',marginBottom:6}}>SEASON YEAR</label>
          <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))}
            style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(77,166,255,0.3)',borderRadius:7,color:'#4da6ff',fontSize:13,padding:'8px 12px',fontFamily:'monospace',width:120,outline:'none'}}/>
          {existing[String(year)] && <span style={{fontSize:10,color:'#f0873a',marginLeft:10}}>⚠ Will overwrite existing {String(year)} data ({Object.keys(existing[String(year)]).length} teams)</span>}
        </div>

        {/* Instructions */}
        <div style={{background:'rgba(77,166,255,0.05)',border:'1px solid rgba(77,166,255,0.15)',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:10,color:'#666',lineHeight:1.7}}>
          <strong style={{color:'#4da6ff'}}>Accepted format (CSV or tab-separated):</strong><br/>
          Copy your spreadsheet data and paste below, or upload a .csv file. The app expects columns for <strong>Rank</strong>, <strong>Team</strong>, and <strong>Rating</strong> — in any order with any header names. Extra columns are ignored. Team records like "(12-1)" are stripped automatically.<br/><br/>
          <strong style={{color:'#aaa'}}>Example:</strong> <span style={{color:'#555'}}>Rank, Team, Rating<br/>1, Alabama (14-1), 20.6<br/>2, Georgia (13-0), 18.4</span>
        </div>

        {/* Paste area */}
        <div style={{marginBottom:12}}>
          <label style={{fontSize:9,color:'#555',letterSpacing:2,display:'block',marginBottom:6}}>PASTE DATA OR UPLOAD FILE</label>
          <textarea value={rawText} onChange={e=>{setRawText(e.target.value);setParsed(null);setSaved(false);}}
            placeholder={"Rank\tTeam\tRating\n1\tAlabama (14-1)\t20.6\n2\tGeorgia (13-0)\t18.4\n..."}
            style={{width:'100%',height:120,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:7,color:'#ccc',fontSize:10,padding:'10px 12px',fontFamily:'monospace',resize:'vertical',outline:'none',boxSizing:'border-box'}}/>
          <label style={{display:'inline-block',marginTop:6,padding:'5px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,fontSize:9,color:'#666',cursor:'pointer',letterSpacing:1}}>
            ↑ UPLOAD CSV FILE
            <input type="file" accept=".csv,.txt,.tsv" style={{display:'none'}} onChange={e=>{
              const file=e.target.files[0]; if(!file) return;
              const reader=new FileReader();
              reader.onload=ev=>{setRawText(ev.target.result);setParsed(null);setSaved(false);};
              reader.readAsText(file);
            }}/>
          </label>
        </div>

        <button onClick={parseCSV}
          style={{padding:'8px 18px',borderRadius:7,border:'1px solid rgba(77,166,255,0.4)',background:'rgba(77,166,255,0.1)',color:'#4da6ff',fontSize:10,cursor:'pointer',fontFamily:'monospace',letterSpacing:1,marginBottom:16}}>
          PARSE →
        </button>

        {error && <div style={{color:'#e05050',fontSize:10,marginBottom:12}}>⚠ {error}</div>}

        {/* Preview */}
        {parsed && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:9,color:'#555',letterSpacing:2,marginBottom:8}}>PREVIEW — {parsed.length} TEAMS PARSED</div>
            <div style={{maxHeight:220,overflowY:'auto',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}>
                <thead>
                  <tr style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
                    {['Rank','Team','Rating','Mag','Label'].map(h=>(
                      <th key={h} style={{padding:'6px 10px',color:'#555',fontWeight:400,textAlign:'left',letterSpacing:1,fontSize:9}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0,10).map((row,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td style={{padding:'5px 10px',color:'#777'}}>{row.rank}</td>
                      <td style={{padding:'5px 10px',color:'#fff'}}>{row.team}</td>
                      <td style={{padding:'5px 10px',color:'#aaa'}}>{row.rating}</td>
                      <td style={{padding:'5px 10px',color:'#aaa'}}>{row.mag.toFixed(3)}</td>
                      <td style={{padding:'5px 10px'}}><span style={{color:labelColor(row.label),fontWeight:600}}>{row.label}</span></td>
                    </tr>
                  ))}
                  {parsed.length>10&&<tr><td colSpan={5} style={{padding:'5px 10px',color:'#444',fontSize:9}}>...and {parsed.length-10} more</td></tr>}
                </tbody>
              </table>
            </div>
            {!saved
              ? <button onClick={handleSave}
                  style={{marginTop:10,padding:'8px 20px',borderRadius:7,border:'1px solid rgba(93,191,106,0.4)',background:'rgba(93,191,106,0.1)',color:'#5dbf6a',fontSize:10,cursor:'pointer',fontFamily:'monospace',letterSpacing:1}}>
                  SAVE {parsed.length} TEAMS FOR {year} ✓
                </button>
              : <div style={{marginTop:10,color:'#5dbf6a',fontSize:11}}>✓ Saved {parsed.length} teams for {year}. When adding a new player, their school's SoS will be auto-filled.</div>
            }
          </div>
        )}

        {/* Existing seasons */}
        {Object.keys(existing).length > 0 && (
          <div style={{marginTop:16,borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:14}}>
            <div style={{fontSize:9,color:'#555',letterSpacing:2,marginBottom:8}}>UPLOADED SEASONS</div>
            {Object.entries(existing).sort(([a],[b])=>Number(b)-Number(a)).map(([yr, data])=>(
              <div key={yr} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <span style={{fontSize:11,color:'#aaa'}}>{yr} — {Object.keys(data).length} teams</span>
                <button onClick={()=>{const n={...existing};delete n[yr];onSave(null,null,n);}}
                  style={{background:'none',border:'none',color:'#e05050',fontSize:10,cursor:'pointer'}}>remove</button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}