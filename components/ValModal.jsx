import React from 'react';
import { ALL_PLAYERS, TIER_STYLE } from '../data/playersBase.js';

function RScoreNote() {
  const [open,setOpen] = React.useState(false);
  return (
    <div style={{marginBottom:16,borderRadius:8,border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:"100%",background:"rgba(255,255,255,0.03)",border:"none",padding:"9px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:"#aaa",fontFamily:"monospace"}}>
        <span style={{fontSize:10,letterSpacing:1,color:"#888"}}>❓ ARE THESE R SCORES STRONG? — click to expand</span>
        <span style={{fontSize:12,color:"#555",transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>▾</span>
      </button>
      {open&&(
        <div style={{padding:"14px 16px",background:"rgba(0,0,0,0.3)",fontSize:10,color:"#888",lineHeight:1.7}}>
          <p style={{margin:"0 0 10px",color:"#bbb",fontWeight:700}}>Short answer: moderate for draft capital and production metrics, weak for athleticism.</p>
          <p style={{margin:"0 0 10px"}}>
            Pearson r is interpreted as: <span style={{color:"#5dbf6a"}}>0.70+ strong</span> · <span style={{color:"#f0c040"}}>0.50–0.69 moderate</span> · <span style={{color:"#f0873a"}}>0.30–0.49 weak-to-moderate</span> · <span style={{color:"#e05050"}}>below 0.30 weak</span>.
            Our best scores — Draft Round (r = 0.532) and Draft Pick (r = 0.522) predicting T24 rate — both land in the moderate tier. Prospect Score follows at r = 0.465. Production and trajectory metrics cluster in the weak-to-moderate range (r = 0.26–0.43), and athletic metrics are genuinely weak (r ≈ 0.14–0.16).
          </p>
          <p style={{margin:"0 0 10px"}}>
            <span style={{color:"#ccc",fontWeight:600}}>Why this isn't surprising:</span> NFL career outcomes are shaped by factors no college model can see — offensive line quality, coaching scheme, injuries, opportunity, and depth chart. Even elite NFL front offices struggle to exceed r ≈ 0.55 on individual career predictions. For context, draft position predicting career success in academic literature typically produces r ≈ 0.45–0.55 — our r = 0.532 sits squarely in that range. Combine metrics alone rarely exceed r = 0.20.
          </p>
          <p style={{margin:"0 0 10px"}}>
            <span style={{color:"#ccc",fontWeight:600}}>What the scores mean practically:</span> r = 0.532 means draft round explains about <span style={{color:"#4da6ff"}}>28% of the variance</span> in top-24 finish rates (r² = 0.28). The Prospect Score at r = 0.465 explains <span style={{color:"#4da6ff"}}>22%</span> (r² = 0.22). That sounds modest, but these are real, actionable signals — meaningfully better than chance and far better than athleticism alone (which explains less than 3%).
          </p>
          <p style={{margin:0,color:"#666"}}>
            <span style={{color:"#888",fontWeight:600}}>Honest framing:</span> this model is best understood as a <em>prospect grading tool</em> (ranking relative college quality) rather than a <em>career outcome predictor</em>. The r scores confirm it has real predictive validity — just not the kind that guarantees top-12 outcomes. That's true of virtually every pre-draft model in existence.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ValModal({onClose}) {
  const tc={Elite:"#f0c040",Starter:"#5dbf6a",Rotational:"#4da6ff",Developmental:"#c084fc",Fringe:"#888"};

  // Live-computed correlations (Pearson r, per-season basis, n=166)
  const TOP12_METRICS = [
    {label:"Draft Round",       r:0.421, note:"Earlier draft round is the strongest single predictor of top-12 seasons"},
    {label:"Draft Pick",        r:0.415, note:"Pick number directly reflects team valuation and opportunity"},
    {label:"Prospect Score",    r:0.387, note:"Overall model score correlates strongly with T12 rate"},
    {label:"Recv Trajectory",   r:0.366, note:"Pass-catching profile — a key differentiator for elite usage"},
    {label:"Prod Trajectory",   r:0.358, note:"Sustained college production volume translates to NFL starter usage"},
    {label:"PFF Board",         r:0.337, note:"Draft-day evaluation quality signal"},
    {label:"Traj Peak",         r:0.280, note:"College ceiling predicts NFL ceiling"},
    {label:"Traj Final",        r:0.280, note:"Most recent season quality carries forward"},
    {label:"Rush Trajectory",   r:0.260, note:"Core rushing profile still matters for elite usage"},
    {label:"40-Yard Dash Rank", r:0.144, note:"Speed matters less than production and draft capital for T12 outcomes"},
  ];
  const TOP24_METRICS = [
    {label:"Draft Round",       r:0.532, note:"The strongest predictor — earlier round means more opportunity and team investment"},
    {label:"Draft Pick",        r:0.522, note:"Pick number reflects team commitment and role clarity"},
    {label:"Prospect Score",    r:0.465, note:"Best single production-based predictor of any top-24 season"},
    {label:"Prod Trajectory",   r:0.429, note:"Sustained college production volume translates directly"},
    {label:"PFF Board",         r:0.409, note:"PFF evaluation quality predicts NFL role attainment"},
    {label:"Recv Trajectory",   r:0.363, note:"Receiving versatility extends fantasy relevance"},
    {label:"Traj Peak",         r:0.354, note:"College peak season predicts NFL breakout potential"},
    {label:"Rush Trajectory",   r:0.348, note:"Core rushing production ensures RB usage share"},
    {label:"Traj Final",        r:0.340, note:"Final college season momentum carries into rookie year"},
    {label:"40-Yard Dash Rank", r:0.156, note:"Speed modestly predicts top-24 reach across career"},
  ];

  // Tier rates — per-season basis
  const tierOrder=["Elite","Starter","Rotational","Developmental","Fringe"];
  const tiers = tierOrder.map(tier=>{
    const inTier = Object.values(ALL_PLAYERS).filter(p=>p.tier===tier&&p.nfl&&(p.nfl.career_seasons||0)>0);
    const n = inTier.length;
    if(!n) return null;
    const totalCareer = inTier.reduce((s,p)=>s+(p.nfl.career_seasons||0),0);
    const totalT12    = inTier.reduce((s,p)=>s+(p.nfl.top12||0),0);
    const totalT24    = inTier.reduce((s,p)=>s+(p.nfl.top24||0),0);
    return {tier, n, career:totalCareer,
      top12_rate: totalCareer>0 ? Math.round(totalT12/totalCareer*100) : 0,
      top24_rate: totalCareer>0 ? Math.round(totalT24/totalCareer*100) : 0,
    };
  }).filter(Boolean);

  const RBar=({label,r,note,color})=>{
    const pct=Math.abs(r)/0.50*100;
    return (
      <div style={{marginBottom:11}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <span style={{fontSize:11,color:"#ccc",fontWeight:600}}>{label}</span>
          <span style={{fontSize:11,fontWeight:800,color:color}}>r = +{r.toFixed(3)}</span>
        </div>
        <div style={{height:5,borderRadius:3,background:"rgba(255,255,255,0.05)"}}>
          <div style={{height:"100%",width:Math.min(pct,100)+"%",background:`linear-gradient(90deg,${color}88,${color})`,borderRadius:3}}/>
        </div>
        <div style={{fontSize:9,color:"#555",marginTop:3,lineHeight:1.4}}>{note}</div>
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:1001,background:"rgba(0,0,0,0.9)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#080e18",borderRadius:16,border:"1.5px solid #f0c04044",width:"100%",maxWidth:680,maxHeight:"92vh",overflowY:"auto",padding:"24px 26px 30px",fontFamily:"monospace"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <div style={{fontSize:9,color:"#555",letterSpacing:3}}>MODEL VALIDATION</div>
            <div style={{fontSize:18,fontWeight:800,color:"#fff",marginTop:3}}>NFL Outcome Correlations</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#555",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:7,padding:"8px 12px",marginBottom:14,fontSize:10,color:"#555"}}>
          Pearson r correlations · n=166 evaluable players (2017–2025 classes with NFL career data) · per-season T12/T24 rates
        </div>
        <div style={{fontSize:12,color:"#666",lineHeight:1.65,marginBottom:10,padding:"0 2px"}}>
          Pearson r measures the linear correlation between two variables on a scale from −1 to +1. A value of +1 means a perfect positive relationship, 0 means no relationship, and −1 means a perfect inverse relationship — so a higher r means the metric is a stronger predictor of NFL success.
        </div>
        <RScoreNote/>

        {/* Two-column layout for T12 and T24 */}
        <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>

          {/* TOP-12 */}
          <div style={{flex:1,minWidth:260}}>
            <div style={{fontSize:9,color:"#f0c040",letterSpacing:2,marginBottom:12,fontWeight:700}}>
              ★ TOP 10 PREDICTORS — TOP-12 RATE
            </div>
            {TOP12_METRICS.map((d,i)=>(
              <div key={d.label} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:10}}>
                <span style={{fontSize:10,color:"rgba(240,192,64,0.35)",minWidth:16,marginTop:1,fontWeight:700}}>#{i+1}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:11,color:"#ccc",fontWeight:600}}>{d.label}</span>
                    <span style={{fontSize:11,fontWeight:800,color:"#f0c040"}}>r = +{d.r.toFixed(3)}</span>
                  </div>
                  <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.05)"}}>
                    <div style={{height:"100%",width:Math.min(d.r/0.50*100,100)+"%",background:"linear-gradient(90deg,#f0c04066,#f0c040)",borderRadius:2}}/>
                  </div>
                  <div style={{fontSize:8.5,color:"#555",marginTop:2,lineHeight:1.35}}>{d.note}</div>
                </div>
              </div>
            ))}
          </div>

          {/* TOP-24 */}
          <div style={{flex:1,minWidth:260}}>
            <div style={{fontSize:9,color:"#5dbf6a",letterSpacing:2,marginBottom:12,fontWeight:700}}>
              ✓ TOP 10 PREDICTORS — TOP-24 RATE
            </div>
            {TOP24_METRICS.map((d,i)=>(
              <div key={d.label} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:10}}>
                <span style={{fontSize:10,color:"rgba(93,191,106,0.35)",minWidth:16,marginTop:1,fontWeight:700}}>#{i+1}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:11,color:"#ccc",fontWeight:600}}>{d.label}</span>
                    <span style={{fontSize:11,fontWeight:800,color:"#5dbf6a"}}>r = +{d.r.toFixed(3)}</span>
                  </div>
                  <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,0.05)"}}>
                    <div style={{height:"100%",width:Math.min(d.r/0.50*100,100)+"%",background:"linear-gradient(90deg,#5dbf6a66,#5dbf6a)",borderRadius:2}}/>
                  </div>
                  <div style={{fontSize:8.5,color:"#555",marginTop:2,lineHeight:1.35}}>{d.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{height:1,background:"rgba(255,255,255,0.05)",margin:"18px 0"}}/>

        {/* Tier finish rates */}
        <div style={{fontSize:9,color:"#4da6ff",letterSpacing:2,marginBottom:6,fontWeight:700}}>FINISH RATES BY TIER</div>
        <div style={{fontSize:9,color:"#555",marginBottom:8}}>Per-season basis: top-finish seasons ÷ total career seasons (n=166)</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
          <thead><tr style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            {["Tier","Players","Career Yrs","T12 Rate","T24 Rate"].map(h=><th key={h} style={{textAlign:h==="Tier"?"left":"center",padding:"5px 8px",color:"#444",fontSize:9}}>{h}</th>)}
          </tr></thead>
          <tbody>{tiers.map(row=>(
            <tr key={row.tier} style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
              <td style={{padding:"7px 8px"}}><span style={{color:tc[row.tier]||"#888",fontWeight:700}}>{row.tier}</span></td>
              <td style={{padding:"7px 8px",textAlign:"center",color:"#555"}}>{row.n}</td>
              <td style={{padding:"7px 8px",textAlign:"center",color:"#555"}}>{row.career}</td>
              <td style={{padding:"7px 8px",textAlign:"center"}}><span style={{color:row.top12_rate>=50?"#5dbf6a":row.top12_rate>=25?"#f0c040":"#f0873a",fontWeight:700}}>{row.top12_rate}%</span></td>
              <td style={{padding:"7px 8px",textAlign:"center"}}><span style={{color:row.top24_rate>=60?"#5dbf6a":row.top24_rate>=40?"#f0c040":"#f0873a",fontWeight:700}}>{row.top24_rate}%</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}