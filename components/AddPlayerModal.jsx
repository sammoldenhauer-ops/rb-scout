import React, { useState, useMemo } from 'react';
import { TIER_STYLE, CONF_LIST, SOS_LOOKUP, EMPTY_FORM } from '../data/playersBase.js';
import { buildProspectScore, autoArchetype, scoreToTier } from '../logic/scoring.jsx';

function AddPlayerModal({onClose, onAdd, existingPlayers, sosByYear={}}) {
  const [step, setStep] = useState(0); // 0=identity 1=seasons 2=athletic 3=nfl 4=review
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [ddOpenMap, setDdOpenMap] = useState({}); // {seasonIdx: bool}
  const [rcOpen, setRcOpen]       = useState(false); // recruit school dd
  const [trOpen, setTrOpen]       = useState(false); // transfer school dd

  const set = (key, val) => setForm(f => ({...f, [key]: val}));
  const setSeason = (idx, key, val) => setForm(f => {
    const statKeys = ['attempts', 'rush_yds', 'ypa', 'rush_tds', 'run_grade', 'yco_a', 'mtf_a', 'ydom', 'tddom', 'targets', 'receptions', 'rec_yds', 'yds_per_rec', 'rec_tds', 'recv_grade', 'yac_rec', 'mtf_rec'];
    const shouldClearScores = statKeys.includes(key);
    const seasons = f.seasons.map((s,i) => {
      if (i === idx) {
        const updated = {...s, [key]:val};
        if (shouldClearScores) {
          updated.rush_score = '';
          updated.recv_score = '';
          updated.adj_score = '';
        }
        return updated;
      }
      return s;
    });
    return {...f, seasons};
  });
  const addSeason = () => {
    if (form.seasons.length >= 5) return;
    setForm(f => ({...f, seasons: [...f.seasons, {...EMPTY_FORM.seasons[0], n: f.seasons.length+1}]}));
  };
  const removeSeason = idx => setForm(f => ({
    ...f, seasons: f.seasons.filter((_,i)=>i!==idx).map((s,i)=>({...s,n:i+1}))
  }));

  const validate0 = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Required";
    if (form.name.trim() && existingPlayers[form.name.trim()]) e.name = "Player already exists";
    if (!form.draft_class) e.draft_class = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const STEPS = ["Identity","Seasons","Athletic","NFL","Recruiting","Review"];

  const next = () => {
    if (step===0 && !validate0()) return;
    setStep(s => Math.min(s+1, 5));
  };
  const back = () => setStep(s => Math.max(s-1,0));

  const handleSave = () => {
    const scores = buildProspectScore(
      form.seasons.map(s => ({...s, conference: form.conference})),
      true
    );
    // Also pass athletic/pff for overall score
    const athlFields = { forty: form.forty, vert: form.vert, weight: form.weight, pff_grade: form.pff_grade };
    const athlScore = (() => {
      const athl40 = parseFloat(form.forty)||0;
      const athlVert = parseFloat(form.vert)||0;
      const athlWt = parseFloat(form.weight)||200;
      const a40  = athl40  > 0 ? Math.max(0, Math.min(100, (4.80 - athl40)  / 0.40 * 50 + 50)) : 50;
      const aVrt = athlVert > 0 ? Math.max(0, Math.min(100, (athlVert - 25) / 18  * 100))       : 50;
      const aWt  = Math.max(0, Math.min(100, (athlWt - 170) / 60 * 100));
      return athl40 > 0 ? (a40*0.5 + aVrt*0.3 + aWt*0.2) : 50;
    })();
    const pffScore = Math.min((parseFloat(form.pff_grade)||0) / 90 * 100, 100);
    const rawFinal = scores.prod_trajectory * 0.75 + athlScore * 0.10 + pffScore * 0.15;
    const finalScore = Math.max(55, Math.min(100, rawFinal * 0.85 + 12));
    scores.prospect_score = Math.round(finalScore * 10) / 10;
    scores.athl_score = Math.round(athlScore * 10) / 10;
    scores.pff_score  = Math.round(pffScore  * 10) / 10;
    scores.tier = scoreToTier(finalScore);

    const seasons = form.seasons.map(s => ({
      n: s.n,
      sc: form.school,
      conf: form.school,
      yr: s.yr || form.draft_class,
      r: parseFloat(s.rush_yds)||null,
      v: parseFloat(s.rec_yds)||null,
      c: null,
      sos: null,
      sos_rank: s.sos_rank ? parseInt(s.sos_rank) : null,
      sos_label: s.sos_label || "Average"
    }));

    const athl = {};
    const total = Object.keys(existingPlayers).length;
    if (form.forty)     athl["40T"]     = {val: parseFloat(form.forty),     comp: null, rank: null, total};
    if (form.ten_split) athl["10split"] = {val: parseFloat(form.ten_split), comp: null, rank: null, total};
    if (form.vert)      athl["vert"]    = {val: parseFloat(form.vert),      comp: null, rank: null, total};
    if (form.broad)     athl["broad"]   = {val: parseFloat(form.broad),     comp: null, rank: null, total};
    if (form.three_cone)athl["3cone"]   = {val: parseFloat(form.three_cone),comp: null, rank: null, total};
    if (form.shuttle)   athl["shuttle"] = {val: parseFloat(form.shuttle),   comp: null, rank: null, total};
    if (form.height)    athl["height"]  = {val: parseFloat(form.height),    comp: null, rank: null, total};
    if (form.weight)    athl["weight"]  = {val: parseFloat(form.weight),    comp: null, rank: null, total};
    if (form.arm)       athl["arm"]     = {val: parseFloat(form.arm),       comp: null, rank: null, total};
    if (form.hand)      athl["hand"]    = {val: parseFloat(form.hand),      comp: null, rank: null, total};
    if (form.wing)      athl["wing"]    = {val: parseFloat(form.wing),      comp: null, rank: null, total};

    const nflData = (form.nfl_best||form.nfl_top12) ? {
      best_rank: parseInt(form.nfl_best)||null,
      avg_rank:  parseFloat(form.nfl_avg)||null,
      top12:     parseInt(form.nfl_top12)||0,
      top24:     parseInt(form.nfl_top24)||0,
      seasons:   parseInt(form.nfl_seasons)||0,
      season_ranks:[],
      draft_round: form.draft_round||null,
      draft_pick:  form.draft_pick||null,
    } : null;

    const allRanks = Object.values(existingPlayers).map(p=>p.rank).filter(Boolean);
    const newRank = Math.max(...allRanks) + 1;

    const newPlayer = {
      rank: newRank,
      prospect_score: scores.prospect_score,
      tier: scores.tier,
      prod_trajectory: scores.prod_trajectory,
      rush_trajectory: scores.prod_trajectory * 0.63,
      recv_trajectory: scores.prod_trajectory * 0.37,
      athl_score: scores.athl_score,
      pff_score:  scores.pff_score,
      pff_rank: null,
      traj_peak: scores.prod_trajectory,
      traj_final: scores.prod_trajectory,
      traj_improvement: 50,
      traj_consistency: 70,
      declare_bonus: 0,
      transfer_bonus: 0,
      num_seasons: form.seasons.length,
      draft_class: String(form.draft_class),
      is_projection: form.is_projection,
      came_out_as: form.came_out_as || null,
      transfer_to: null,
      tags: [autoArchetype(form).rush_arch],
      rush_arch: autoArchetype(form).rush_arch,
      recv_arch: autoArchetype(form).recv_arch,
      nfl: nflData,
      athletic: Object.keys(athl).length ? athl : null,
      comps: null,
      seasons,
      draft_round: form.draft_round || null,
      draft_pick:  form.draft_pick  || null,
      _custom: true,
    };

    onAdd(form.name.trim(), newPlayer, form.seasons);
    setSaved(true);
    setTimeout(onClose, 800);
  };

  const inp = (label, key, placeholder="", type="text", extraStyle={}) => (
    <div style={{marginBottom:14}}>
      <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>{label.toUpperCase()}{errors[key]&&<span style={{color:"#e05050",marginLeft:8}}>{errors[key]}</span>}</label>
      <input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={placeholder}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid "+(errors[key]?"#e05050":"rgba(255,255,255,0.10)"),borderRadius:7,color:"#e0e0e0",padding:"9px 13px",fontSize:12,outline:"none",fontFamily:"monospace",...extraStyle}}/>
    </div>
  );

  const sel = (label, key, opts) => (
    <div style={{marginBottom:14}}>
      <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>{label.toUpperCase()}</label>
      <select value={form[key]} onChange={e=>set(key,e.target.value)}
        style={{width:"100%",background:"#0d1421",border:"1px solid rgba(255,255,255,0.12)",borderRadius:7,color:"#e0e0e0",padding:"9px 13px",fontSize:12,outline:"none",fontFamily:"monospace"}}>
        {opts.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const sInp = (idx, label, key, placeholder="", type="text") => (
    <div style={{marginBottom:10}}>
      <label style={{fontSize:9,color:"#444",letterSpacing:1,display:"block",marginBottom:4}}>{label.toUpperCase()}</label>
      <input type={type} value={form.seasons[idx][key]} onChange={e=>setSeason(idx,key,e.target.value)} placeholder={placeholder}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,color:"#ccc",padding:"7px 11px",fontSize:11,outline:"none",fontFamily:"monospace"}}/>
    </div>
  );

  const previewScore = useMemo(()=>{
    if (!form.seasons[0]) return null;
    try {
      const seasonScores = buildProspectScore(
        form.seasons.map(s => ({...s, conference: form.conference})), true
      );
      const athl40 = parseFloat(form.forty)||0;
      const athlVert = parseFloat(form.vert)||0;
      const athlWt = parseFloat(form.weight)||200;
      const a40  = athl40  > 0 ? Math.max(0, Math.min(100, (4.80 - athl40)  / 0.40 * 50 + 50)) : 50;
      const aVrt = athlVert > 0 ? Math.max(0, Math.min(100, (athlVert - 25) / 18  * 100))       : 50;
      const aWt  = Math.max(0, Math.min(100, (athlWt - 170) / 60 * 100));
      const athlScore = athl40 > 0 ? (a40*0.5 + aVrt*0.3 + aWt*0.2) : 50;
      const pffScore  = Math.min((parseFloat(form.pff_grade)||0) / 90 * 100, 100);
      const rawFinal  = seasonScores.prod_trajectory * 0.75 + athlScore * 0.10 + pffScore * 0.15;
      const finalScore = Math.max(55, Math.min(100, rawFinal * 0.85 + 12));
      return {
        ...seasonScores,
        prospect_score: Math.round(finalScore * 10) / 10,
        athl_score:     Math.round(athlScore  * 10) / 10,
        pff_score:      Math.round(pffScore   * 10) / 10,
        tier: scoreToTier(finalScore)
      };
    } catch(e) { return null; }
  }, [form]);

  if (saved) return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
      <div style={{background:"#0d1421",borderRadius:14,padding:"40px 60px",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>✓</div>
        <div style={{fontSize:16,fontWeight:700,color:"#5dbf6a"}}>Player Added!</div>
        <div style={{fontSize:11,color:"#444",marginTop:6}}>{form.name}</div>
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:9999,overflowY:"auto",padding:"30px 16px"}}>
      <div style={{background:"#0a0f1c",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,width:"100%",maxWidth:620,padding:"20px 16px"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div>
            <div style={{fontSize:9,color:"#444",letterSpacing:3,marginBottom:4}}>ADD PLAYER</div>
            <div style={{fontSize:18,fontWeight:900,color:"#f0c040"}}>New Prospect Entry</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,color:"#666",padding:"7px 13px",fontSize:12}}>✕</button>
        </div>

        {/* Step tabs */}
        <div style={{display:"flex",gap:0,marginBottom:24,borderRadius:8,overflow:"hidden",border:"1px solid rgba(255,255,255,0.07)"}}>
          {STEPS.map((s,i)=>(
            <button key={s} onClick={()=>i<step?setStep(i):null}
              style={{flex:1,padding:"8px 4px",border:"none",borderRight:i<4?"1px solid rgba(255,255,255,0.07)":"none",
                background:i===step?"rgba(240,192,64,0.12)":i<step?"rgba(93,191,106,0.07)":"transparent",
                color:i===step?"#f0c040":i<step?"#5dbf6a":"#444",fontSize:8,letterSpacing:1,fontWeight:i===step?700:400,cursor:i<step?"pointer":"default"}}>
              {i<step?"✓ ":""}{s.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Step 0: Identity */}
        {step===0&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
              {inp("Player Name","name","e.g. John Smith")}
              <div style={{marginBottom:14}}>
                <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>DRAFT CLASS{errors.draft_class&&<span style={{color:"#e05050",marginLeft:8}}>{errors.draft_class}</span>}</label>
                <select value={form.draft_class} onChange={e=>{set("draft_class",e.target.value);if(e.target.value==="2026"){set("draft_round","");set("draft_pick","");set("is_projection",true);}else{set("is_projection",false);}}}
                  style={{width:"100%",background:"#0d1421",border:"1px solid "+(errors.draft_class?"#e05050":"rgba(255,255,255,0.12)"),borderRadius:7,color:"#e0e0e0",padding:"9px 13px",fontSize:12,outline:"none",fontFamily:"monospace"}}>
                  {[2017,2018,2019,2020,2021,2022,2023,2024,2025,2026].map(y=><option key={y} value={String(y)}>{y}{y===2026?" (Projection)":""}</option>)}
                </select>
              </div>
              {inp("School / Team","school","e.g. Georgia")}
              {sel("Conference","conference",CONF_LIST)}
              {form.draft_class!=="2026"&&(
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>DRAFT ROUND</label>
                  <select value={form.draft_round} onChange={e=>set("draft_round",e.target.value)}
                    style={{width:"100%",background:"#0d1421",border:"1px solid rgba(255,255,255,0.12)",borderRadius:7,color:"#e0e0e0",padding:"9px 13px",fontSize:12,outline:"none",fontFamily:"monospace"}}>
                    <option value="">Undrafted (UDFA)</option>
                    {[1,2,3,4,5,6,7].map(r=><option key={r} value={String(r)}>Round {r}</option>)}
                  </select>
                </div>
              )}
              {form.draft_class!=="2026"&&form.draft_round&&form.draft_round!==""&&(
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>DRAFT PICK #</label>
                  <input type="number" value={form.draft_pick} onChange={e=>set("draft_pick",e.target.value)} placeholder="e.g. 22"
                    style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:7,color:"#e0e0e0",padding:"9px 13px",fontSize:12,outline:"none",fontFamily:"monospace"}}/>
                </div>
              )}
              {sel("Came Out As","came_out_as",["","Freshman","Sophomore","Junior","Senior","RS Freshman","RS Sophomore","RS Junior","RS Senior"])}
            </div>
            {form.draft_class==="2026"&&(
              <div style={{marginBottom:14,padding:"10px 14px",background:"rgba(0,131,143,0.08)",border:"1px solid rgba(0,131,143,0.2)",borderRadius:8,fontSize:10,color:"#00838f"}}>
                2026 class automatically marked as projection — draft info not applicable yet.
              </div>
            )}
            <div style={{marginBottom:8,padding:"10px 14px",background:"rgba(77,166,255,0.05)",border:"1px solid rgba(77,166,255,0.1)",borderRadius:8,fontSize:10,color:"#4da6ff88"}}>
              Rush and receiving archetypes will be automatically assigned from your season stats.
            </div>
          </div>
        )}

        {/* Step 1: Seasons */}
        {step===1&&(
          <div>
            <div style={{fontSize:10,color:"#555",marginBottom:16}}>Enter stats for each college season. At least Season 1 is required. Stats are used to calculate the prospect score.</div>
            {form.seasons.map((s,idx)=>(
              <div key={idx} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"16px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:s.redshirt?0:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#f0c040"}}>Season {s.n}</div>
                    {/* Portal badge — school differs from previous season */}
                    {idx>0&&s.school&&form.seasons[idx-1]?.school&&s.school!==form.seasons[idx-1].school&&(
                      <span style={{fontSize:9,padding:"2px 7px",background:"rgba(77,166,255,0.15)",border:"1px solid rgba(77,166,255,0.4)",borderRadius:10,color:"#4da6ff",fontWeight:700,letterSpacing:0.5}}>🔄 PORTAL</span>
                    )}
                    {s.redshirt&&<span style={{fontSize:18}}>🎽</span>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button onClick={()=>setSeason(idx,"redshirt",!s.redshirt)}
                      style={{background:s.redshirt?"rgba(240,192,64,0.15)":"rgba(255,255,255,0.04)",border:"1px solid "+(s.redshirt?"rgba(240,192,64,0.4)":"rgba(255,255,255,0.1)"),borderRadius:6,color:s.redshirt?"#f0c040":"#555",padding:"3px 10px",fontSize:9,cursor:"pointer"}}>
                      {s.redshirt?"✓ REDSHIRT":"REDSHIRT"}
                    </button>
                    {idx>0&&<button onClick={()=>removeSeason(idx)} style={{background:"rgba(224,80,80,0.1)",border:"1px solid rgba(224,80,80,0.25)",borderRadius:6,color:"#e05050",padding:"3px 10px",fontSize:9}}>REMOVE</button>}
                  </div>
                </div>
                {s.redshirt&&<div style={{textAlign:"center",padding:"10px 0",fontSize:10,color:"#555"}}>🎽 Redshirt season — no stats recorded</div>}
                {!s.redshirt&&(<div>{/* ── Year + School → auto SoS ── */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px",marginBottom:4}}>
                  {sInp(idx,"Season Year","yr","e.g. 2024","number")}
                  {/* College typeahead */}
                  {(()=>{
                    const allTeams=[...new Set(Object.values(SOS_LOOKUP).flat().map(t=>t.team))].sort();
                    const schoolVal=s.school||'';
                    const schoolLow=schoolVal.toLowerCase();
                    const ddOpen=ddOpenMap[idx]||false;
                    const setDdOpen=(v)=>setDdOpenMap(m=>({...m,[idx]:v}));
                    const suggestions=schoolVal.length>=1&&ddOpen
                      ? allTeams.filter(t=>t.toLowerCase().includes(schoolLow)).slice(0,8)
                      : [];
                    const pickSchool=(t)=>{
                      const yr3=String(s?.yr||'');
                      const pool2=[...(SOS_LOOKUP[yr3]||[]),...Object.values(sosByYear[yr3]||sosByYear[String(Number(yr3)-1)]||{})];
                      const m=pool2.find(d=>d.team.toLowerCase()===t.toLowerCase())
                        ||pool2.find(d=>d.team.toLowerCase().startsWith(t.toLowerCase()))
                        ||pool2.find(d=>t.toLowerCase().startsWith(d.team.toLowerCase()));
                      setForm(f=>({...f,seasons:f.seasons.map((ss,i)=>i===idx?{
                        ...ss,school:t,
                        sos_label:m?m.label:ss.sos_label,
                        sos_rank:m?String(m.rank||''):ss.sos_rank,
                        sos_mag:m?String(m.mag||''):ss.sos_mag
                      }:ss)}));
                      setDdOpen(false);
                    };
                    return (
                      <div style={{marginBottom:10,position:'relative'}}>
                        <label style={{fontSize:9,color:'#444',letterSpacing:1,display:'block',marginBottom:4}}>COLLEGE</label>
                        <input
                          type="text"
                          value={schoolVal}
                          onChange={e=>{setSeason(idx,'school',e.target.value);setDdOpen(true);}}
                          onFocus={()=>setDdOpen(true)}
                          onBlur={()=>setTimeout(()=>setDdOpen(false),150)}
                          placeholder="Start typing (e.g. Tex)"
                          autoComplete="off"
                          style={{width:'100%',boxSizing:'border-box',background:'#0d1421',border:'1px solid rgba(255,255,255,0.08)',borderRadius:6,color:'#ccc',padding:'7px 11px',fontSize:11,fontFamily:'monospace',outline:'none'}}
                        />
                        {suggestions.length>0&&(
                          <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#131a24',border:'1px solid rgba(255,255,255,0.12)',borderRadius:'0 0 7px 7px',zIndex:50,maxHeight:200,overflowY:'auto',boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                            {suggestions.map(t=>(
                              <div key={t}
                                onMouseDown={e=>{
                                  e.preventDefault();
                                  pickSchool(t);
                                }}
                                style={{padding:'7px 12px',fontSize:11,color:'#ccc',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',fontFamily:'monospace'}}
                                onMouseEnter={e=>e.currentTarget.style.background='rgba(240,192,64,0.08)'}
                                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                {(()=>{const q=schoolVal.toLowerCase();const tl=t.toLowerCase();const i=tl.indexOf(q);if(i<0) return t;return <>{t.slice(0,i)}<span style={{color:'#f0c040',fontWeight:700}}>{t.slice(i,i+schoolVal.length)}</span>{t.slice(i+schoolVal.length)}</>;})()}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {/* SoS auto-lookup — checks SOS_LOOKUP first, then uploaded sosByYear */}
                {(()=>{
                  const yr2=String(s?.yr||'');
                  const sc2=(s?.school||'').toLowerCase().trim();
                  if(!yr2||!sc2) return (
                    <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7,fontSize:9,color:"#444"}}>
                      Enter Season Year and College above to auto-populate Strength of Schedule.
                    </div>
                  );
                  // Search built-in data first, then uploaded
                  const builtIn=(SOS_LOOKUP[yr2]||[]);
                  const uploaded=Object.values(sosByYear[yr2]||sosByYear[String(Number(yr2)-1)]||{});
                  const pool=[...builtIn,...uploaded];
                  // Exact match first, then starts-with, then contains — prevents "Texas" beating "North Texas"
                  const match2=pool.find(d=>d.team.toLowerCase()===sc2)
                    ||pool.find(d=>d.team.toLowerCase().startsWith(sc2)&&sc2.length>3)
                    ||pool.find(d=>sc2.startsWith(d.team.toLowerCase())&&d.team.length>3)
                    ||pool.find(d=>d.team.toLowerCase().includes(sc2)&&sc2.length>4);
                  if(!match2) return (
                    <div style={{marginBottom:10,padding:"8px 12px",background:"rgba(240,135,58,0.05)",border:"1px solid rgba(240,135,58,0.2)",borderRadius:7,fontSize:9,color:"#f0873a"}}>
                      No SoS data found for "{s.school}" in {yr2}. Upload a new SoS season or check the school name spelling.
                    </div>
                  );
                  const applied=s.sos_label===match2.label&&String(s.sos_rank)===String(match2.rank||'');
                  const applyMatch=()=>setForm(f=>({...f,seasons:f.seasons.map((ss,i)=>i===idx?{...ss,sos_label:match2.label,sos_rank:String(match2.rank||''),sos_mag:String(match2.mag||'')}:ss)}));
                  return (
                    <div style={{marginBottom:10,padding:"8px 12px",background:applied?"rgba(93,191,106,0.06)":"rgba(77,166,255,0.06)",border:"1px solid "+(applied?"rgba(93,191,106,0.22)":"rgba(77,166,255,0.2)"),borderRadius:7,fontSize:10,display:"flex",alignItems:"center",gap:10,justifyContent:"space-between"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:14}}>📊</span>
                        <div style={{color:applied?"#5dbf6a":"#4da6ff"}}>
                          <strong>{match2.team}</strong> · {yr2}
                          <span style={{marginLeft:8,padding:"2px 8px",background:applied?"rgba(93,191,106,0.12)":"rgba(77,166,255,0.12)",borderRadius:4,fontSize:9,fontWeight:700}}>{match2.label}</span>
                          <span style={{color:applied?"#5dbf6a88":"#4da6ff88",marginLeft:8,fontSize:9}}>Rank #{match2.rank} · Mag {match2.mag?.toFixed(3)}</span>
                        </div>
                      </div>
                      {applied
                        ? <span style={{fontSize:9,color:"#5dbf6a88"}}>✓ applied</span>
                        : <button onClick={applyMatch} style={{background:"rgba(77,166,255,0.15)",border:"1px solid rgba(77,166,255,0.4)",borderRadius:5,color:"#4da6ff",fontSize:9,padding:"3px 12px",cursor:"pointer",fontFamily:"monospace",whiteSpace:"nowrap"}}>APPLY SoS</button>
                      }
                    </div>
                  );
                })()}
                {/* ── Rushing ── */}
                <div style={{fontSize:10,color:"#f0873a",letterSpacing:1,margin:"8px 0 10px"}}>— RUSHING —</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0 12px"}}>
                  {sInp(idx,"Attempts","attempts","","number")}
                  {sInp(idx,"Rush Yards","rush_yds","","number")}
                  {sInp(idx,"Y/Attempt","ypa","","number")}
                  {sInp(idx,"Rush TDs","rush_tds","","number")}
                  {sInp(idx,"Fumbles","fumbles","","number")}
                  {sInp(idx,"PFF Run Grade","run_grade","0–100","number")}
                  {sInp(idx,"YCO (Yds After Contact)","yco_a","","number")}
                  {/* MTF raw + MTF/A auto */}
                  {sInp(idx,"MTF (Missed Tackles)","mtf","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const mtf=parseFloat(s.mtf);
                    const val=(!isNaN(att)&&att>0&&!isNaN(mtf))?mtf/att:null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>MTF/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,padding:"7px 10px",fontSize:13,color:"#4da6ff",fontFamily:"monospace",minHeight:36}}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.mtf} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {/* 10+ raw + 10+/A auto */}
                  {sInp(idx,"10+ Yd Runs","ten_plus","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const tp=parseFloat(s.ten_plus);
                    const val=(!isNaN(att)&&att>0&&!isNaN(tp))?tp/att:null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>10+/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,padding:"7px 10px",fontSize:13,color:"#4da6ff",fontFamily:"monospace",minHeight:36}}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.ten_plus} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {/* 15+ raw + 15+/A auto */}
                  {sInp(idx,"15+ Yd Runs","fif_plus","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const fp=parseFloat(s.fif_plus);
                    const val=(!isNaN(att)&&att>0&&!isNaN(fp))?fp/att:null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>15+/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,padding:"7px 10px",fontSize:13,color:"#4da6ff",fontFamily:"monospace",minHeight:36}}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.fif_plus} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {sInp(idx,"BAY (Breakaway Yds)","bay","","number")}
                  {(()=>{
                    const bay=parseFloat(s.bay); const ryds=parseFloat(s.rush_yds);
                    const val=(!isNaN(bay)&&!isNaN(ryds)&&ryds>0)?bay/ryds*100:null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>BAY% <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,padding:"7px 10px",fontSize:13,color:"#4da6ff",fontFamily:"monospace",minHeight:36}}>
                          {val!==null?val.toFixed(2)+"%":<span style={{color:"#333"}}>—</span>}
                        </div>
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.bay} ÷ {s.rush_yds} × 100 = {val.toFixed(2)}%</div>}
                      </div>
                    );
                  })()}
                  {/* 1Ds raw + 1D/A auto */}
                  {sInp(idx,"1Ds (First Downs)","first_downs","","number")}
                  {(()=>{
                    const att=parseFloat(s.attempts); const fd=parseFloat(s.first_downs);
                    const val=(!isNaN(att)&&att>0&&!isNaN(fd))?fd/att:null;
                    return (
                      <div style={{marginBottom:10}}>
                        <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>1D/A <span style={{color:"#333"}}>(auto)</span></label>
                        <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,padding:"7px 10px",fontSize:13,color:"#4da6ff",fontFamily:"monospace",minHeight:36}}>
                          {val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}
                        </div>
                        {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.first_downs} ÷ {s.attempts} = {val.toFixed(2)}</div>}
                      </div>
                    );
                  })()}
                  {sInp(idx,"ELU (PFF Elusiveness)","elu","","number")}
                  {sInp(idx,"Yds Dominator %","ydom","","number")}
                  {sInp(idx,"TD Dominator %","tddom","","number")}
                </div>
                {/* ── Receiving ── */}
                <div style={{fontSize:10,color:"#5dbf6a",letterSpacing:1,margin:"8px 0 10px"}}>— RECEIVING —</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0 12px"}}>
                  {sInp(idx,"Targets","targets","","number")}
                  {sInp(idx,"Receptions","receptions","","number")}
                  {(()=>{
                    const tgt=parseFloat(s.targets),rec=parseFloat(s.receptions);
                    const val=(!isNaN(tgt)&&tgt>0&&!isNaN(rec))?rec/tgt*100:null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>REC% <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,padding:"7px 10px",fontSize:13,color:"#4da6ff",fontFamily:"monospace",minHeight:36}}>{val!==null?val.toFixed(2)+"%":<span style={{color:"#333"}}>—</span>}</div>
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.receptions} ÷ {s.targets} × 100 = {val.toFixed(2)}%</div>}
                    </div>);
                  })()}
                  {sInp(idx,"Rec Yards","rec_yds","","number")}
                  {(()=>{
                    const rec=parseFloat(s.receptions),ryds=parseFloat(s.rec_yds);
                    const val=(!isNaN(rec)&&rec>0&&!isNaN(ryds))?ryds/rec:null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>Y/Reception <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,padding:"7px 10px",fontSize:13,color:"#4da6ff",fontFamily:"monospace",minHeight:36}}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.rec_yds} ÷ {s.receptions} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                  {sInp(idx,"Rec TDs","rec_tds","","number")}
                  {sInp(idx,"PFF Recv Grade","recv_grade","0–100","number")}
                  {sInp(idx,"RECV (Receiving Snaps)","recv_snaps","","number")}
                  {sInp(idx,"YAC (Yards After Catch)","yac_raw","","number")}
                  {(()=>{
                    const rec=parseFloat(s.receptions),yac=parseFloat(s.yac_raw);
                    const val=(!isNaN(rec)&&rec>0&&!isNaN(yac))?yac/rec:null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>YAC/Reception <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,padding:"7px 10px",fontSize:13,color:"#4da6ff",fontFamily:"monospace",minHeight:36}}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.yac_raw} ÷ {s.receptions} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                  {(()=>{
                    const recv=parseFloat(s.recv_snaps),ryds=parseFloat(s.rec_yds);
                    const val=(!isNaN(recv)&&recv>0&&!isNaN(ryds))?ryds/recv:null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>Y/RR <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,padding:"7px 10px",fontSize:13,color:"#4da6ff",fontFamily:"monospace",minHeight:36}}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.rec_yds} ÷ {s.recv_snaps} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                  {sInp(idx,"ADOT (Avg Depth of Target)","adot","","number")}
                  {sInp(idx,"MTF (Missed Tackles)","mtf_recv","","number")}
                  {(()=>{
                    const rec=parseFloat(s.receptions),mtf=parseFloat(s.mtf_recv);
                    const val=(!isNaN(rec)&&rec>0&&!isNaN(mtf))?mtf/rec:null;
                    return(<div style={{marginBottom:10}}>
                      <label style={{fontSize:9,color:"#4da6ff",letterSpacing:1,display:"block",marginBottom:4}}>MTF/Reception <span style={{color:"#333"}}>(auto)</span></label>
                      <div style={{background:"rgba(77,166,255,0.06)",border:"1px solid rgba(77,166,255,0.18)",borderRadius:6,padding:"7px 10px",fontSize:13,color:"#4da6ff",fontFamily:"monospace",minHeight:36}}>{val!==null?val.toFixed(2):<span style={{color:"#333"}}>—</span>}</div>
                      {val!==null&&<div style={{fontSize:8,color:"#444",marginTop:2}}>{s.mtf_recv} ÷ {s.receptions} = {val.toFixed(2)}</div>}
                    </div>);
                  })()}
                </div></div>)
}</div>
            ))}
            {form.seasons.length < 5 && (
              <button onClick={addSeason} style={{width:"100%",background:"rgba(77,166,255,0.07)",border:"1px dashed rgba(77,166,255,0.25)",borderRadius:8,color:"#4da6ff",padding:"10px",fontSize:10,letterSpacing:2}}>
                + ADD SEASON {form.seasons.length+1}
              </button>
            )}
          </div>
        )}

        {/* Step 2: Athletic */}
        {step===2&&(
          <div>
            <div style={{fontSize:10,color:"#555",marginBottom:16}}>All athletic fields are optional. Leave blank if not available.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0 16px"}}>
              {inp("Height (inches)","height","e.g. 71.0","number")}
              {inp("Weight (lbs)","weight","e.g. 215","number")}
              {inp("40-Yd Dash","forty","e.g. 4.40","number")}
              {inp("10-Yd Split","ten_split","e.g. 1.54","number")}
              {inp("Vertical (in)","vert","e.g. 38.5","number")}
              {inp("Broad Jump (in)","broad","e.g. 125","number")}
              {inp("3-Cone (sec)","three_cone","e.g. 7.05","number")}
              {inp("Shuttle (sec)","shuttle","e.g. 4.25","number")}
              {inp("Arm Length (in)","arm","e.g. 31.5","number")}
              {inp("Hand Size (in)","hand","e.g. 9.5","number")}
              {inp("Wingspan (in)","wing","wing","e.g. 74.0","number")}
            </div>
            {inp("PFF Big Board Grade (0–100)","pff_grade","e.g. 85","number")}
          </div>
        )}

        {/* Step 3: NFL Outcomes (optional) */}
        {step===3&&(
          <div>
            <div style={{fontSize:10,color:"#555",marginBottom:16}}>Optional — fill in if this player has NFL data you want to track.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
              {inp("Best Fantasy Rank","nfl_best","e.g. 4","number")}
              {inp("Avg Fantasy Rank","nfl_avg","e.g. 8.5","number")}
              {inp("Top-12 Finishes","nfl_top12","e.g. 3","number")}
              {inp("Top-24 Finishes","nfl_top24","e.g. 5","number")}
              {inp("NFL Seasons Played","nfl_seasons","e.g. 4","number")}
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {/* Step 4: Recruiting */}
        {step===4&&(
          <div>
            <div style={{fontSize:10,color:"#555",marginBottom:16}}>Enter the player&#39;s recruiting profile. All fields are optional.</div>
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"16px",marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#f0c040",marginBottom:14}}>RECRUIT RANKING</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0 14px"}}>
                {/* Star rating */}
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:9,color:"#444",letterSpacing:1,display:"block",marginBottom:4}}>STAR RATING (0–5)</label>
                  <div style={{display:"flex",gap:6}}>
                    {[0,1,2,3,4,5].map(n=>(
                      <button key={n} onMouseDown={e=>{e.preventDefault();set("recruit_stars",String(n));}}
                        style={{flex:1,padding:"6px 0",borderRadius:6,border:"1px solid "+(String(form.recruit_stars)===String(n)?"rgba(240,192,64,0.6)":"rgba(255,255,255,0.1)"),background:String(form.recruit_stars)===String(n)?"rgba(240,192,64,0.15)":"rgba(255,255,255,0.03)",color:String(form.recruit_stars)===String(n)?"#f0c040":"#555",fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>
                        {n===0?"☆":n+"★"}
                      </button>
                    ))}
                  </div>
                </div>
                {inp("Recruit Rating (1–100)","recruit_rating","e.g. 92","number")}
                {inp("National Rank","recruit_nat","e.g. 15","number")}
                {inp("Position Rank (RB)","recruit_pos","e.g. 3","number")}
                {inp("State Rank","recruit_state","e.g. 2","number")}
                {inp("Enrollment Year","recruit_year","e.g. 2021","number")}
              </div>
              {/* Committed school — typeahead */}
              <div style={{marginBottom:10,position:"relative"}}>
                <label style={{fontSize:9,color:"#444",letterSpacing:1,display:"block",marginBottom:4}}>COMMITTED TO</label>
                {(()=>{
                  const allTeams=[...new Set(Object.values(SOS_LOOKUP).flat().map(t=>t.team))].sort();
                  allTeams.push("Other (FCS/Lower)");
                  const rv=form.recruit_school||"";
                  const rvLow=rv.toLowerCase();
                  const rcSugg=rv.length>=1&&rcOpen?allTeams.filter(t=>t.toLowerCase().includes(rvLow)).slice(0,8):[];
                  return(<>
                    <input type="text" value={rv}
                      onChange={e=>{set("recruit_school",e.target.value);setRcOpen(true);}}
                      onFocus={()=>setRcOpen(true)}
                      onBlur={()=>setTimeout(()=>setRcOpen(false),150)}
                      placeholder="Start typing school name..."
                      autoComplete="off"
                      style={{width:"100%",boxSizing:"border-box",background:"#0d1421",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,color:"#ccc",padding:"7px 11px",fontSize:11,fontFamily:"monospace",outline:"none"}}/>
                    {rcSugg.length>0&&(
                      <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#131a24",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"0 0 7px 7px",zIndex:50,maxHeight:200,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                        {rcSugg.map(t=>(
                          <div key={t} onMouseDown={e=>{e.preventDefault();set("recruit_school",t);setRcOpen(false);}}
                            style={{padding:"7px 12px",fontSize:11,color:t==="Other (FCS/Lower)"?"#f0873a":"#ccc",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.04)",fontFamily:"monospace"}}
                            onMouseEnter={e=>e.currentTarget.style.background="rgba(240,192,64,0.08)"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            {(()=>{const i=t.toLowerCase().indexOf(rvLow);if(i<0||!rvLow)return t;return<>{t.slice(0,i)}<span style={{color:"#f0c040",fontWeight:700}}>{t.slice(i,i+rv.length)}</span>{t.slice(i+rv.length)}</>;})()}
                          </div>
                        ))}
                      </div>
                    )}
                  </>);
                })()}
              </div>
              {/* Transfer info */}
              <div style={{marginTop:8,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{fontSize:9,color:"#555",letterSpacing:2,marginBottom:10}}>TRANSFER (if applicable)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
                  <div style={{marginBottom:10,position:"relative"}}>
                    <label style={{fontSize:9,color:"#444",letterSpacing:1,display:"block",marginBottom:4}}>TRANSFERRED TO</label>
                    {(()=>{
                      const allTeams2=[...new Set(Object.values(SOS_LOOKUP).flat().map(t=>t.team))].sort();
                      allTeams2.push("Other (FCS/Lower)");
                      const tv=form.transfer_to||"";
                      const tvLow=tv.toLowerCase();
                      const trSugg=tv.length>=1&&trOpen?allTeams2.filter(t=>t.toLowerCase().includes(tvLow)).slice(0,8):[];
                      return(<>
                        <input type="text" value={tv}
                          onChange={e=>{set("transfer_to",e.target.value);setTrOpen(true);}}
                          onFocus={()=>setTrOpen(true)}
                          onBlur={()=>setTimeout(()=>setTrOpen(false),150)}
                          placeholder="Start typing..."
                          autoComplete="off"
                          style={{width:"100%",boxSizing:"border-box",background:"#0d1421",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,color:"#ccc",padding:"7px 11px",fontSize:11,fontFamily:"monospace",outline:"none"}}/>
                        {trSugg.length>0&&(
                          <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#131a24",border:"1px solid rgba(255,255,255,0.12)",borderRadius:"0 0 7px 7px",zIndex:50,maxHeight:160,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                            {trSugg.map(t=>(
                              <div key={t} onMouseDown={e=>{e.preventDefault();set("transfer_to",t);setTrOpen(false);}}
                                style={{padding:"7px 12px",fontSize:11,color:t==="Other (FCS/Lower)"?"#f0873a":"#ccc",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.04)",fontFamily:"monospace"}}
                                onMouseEnter={e=>e.currentTarget.style.background="rgba(240,192,64,0.08)"}
                                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                {t}
                              </div>
                            ))}
                          </div>
                        )}
                      </>);
                    })()}
                  </div>
                  {inp("Transfer Year","transfer_year","e.g. 2023","number")}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step===5&&previewScore&&(
          <div>
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"20px",marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:22,fontWeight:900,color:"#fff",marginBottom:4}}>{form.name||"—"}</div>
                  <div style={{fontSize:11,color:"#555"}}>{form.school} · {form.conference} · {form.draft_class} class</div>
                  <div style={{fontSize:10,color:"#555",marginTop:2}}>{autoArchetype(form).rush_arch} · {autoArchetype(form).recv_arch} <span style={{color:"#444"}}>(auto-assigned)</span></div>
                  {(form.draft_round)&&<div style={{fontSize:10,color:"#f0c040",marginTop:4}}>Rd {form.draft_round}{form.draft_pick?" · Pick #"+form.draft_pick:""}</div>}
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:48,fontWeight:900,color:(TIER_STYLE[previewScore.tier]||TIER_STYLE.Fringe).accent,lineHeight:1}}>{previewScore.prospect_score}</div>
                  <div style={{fontSize:9,color:"#444",letterSpacing:2}}>PROSPECT SCORE</div>
                  <div style={{fontSize:12,fontWeight:700,color:(TIER_STYLE[previewScore.tier]||TIER_STYLE.Fringe).accent,marginTop:4}}>{previewScore.tier}</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:16}}>
                {[["PRODUCTION",previewScore.prod_trajectory,"#f0873a"],["ATHLETIC",previewScore.athl_score,"#4da6ff"],["PFF GRADE",previewScore.pff_score,"#5dbf6a"]].map(([lbl,val,c])=>(
                  <div key={lbl} style={{background:"rgba(255,255,255,0.04)",borderRadius:7,padding:"10px 12px",textAlign:"center"}}>
                    <div style={{fontSize:8,color:"#444",letterSpacing:1,marginBottom:4}}>{lbl}</div>
                    <div style={{fontSize:20,fontWeight:800,color:c}}>{val!=null?val.toFixed(1):"—"}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{fontSize:10,color:"#555",marginBottom:16,padding:"10px 14px",background:"rgba(240,192,64,0.05)",border:"1px solid rgba(240,192,64,0.12)",borderRadius:8}}>
              <strong style={{color:"#f0c04088"}}>Note:</strong> Scores are estimated from the data you entered. The model uses simplified calculations for manually added players — percentile bars in the Seasons tab will show raw values only (no historical percentiles available for custom entries). Athletic ranks will show N/A since composite scores require the full dataset.
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div style={{display:"flex",justifyContent:"space-between",marginTop:20,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          <button onClick={step===0?onClose:back}
            style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:8,color:"#666",padding:"9px 20px",fontSize:10,letterSpacing:1}}>
            {step===0?"CANCEL":"← BACK"}
          </button>
          {step<5
            ? <button onClick={next} style={{background:"rgba(240,192,64,0.12)",border:"1px solid rgba(240,192,64,0.35)",borderRadius:8,color:"#f0c040",padding:"9px 20px",fontSize:10,letterSpacing:1,fontWeight:700}}>
                NEXT →
              </button>
            : <button onClick={handleSave} style={{background:"rgba(93,191,106,0.15)",border:"1px solid rgba(93,191,106,0.4)",borderRadius:8,color:"#5dbf6a",padding:"9px 24px",fontSize:11,letterSpacing:1,fontWeight:700}}>
                ✓ ADD PLAYER
              </button>
          }
        </div>
      </div>
    </div>
  );
}

export default AddPlayerModal;