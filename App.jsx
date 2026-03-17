import React, { useState, useMemo, useEffect } from 'react';
import { ALL_PLAYERS_BASE as ALL_PLAYERS, TIER_STYLE, RUSH_ARCH_COLORS, RECV_ARCH_COLORS } from './data/playersBase.js';
import { RAS_BY_PLAYER } from './data/rasByPlayer.js';
import { ArchTag } from './components/ScoringComponents.jsx';
import ArchetypePage from './components/ArchetypePage.jsx';
import IdealBuildPage from './components/IdealBuildPage.jsx';
import PlayerCard from './components/PlayerCard.jsx';
import AddPlayerModal from './components/AddPlayerModal.jsx';
import EditPlayerModal from './components/EditPlayerModal.jsx';
import ValModal from './components/ValModal.jsx';
import PasscodeModal from './components/PasscodeModal.jsx';
import SoSUploadModal from './components/SoSUploadModal.jsx';
import { buildProspectScore, autoArchetype } from './logic/scoring.jsx';

const YEAR_WEIGHTS = [25, 28, 30, 28, 25];

const toNum = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const readRow = (row, idx) => {
  if (!row || !Array.isArray(row[idx])) return 0;
  const n = Number(row[idx][0]);
  return Number.isFinite(n) ? n : 0;
};

const calcAthleticComposite = (player) => {
  const athletic = player?.athletic || {};
  const forty = toNum(athletic?.forty?.val ?? athletic?.['40T']?.val);
  const vert = toNum(athletic?.vert?.val);
  const weight = toNum(athletic?.weight?.val) ?? 200;

  const score40 = forty && forty > 0 ? Math.max(0, Math.min(100, ((4.8 - forty) / 0.4) * 50 + 50)) : 50;
  const scoreVert = vert && vert > 0 ? Math.max(0, Math.min(100, ((vert - 25) / 18) * 100)) : 50;
  const scoreWeight = Math.max(0, Math.min(100, ((weight - 170) / 60) * 100));
  let base = forty && forty > 0 ? score40 * 0.5 + scoreVert * 0.3 + scoreWeight * 0.2 : 50;

  const ras = toNum(athletic?.ras?.val ?? player?.ras);
  if (ras != null) {
    const rasBonus = Math.max(0.85, Math.min(1.15, 0.85 + ras / 30));
    base *= rasBonus;
  }

  return Math.max(0, Math.min(100, base));
};

const calcSeasonComponents = (seasonInput) => {
  const scoreObj = buildProspectScore([seasonInput], true);
  const adjScore = scoreObj.prod_trajectory || 0;

  const rushProxy = (
    (toNum(seasonInput.rush_yds) || 0) / 18 +
    (toNum(seasonInput.rush_tds) || 0) * 2.4 +
    (toNum(seasonInput.ypa) || 0) * 8 +
    (toNum(seasonInput.run_grade) || 0) * 0.35 +
    (toNum(seasonInput.yco_a) || 0) * 6 +
    (toNum(seasonInput.mtf_a) || 0) * 26
  );

  const recvProxy = (
    (toNum(seasonInput.rec_yds) || 0) / 8 +
    (toNum(seasonInput.rec_tds) || 0) * 3.2 +
    (toNum(seasonInput.targets) || 0) * 0.7 +
    (toNum(seasonInput.receptions) || 0) * 0.9 +
    (toNum(seasonInput.recv_grade) || 0) * 0.42 +
    (toNum(seasonInput.yac_rec) || 0) * 6 +
    (toNum(seasonInput.mtf_rec) || 0) * 24
  );

  const clamp = (v) => Math.max(0, Math.min(100, v));
  return {
    rushScore: clamp(rushProxy),
    recvScore: clamp(recvProxy),
    adjScore: clamp(adjScore),
  };
};

const weightedAvg = (values) => {
  if (!values.length) return 0;
  const totalWeight = values.reduce((sum, _, i) => sum + (YEAR_WEIGHTS[i] || 25), 0);
  if (!totalWeight) return 0;
  return values.reduce((sum, value, i) => sum + value * (YEAR_WEIGHTS[i] || 25), 0) / totalWeight;
};

function App() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showVal, setShowVal] = useState(false);
  const [suggestions, setSugg] = useState([]);
  const [tierFilter, setTier] = useState(null);
  const [classFilter, setClass] = useState(null);
  const [page, setPage] = useState("prospects");
  const [rushArchFilter, setRushArch] = useState(null);
  const [recvArchFilter, setRecvArch] = useState(null);
  const [trajFilter, setTrajFilter] = useState(null);
  const [roundFilter, setRoundFilter] = useState(null);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const [showAdd, setShowAdd] = useState(false);
  const [customPlayers, setCustom] = useState({});
  const [customSeasons, setCustomSS] = useState({});
  const [customSoS, setCustomSoS] = useState({});
  const [showSoS, setShowSoS] = useState(false);
  const [passcodeGate, setPasscodeGate] = useState(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  const ALL_DATA = useMemo(() => {
    const merged = { ...ALL_PLAYERS, ...customPlayers };
    const withRas = {};

    for (const [name, player] of Object.entries(merged)) {
      const ras = Number(RAS_BY_PLAYER[name]);
      if (!Number.isFinite(ras) || ras <= 0) {
        withRas[name] = player;
        continue;
      }

      const nextAthletic = player?.athletic && typeof player.athletic === 'object'
        ? { ...player.athletic }
        : {};

      if (nextAthletic.ras == null) {
        nextAthletic.ras = { val: ras, rank: null, total: null };
      }

      withRas[name] = {
        ...player,
        ras: player?.ras ?? ras,
        athletic: nextAthletic,
      };
    }

    return withRas;
  }, [customPlayers]);
  const allNames = useMemo(() => Object.keys(ALL_DATA).sort((a, b) => ALL_DATA[a].rank - ALL_DATA[b].rank), [ALL_DATA]);
  const draftClasses = useMemo(() => [...new Set(allNames.map(n => ALL_DATA[n].draft_class).filter(Boolean))].sort((a, b) => Number(a) - Number(b)), [allNames]);

  useEffect(() => {
    if (query.length < 2) { setSugg([]); return; }
    const q = query.toLowerCase();
    setSugg(allNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8));
  }, [query]);

  const open = name => { setSelected(name); setQuery(""); setSugg([]); };
  const openPlayer = name => { setSelected(name); setQuery(""); setSugg([]); };

  const display = useMemo(() => {
    let names = allNames;
    if (classFilter) names = names.filter(n => ALL_DATA[n].draft_class === classFilter);
    if (tierFilter) names = names.filter(n => ALL_DATA[n].tier === tierFilter);
    if (rushArchFilter) names = names.filter(n => ALL_DATA[n].rush_arch === rushArchFilter);
    if (recvArchFilter) names = names.filter(n => ALL_DATA[n].recv_arch === recvArchFilter);
    if (roundFilter) names = names.filter(n => String(ALL_DATA[n].draft_round) === String(roundFilter));
    if (trajFilter === "breakout") names = names.filter(n => ALL_DATA[n].breakout_tag === true);
    if (trajFilter === "late_decline") names = names.filter(n => ALL_DATA[n].late_decline === true);
    if (!tierFilter && !classFilter && !rushArchFilter && !recvArchFilter && !trajFilter && !sortBy && !roundFilter) names = names.slice(0, 20);
    if (sortBy) {
      const invertSort = sortBy === "draft_round" || sortBy === "draft_pick";
      const key = sortBy === "consistency" ? "traj_consistency" : sortBy === "improvement" ? "traj_improvement" : sortBy === "rush_trajectory" ? "rush_trajectory" : sortBy === "recv_trajectory" ? "recv_trajectory" : sortBy === "proj_t12" ? "proj_t12" : sortBy === "proj_t24" ? "proj_t24" : sortBy === "athl_score" ? "athl_score" : sortBy === "draft_round" ? "draft_round" : "draft_pick";
      names = [...names].sort((a, b) => {
        const va = ALL_DATA[a][key] ?? 99999, vb = ALL_DATA[b][key] ?? 99999;
        const dir = invertSort ? (sortDir === "desc" ? 1 : -1) : (sortDir === "desc" ? -1 : 1);
        return (va - vb) * dir;
      });
    }
    return names;
  }, [allNames, tierFilter, classFilter, rushArchFilter, recvArchFilter, trajFilter, roundFilter, sortBy, sortDir]);

  const handleArchFilter = (side, key) => {
    if (side === "rush") { setRushArch(key); setRecvArch(null); } else { setRecvArch(key); setRushArch(null); }
    setPage("prospects");
  };

  const exportData = () => {
    const custom = Object.entries(customPlayers);
    if (!custom.length) { alert("No custom players to export yet."); return; }
    const exportObj = { version: "rbscout_v6_custom", exported: new Date().toISOString(), players: customPlayers, seasons: customSeasons };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rbscout_custom_players_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const obj = JSON.parse(ev.target.result);
        if (obj.version !== "rbscout_v6_custom") { alert("Unrecognized file format."); return; }
        setCustom(prev => ({ ...prev, ...obj.players }));
        const merged = { ...(_customSS || {}), ...obj.seasons };
        _customSS = merged;
        setCustomSS(merged);
        alert("Imported " + Object.keys(obj.players).length + " player(s) successfully.");
      } catch (e) { alert("Could not parse file."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#06080f", color: "#fff", fontFamily: "monospace" }}>
      <div style={{ background: "linear-gradient(180deg,#0a0f1c,#06080f)", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "14px 14px 12px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 8, color: "#333", letterSpacing: 3, marginBottom: 3 }}>COLLEGE RB PROSPECT MODEL · V6</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1 }}>RB <span style={{ color: "#f0c040" }}>Scout</span></div>
              <div style={{ fontSize: 9, color: "#444", marginTop: 1 }}>{Object.keys(ALL_DATA).length} prospects · 2017–2026 · Prod 75% · Athl 10% · PFF 15%</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
              <button onClick={() => setShowVal(true)} style={{ background: "rgba(240,192,64,0.08)", border: "1px solid rgba(240,192,64,0.3)", color: "#f0c040", padding: "6px 10px", borderRadius: 7, fontSize: 8, letterSpacing: 1.5 }}>VALIDATE ↗</button>
              <button onClick={() => adminUnlocked ? setShowAdd(true) : setPasscodeGate("add")} style={{ background: "rgba(93,191,106,0.10)", border: "1px solid rgba(93,191,106,0.35)", color: "#5dbf6a", padding: "6px 10px", borderRadius: 7, fontSize: 8, letterSpacing: 1.5, fontWeight: 700 }}>+ ADD</button>
              {Object.keys(customPlayers).length > 0 && <button onClick={exportData} style={{ background: "rgba(77,166,255,0.10)", border: "1px solid rgba(77,166,255,0.30)", color: "#4da6ff", padding: "6px 10px", borderRadius: 7, fontSize: 8, letterSpacing: 1.5, fontWeight: 700 }}>↓ EXPORT</button>}
              <label style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#666", padding: "6px 10px", borderRadius: 7, fontSize: 8, letterSpacing: 1.5, cursor: "pointer" }}>↑ IMPORT<input type="file" accept=".json" onChange={importData} style={{ display: "none" }} /></label>
              <button onClick={() => adminUnlocked ? setShowSoS(true) : setPasscodeGate("sos")} style={{ background: "rgba(77,166,255,0.08)", border: "1px solid rgba(77,166,255,0.25)", color: "#4da6ff", padding: "6px 10px", borderRadius: 7, fontSize: 8, letterSpacing: 1.5, fontWeight: 700 }}>SoS ↑</button>
            </div>
          </div>
          <div style={{ marginBottom: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 9, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 5, letterSpacing: -0.2 }}>The most data-driven college RB evaluation model available.</div>
            <div style={{ fontSize: 13, color: "#777", lineHeight: 1.7 }}>RB Scout grades every prospect across production trajectory, athletic testing, and PFF board scores — then validates each metric against real NFL outcomes from 166 drafted backs. Use it to cut through the noise of draft season, surface undervalued prospects, and understand exactly what college statistics actually predict success at the next level.</div>
          </div>
          <div style={{ display: "flex", gap: 0, borderRadius: 7, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", width: "fit-content", marginBottom: 10 }}>
            {[["prospects", "Prospects"], ["archetypes", "Archetypes"], ["idealbuild", "Ideal Build"]].map(([p, lbl]) => (
              <button key={p} onClick={() => setPage(p)} style={{ padding: "7px 11px", border: "none", background: page === p ? "rgba(240,192,64,0.12)" : "transparent", color: page === p ? "#f0c040" : "#555", fontSize: 8, letterSpacing: 1, fontWeight: page === p ? 700 : 400, borderRight: p === "prospects" ? "1px solid rgba(255,255,255,0.07)" : "none" }}>{lbl.toUpperCase()}</button>
            ))}
          </div>
          {page === "prospects" && <div style={{ position: "relative", marginTop: 2 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${Object.keys(ALL_DATA).length} players...`} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "#fff", fontSize: 14, outline: "none" }} />
            {suggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200, background: "#111724", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.7)" }}>
                {suggestions.map(name => {
                  const d = ALL_DATA[name]; const ts = TIER_STYLE[d.tier] || TIER_STYLE.Fringe;
                  return (
                    <div key={name} onClick={() => openPlayer(name)} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{name}</span>
                        <span style={{ color: ts.accent, fontSize: 9, marginLeft: 8 }}>{d.tier}</span>
                        {d.is_projection && <span style={{ color: "#00838f", fontSize: 9, marginLeft: 6 }}>★ 2026</span>}
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <span style={{ color: ts.accent, fontSize: 15, fontWeight: 700 }}>{d.prospect_score != null ? d.prospect_score.toFixed(1) : "—"}</span>
                        <span style={{ color: "#444", fontSize: 10, marginLeft: 5 }}>#{d.rank}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>}
        </div>
      </div>
      {page === "archetypes" && <ArchetypePage onFilter={handleArchFilter} rushFilter={rushArchFilter} recvFilter={recvArchFilter} onOpenPlayer={openPlayer} />}
      {page === "idealbuild" && <IdealBuildPage onOpenPlayer={openPlayer} />}
      {page === "prospects" && <div style={{ maxWidth: 960, margin: "0 auto", padding: "14px 10px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 8, color: "#444", letterSpacing: 2 }}>DRAFT CLASS</label>
            <div style={{ position: "relative" }}>
              <select value={classFilter || ""} onChange={e => setClass(e.target.value || null)} style={{ appearance: "none", WebkitAppearance: "none", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: classFilter ? "#f0c040" : "#aaa", fontSize: 10, padding: "7px 30px 7px 12px", outline: "none", cursor: "pointer", minWidth: 110, fontFamily: "monospace", letterSpacing: 1 }}>
                <option value="">All Classes</option>
                {draftClasses.map(yr => <option key={yr} value={yr}>{yr}{yr === 2026 ? " (Proj)" : ""}</option>)}
              </select>
              <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 9, pointerEvents: "none" }}>v</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 8, color: "#444", letterSpacing: 2 }}>PROSPECT TIER</label>
            <div style={{ position: "relative" }}>
              <select value={tierFilter || ""} onChange={e => setTier(e.target.value || null)} style={{ appearance: "none", WebkitAppearance: "none", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: tierFilter ? (TIER_STYLE[tierFilter] || TIER_STYLE.Fringe).accent : "#aaa", fontSize: 10, padding: "7px 30px 7px 12px", outline: "none", cursor: "pointer", minWidth: 130, fontFamily: "monospace", letterSpacing: 1 }}>
                <option value="">All Tiers</option>
                {["Elite", "Starter", "Rotational", "Developmental", "Fringe"].map(t => {
                  const cnt = allNames.filter(n => ALL_DATA[n].tier === t && (!classFilter || ALL_DATA[n].draft_class === classFilter)).length;
                  return <option key={t} value={t}>{t} ({cnt})</option>;
                })}
              </select>
              <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 9, pointerEvents: "none" }}>v</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 8, color: "#f0873a", letterSpacing: 2 }}>RUSH ARCHETYPE</label>
            <div style={{ position: "relative" }}>
              <select value={rushArchFilter || ""} onChange={e => { setRushArch(e.target.value || null); }} style={{ appearance: "none", WebkitAppearance: "none", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(240,135,58,0.25)", borderRadius: 7, color: rushArchFilter ? (RUSH_ARCH_COLORS[rushArchFilter] || "#f0873a") : "#aaa", fontSize: 10, padding: "7px 30px 7px 12px", outline: "none", cursor: "pointer", minWidth: 155, fontFamily: "monospace", letterSpacing: 0.5 }}>
                <option value="">All Rush Types</option>
                {Object.keys(RUSH_ARCH_COLORS).map(arch => {
                  const cnt = allNames.filter(n => ALL_DATA[n].rush_arch === arch).length;
                  return <option key={arch} value={arch}>{arch} ({cnt})</option>;
                })}
              </select>
              <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 9, pointerEvents: "none" }}>v</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 8, color: "#00bcd4", letterSpacing: 2 }}>RECV ARCHETYPE</label>
            <div style={{ position: "relative" }}>
              <select value={recvArchFilter || ""} onChange={e => { setRecvArch(e.target.value || null); }} style={{ appearance: "none", WebkitAppearance: "none", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,188,212,0.25)", borderRadius: 7, color: recvArchFilter ? "#00bcd4" : "#aaa", fontSize: 10, padding: "7px 30px 7px 12px", outline: "none", cursor: "pointer", minWidth: 170, fontFamily: "monospace", letterSpacing: 0.5 }}>
                <option value="">All Recv Types</option>
                {Object.keys(RECV_ARCH_COLORS).map(arch => {
                  const cnt = allNames.filter(n => ALL_DATA[n].recv_arch === arch).length;
                  return <option key={arch} value={arch}>{arch} ({cnt})</option>;
                })}
              </select>
              <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 9, pointerEvents: "none" }}>v</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 8, color: "#aaa", letterSpacing: 2 }}>TRAJECTORY</label>
            <div style={{ position: "relative" }}>
              <select value={trajFilter || ""} onChange={e => setTrajFilter(e.target.value || null)} style={{ appearance: "none", WebkitAppearance: "none", background: "rgba(255,255,255,0.05)", border: `1px solid ${trajFilter === "breakout" ? "rgba(0,230,130,0.35)" : trajFilter === "late_decline" ? "rgba(240,80,80,0.35)" : "rgba(255,255,255,0.12)"}`, borderRadius: 7, color: trajFilter === "breakout" ? "#00e682" : trajFilter === "late_decline" ? "#e05050" : "#aaa", fontSize: 10, padding: "7px 30px 7px 12px", outline: "none", cursor: "pointer", minWidth: 155, fontFamily: "monospace", letterSpacing: 0.5 }}>
                <option value="">All Trajectories</option>
                <option value="breakout">⚡ Breakout ({Object.values(ALL_DATA).filter(d => d.breakout_tag).length})</option>
                <option value="late_decline">↘ Late Decline ({Object.values(ALL_DATA).filter(d => d.late_decline).length})</option>
              </select>
              <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 9, pointerEvents: "none" }}>v</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 8, color: "#aaa", letterSpacing: 2 }}>DRAFT ROUND</label>
            <div style={{ position: "relative" }}>
              <select value={roundFilter || ""} onChange={e => setRoundFilter(e.target.value || null)} style={{ appearance: "none", WebkitAppearance: "none", background: "rgba(255,255,255,0.05)", border: `1px solid ${roundFilter ? "rgba(240,192,64,0.35)" : "rgba(255,255,255,0.12)"}`, borderRadius: 7, color: roundFilter ? "#f0c040" : "#aaa", fontSize: 10, padding: "7px 28px 7px 12px", outline: "none", cursor: "pointer", minWidth: 120, fontFamily: "monospace", letterSpacing: 0.5 }}>
                <option value="">All Rounds</option>
                {[1, 2, 3, 4, 5, 6, 7].map(r => {
                  const cnt = Object.values(ALL_DATA).filter(p => String(p.draft_round) === String(r)).length;
                  return <option key={r} value={r}>Round {r} ({cnt})</option>;
                })}
              </select>
              <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 9, pointerEvents: "none" }}>v</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 8, color: "#aaa", letterSpacing: 2 }}>SORT BY</label>
            <div style={{ display: "flex", gap: 4 }}>
              <div style={{ position: "relative" }}>
                <select value={sortBy || ""} onChange={e => setSortBy(e.target.value || null)} style={{ appearance: "none", WebkitAppearance: "none", background: "rgba(255,255,255,0.05)", border: `1px solid ${sortBy ? "rgba(77,166,255,0.35)" : "rgba(255,255,255,0.12)"}`, borderRadius: 7, color: sortBy ? "#4da6ff" : "#aaa", fontSize: 10, padding: "7px 28px 7px 12px", outline: "none", cursor: "pointer", minWidth: 150, fontFamily: "monospace", letterSpacing: 0.5 }}>
                  <option value="">Default (Rank)</option>
                  <option value="rush_trajectory">Rushing Trajectory</option>
                  <option value="recv_trajectory">Receiving Trajectory</option>
                  <option value="improvement">Improvement Score</option>
                  <option value="consistency">Consistency Score</option>
                  <option value="proj_t12">Proj. Top-12 Rate</option>
                  <option value="proj_t24">Proj. Top-24 Rate</option>
                  <option value="athl_score">Athletic Score</option>
                  <option value="draft_round">Draft Round</option>
                  <option value="draft_pick">Draft Pick</option>
                </select>
                <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 9, pointerEvents: "none" }}>v</span>
              </div>
              {sortBy && <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")} title={sortDir === "desc" ? "Highest first (click to flip)" : "Lowest first (click to flip)"} style={{ padding: "7px 11px", borderRadius: 7, border: "1px solid rgba(77,166,255,0.35)", background: "rgba(77,166,255,0.08)", color: "#4da6ff", fontSize: 11, cursor: "pointer", fontFamily: "monospace", lineHeight: 1 }}> {sortDir === "desc" ? "↓ Hi→Lo" : "↑ Lo→Hi"}</button>}
            </div>
          </div>
          {(classFilter || tierFilter || rushArchFilter || recvArchFilter || trajFilter || roundFilter || sortBy) && <button onClick={() => { setClass(null); setTier(null); setRushArch(null); setRecvArch(null); setTrajFilter(null); setRoundFilter(null); setSortBy(null); setSortDir("desc"); }} style={{ alignSelf: "flex-end", padding: "7px 14px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#555", fontSize: 8, letterSpacing: 2, marginBottom: 0 }}>CLEAR ALL</button>}
        </div>
        <div style={{ fontSize: 9, color: "#333", letterSpacing: 3, marginBottom: 10 }}>
          {(classFilter || tierFilter || rushArchFilter || recvArchFilter) ? [classFilter, tierFilter, rushArchFilter, recvArchFilter].filter(Boolean).join(" · ").toUpperCase() + " — " : "TOP 20 — "}
          {display.length} PLAYERS · CLICK TO OPEN
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,240px),1fr))", gap: 7 }}>
          {display.map(name => {
            const d = ALL_DATA[name]; const ts = TIER_STYLE[d.tier] || TIER_STYLE.Fringe;
            return (
              <div key={name} onClick={() => openPlayer(name)} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid " + ts.accent + "1a", borderRadius: 9, padding: "11px 13px", cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.background = ts.accent + "0d"; e.currentTarget.style.borderColor = ts.accent + "44"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; e.currentTarget.style.borderColor = ts.accent + "1a"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, marginBottom: 2 }}><span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>#{d.rank}</span><span style={{ color: "#444" }}> · </span><span style={{ color: (TIER_STYLE[d.tier] || TIER_STYLE.Fringe).accent, fontWeight: 600 }}>{d.tier.toUpperCase()}{d.is_projection ? " · ★" : ""}</span></div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                    <div style={{ fontSize: 9, color: "#444", marginTop: 1 }}>
                      {d.draft_class}
                      {d.draft_round && !d.is_projection && <span style={{ color: "#f0c040", marginLeft: 5 }}>{d.draft_round === "UDFA" ? "UDFA" : "Rd " + d.draft_round + (d.draft_pick ? " #" + d.draft_pick : "")}</span>}
                      {d.transfer_to && d.transfer_to != "nan" && <span style={{ color: "#4da6ff", marginLeft: 5 }}>portal</span>}
                    </div>
                    <div style={{ marginTop: 5, display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {d.rush_arch && <ArchTag label={d.rush_arch} colors={RUSH_ARCH_COLORS} />}
                      {d.recv_arch && <ArchTag label={d.recv_arch} colors={RECV_ARCH_COLORS} />}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", marginLeft: 8, flexShrink: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 900, color: ts.accent, lineHeight: 1 }}>{d.prospect_score != null ? d.prospect_score.toFixed(1) : "—"}</div>
                    <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", marginTop: 3 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontSize: 10, color: "#f0873a" }}>RUS:{d.rush_trajectory != null ? d.rush_trajectory.toFixed(0) : "—"}</span>
                        <span style={{ fontSize: 10, color: "#5dbf6a" }}>IMP:{d.traj_improvement != null ? d.traj_improvement.toFixed(0) : "—"}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontSize: 10, color: "#5dbf6a" }}>REC:{d.recv_trajectory != null ? d.recv_trajectory.toFixed(0) : "—"}</span>
                        <span style={{ fontSize: 10, color: "#c084fc" }}>CON:{d.traj_consistency != null ? d.traj_consistency.toFixed(0) : "—"}</span>
                        <span style={{ fontSize: 10, color: "#4da6ff" }}>ATH:{d.athl_score != null ? d.athl_score.toFixed(0) : "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 8, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.05)" }}>
                  <div style={{ height: "100%", width: (d.prospect_score || 0) + "%", background: ts.accent, borderRadius: 1 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>}
      {selected && ALL_DATA[selected] && <PlayerCard player={selected} data={ALL_DATA[selected]} onClose={() => setSelected(null)} onSelectPlayer={openPlayer} />}
      {showVal && <ValModal onClose={() => setShowVal(false)} />}
      {passcodeGate && <PasscodeModal onClose={() => setPasscodeGate(null)} onSuccess={() => { setAdminUnlocked(true); setPasscodeGate(null); if (passcodeGate === 'add') setShowAdd(true); else setShowSoS(true); }} />}
      {showSoS && <SoSUploadModal onClose={() => setShowSoS(false)} existing={customSoS} onSave={(yr, data, replace) => { if (replace) { setCustomSoS(replace); } else if (yr && data) { setCustomSoS(prev => ({ ...prev, [yr]: data })); } setShowSoS(false); }} />}
      {showAdd && <AddPlayerModal onClose={() => setShowAdd(false)} existingPlayers={ALL_DATA} onAdd={(name, playerData, seasons) => {
        setCustom(prev => ({ ...prev, [name]: playerData }));
        const ssMap = {};
        seasons.forEach((s, i) => {
          const key = String(s.n || i + 1);
          const row = Array(26).fill(null).map(() => [null, null]);
          const rushKeys = [s.attempts, s.rush_yds, s.ypa, s.rush_tds, null, s.run_grade, s.yco_a, s.mtf_a, null, null, null, null, s.ydom, s.tddom];
          const recvKeys = [s.targets, s.receptions, null, s.rec_yds, s.yds_per_rec, s.rec_tds, s.recv_grade, null, s.yac_rec, null, null, s.mtf_rec];
          rushKeys.forEach((v, ri) => { if (v != null && v !== "") row[ri] = [parseFloat(v), null]; });
          recvKeys.forEach((v, ri) => { if (v != null && v !== "") row[14 + ri] = [parseFloat(v), null]; });
          ssMap[key] = row;
        });
        setCustomSS(prev => { const n = { ...prev, [name]: ssMap }; _customSS = n; return n; });
        setShowAdd(false);
      }} sosByYear={customSoS} />}
    </div>
  );
}

export default App;