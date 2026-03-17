import React, { useMemo, useState } from 'react';

const toNum = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getStat = (row, idx) => {
  if (!row || !Array.isArray(row[idx])) return '';
  const v = row[idx][0];
  return v == null ? '' : String(v);
};

function seasonToForm(season = {}, row = []) {
  return {
    n: season.n || 1,
    yr: season.yr ?? '',
    school: season.school || season.sc || '',
    conf: season.conf || '',
    sos_label: season.sos_label || '',
    sos_rank: season.sos_rank ?? '',
    attempts: getStat(row, 0),
    rush_yds: getStat(row, 1),
    ypa: getStat(row, 2),
    rush_tds: getStat(row, 3),
    run_grade: getStat(row, 5),
    yco_a: getStat(row, 6),
    mtf_a: getStat(row, 7),
    ydom: getStat(row, 13),
    tddom: getStat(row, 14),
    targets: getStat(row, 15),
    receptions: getStat(row, 16),
    rec_yds: getStat(row, 18),
    yds_per_rec: getStat(row, 19),
    rec_tds: getStat(row, 20),
    recv_grade: getStat(row, 21),
    yac_rec: getStat(row, 23),
    mtf_rec: getStat(row, 26),
  };
}

function formToSeasonStatsRow(s) {
  const row = Array(27).fill(null).map(() => [null, null]);
  const set = (idx, val) => {
    const n = toNum(val);
    if (n != null) row[idx] = [n, null];
  };

  set(0, s.attempts);
  set(1, s.rush_yds);
  set(2, s.ypa);
  set(3, s.rush_tds);
  set(5, s.run_grade);
  set(6, s.yco_a);
  set(7, s.mtf_a);
  set(13, s.ydom);
  set(14, s.tddom);
  set(15, s.targets);
  set(16, s.receptions);
  set(18, s.rec_yds);
  set(19, s.yds_per_rec);
  set(20, s.rec_tds);
  set(21, s.recv_grade);
  set(23, s.yac_rec);
  set(26, s.mtf_rec);

  return row;
}

export default function EditPlayerModal({
  onClose,
  onSave,
  allData,
  existingOverrides = {},
  existingSeasons = {},
}) {
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [draft, setDraft] = useState(null);

  const rankedNames = useMemo(() => {
    return Object.keys(allData || {}).sort((a, b) => (allData[a]?.rank || 9999) - (allData[b]?.rank || 9999));
  }, [allData]);

  const suggestions = useMemo(() => {
    if (selectedName) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rankedNames.slice(0, 10);
    return rankedNames.filter((name) => name.toLowerCase().includes(q)).slice(0, 10);
  }, [query, rankedNames, selectedName]);

  const choosePlayer = (name) => {
    const player = allData[name] || {};
    const ov = existingOverrides[name] || {};
    const recruiting = { ...(player.recruiting || {}), ...(ov.recruiting || {}) };

    const athletic = {
      height: ov.athletic?.height ?? player.athletic?.height?.val ?? '',
      weight: ov.athletic?.weight ?? player.athletic?.weight?.val ?? '',
      arm: ov.athletic?.arm ?? player.athletic?.arm?.val ?? '',
      hand: ov.athletic?.hand ?? player.athletic?.hand?.val ?? '',
      wing: ov.athletic?.wing ?? player.athletic?.wing?.val ?? '',
      forty: ov.athletic?.forty ?? player.athletic?.forty?.val ?? player.athletic?.['40T']?.val ?? '',
      ten_split: ov.athletic?.ten_split ?? player.athletic?.ten_split?.val ?? player.athletic?.['10split']?.val ?? '',
      vert: ov.athletic?.vert ?? player.athletic?.vert?.val ?? '',
      broad: ov.athletic?.broad ?? player.athletic?.broad?.val ?? '',
      three_cone: ov.athletic?.three_cone ?? player.athletic?.three_cone?.val ?? player.athletic?.['3cone']?.val ?? '',
      shuttle: ov.athletic?.shuttle ?? player.athletic?.shuttle?.val ?? '',
      ras: ov.athletic?.ras ?? player.athletic?.ras?.val ?? player.ras ?? '',
    };

    const seasons = Array.isArray(player.seasons) ? [...player.seasons].sort((a, b) => (a.n || 0) - (b.n || 0)) : [];

    const seasonRows = seasons.map((season) => {
      const key = String(season.n || 0);
      const row = (ov.seasonStats && ov.seasonStats[key]) || (existingSeasons[name] && existingSeasons[name][key]) || [];
      return seasonToForm(season, row);
    });

    setSelectedName(name);
    setQuery(name);
    setDraft({
      pff_score: ov.pff_score ?? player.pff_score ?? '',
      transfer_to: ov.transfer_to ?? player.transfer_to ?? '',
      recruiting: {
        school: recruiting.school ?? recruiting.recruit_school ?? '',
        enrolled: recruiting.enrolled ?? recruiting.recruit_year ?? '',
        national_rank: recruiting.national_rank ?? recruiting.recruit_nat ?? '',
        position_rank: recruiting.position_rank ?? recruiting.recruit_pos ?? '',
        state_rank: recruiting.state_rank ?? recruiting.recruit_state ?? '',
      },
      athletic,
      seasons: seasonRows,
    });
  };

  const setRecruiting = (key, value) => {
    setDraft((prev) => ({ ...prev, recruiting: { ...prev.recruiting, [key]: value } }));
  };

  const setAthletic = (key, value) => {
    setDraft((prev) => ({ ...prev, athletic: { ...prev.athletic, [key]: value } }));
  };

  const setSeason = (idx, key, value) => {
    setDraft((prev) => ({
      ...prev,
      seasons: prev.seasons.map((s, i) => (i === idx ? { ...s, [key]: value } : s)),
    }));
  };

  const clearPlayer = () => {
    setSelectedName('');
    setDraft(null);
    setQuery('');
  };

  const handleSave = () => {
    if (!selectedName || !draft) return;

    const cleaned = {
      pff_score: toNum(draft.pff_score),
      transfer_to: draft.transfer_to?.trim() || null,
      athletic: {},
      recruiting: {},
      seasonMeta: {},
      seasonStats: {},
    };

    Object.entries(draft.athletic || {}).forEach(([k, v]) => {
      const n = toNum(v);
      if (n != null) cleaned.athletic[k] = n;
    });

    Object.entries(draft.recruiting || {}).forEach(([k, v]) => {
      if (k === 'school') {
        if (String(v || '').trim()) cleaned.recruiting.school = String(v).trim();
        return;
      }
      const n = toNum(v);
      if (n != null) cleaned.recruiting[k] = n;
    });

    (draft.seasons || []).forEach((s) => {
      const key = String(s.n || 0);
      cleaned.seasonMeta[key] = {
        n: s.n || null,
        yr: toNum(s.yr),
        school: (s.school || '').trim() || null,
        sc: (s.school || '').trim() || null,
        conf: (s.conf || '').trim() || null,
        sos_label: (s.sos_label || '').trim() || null,
        sos_rank: toNum(s.sos_rank),
      };
      cleaned.seasonStats[key] = formToSeasonStatsRow(s);
    });

    if (!Object.keys(cleaned.athletic).length) delete cleaned.athletic;
    if (!Object.keys(cleaned.recruiting).length) delete cleaned.recruiting;

    onSave(selectedName, cleaned);
  };

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 7,
    color: '#ddd',
    padding: '8px 10px',
    fontSize: 11,
    outline: 'none',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  };

  const lblStyle = { fontSize: 9, color: '#666', letterSpacing: 1, marginBottom: 4, display: 'block' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '26px 14px' }}>
      <div style={{ width: '100%', maxWidth: 820, background: '#0a0f1c', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: '#666', marginBottom: 4 }}>EDIT PLAYER DATA</div>
            <div style={{ fontSize: 15, color: '#f0c040', fontWeight: 800 }}>Player Editor</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#777', borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>X</button>
        </div>

        <div style={{ marginBottom: 14, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, background: 'rgba(255,255,255,0.02)', padding: 10 }}>
          <div style={{ fontSize: 9, color: '#777', marginBottom: 5, letterSpacing: 1 }}>PLAYER TYPEAHEAD</div>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedName) {
                setSelectedName('');
                setDraft(null);
              }
            }}
            placeholder="Type and select a player..."
            style={inputStyle}
          />
          {!selectedName && (
            <div style={{ marginTop: 8, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
              {suggestions.length === 0 ? (
                <div style={{ padding: '9px 10px', fontSize: 10, color: '#666' }}>Type a player name and choose from the list.</div>
              ) : (
                suggestions.map((name) => (
                  <button
                    key={name}
                    onClick={() => choosePlayer(name)}
                    style={{ width: '100%', textAlign: 'left', background: 'transparent', color: '#ddd', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '9px 10px', cursor: 'pointer', fontSize: 11 }}
                  >
                    {name}
                  </button>
                ))
              )}
            </div>
          )}
          {selectedName && (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
              <span style={{ color: '#5dbf6a' }}>Selected: {selectedName}</span>
              <button onClick={clearPlayer} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#777', borderRadius: 6, padding: '5px 8px', fontSize: 10 }}>
                Change Player
              </button>
            </div>
          )}
        </div>

        {!draft ? null : (
          <>
            <div style={{ fontSize: 9, color: '#777', marginBottom: 10, lineHeight: 1.6 }}>
              Trajectory, improvement, consistency, and athletic composite are derived from season and athletic inputs and are not directly editable.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={lblStyle}>PFF SCORE (0-100)</label>
                <input value={draft.pff_score} onChange={(e) => setDraft((p) => ({ ...p, pff_score: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={lblStyle}>TRANSFER TO</label>
                <input value={draft.transfer_to} onChange={(e) => setDraft((p) => ({ ...p, transfer_to: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, padding: 10 }}>
              <div style={{ fontSize: 10, color: '#8eaed0', marginBottom: 8, letterSpacing: 1 }}>RECRUITING</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 8 }}>
                <div>
                  <label style={lblStyle}>School</label>
                  <input value={draft.recruiting.school} onChange={(e) => setRecruiting('school', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Enrolled Year</label>
                  <input value={draft.recruiting.enrolled} onChange={(e) => setRecruiting('enrolled', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={lblStyle}>National Rank</label>
                  <input value={draft.recruiting.national_rank} onChange={(e) => setRecruiting('national_rank', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Position Rank</label>
                  <input value={draft.recruiting.position_rank} onChange={(e) => setRecruiting('position_rank', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={lblStyle}>State Rank</label>
                  <input value={draft.recruiting.state_rank} onChange={(e) => setRecruiting('state_rank', e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, padding: 10 }}>
              <div style={{ fontSize: 10, color: '#8eaed0', marginBottom: 8, letterSpacing: 1 }}>ATHLETIC</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
                {Object.entries(draft.athletic).map(([k, v]) => (
                  <div key={k}>
                    <label style={lblStyle}>{k.toUpperCase()}</label>
                    <input value={v} onChange={(e) => setAthletic(k, e.target.value)} style={inputStyle} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, padding: 10 }}>
              <div style={{ fontSize: 10, color: '#8eaed0', marginBottom: 8, letterSpacing: 1 }}>SEASON STATISTICS AND COLLEGE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {draft.seasons.map((s, idx) => (
                  <div key={s.n} style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 9 }}>
                    <div style={{ fontSize: 10, color: '#f0c040', marginBottom: 7 }}>Season {s.n}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8, marginBottom: 8 }}>
                      <div>
                        <label style={lblStyle}>Year</label>
                        <input value={s.yr} onChange={(e) => setSeason(idx, 'yr', e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>School</label>
                        <input value={s.school} onChange={(e) => setSeason(idx, 'school', e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>Conference</label>
                        <input value={s.conf} onChange={(e) => setSeason(idx, 'conf', e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>SOS Label</label>
                        <input value={s.sos_label} onChange={(e) => setSeason(idx, 'sos_label', e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 8 }}>
                      {[
                        'attempts','rush_yds','ypa','rush_tds','run_grade','yco_a','mtf_a','ydom','tddom',
                        'targets','receptions','rec_yds','yds_per_rec','rec_tds','recv_grade','yac_rec','mtf_rec'
                      ].map((k) => (
                        <div key={k}>
                          <label style={lblStyle}>{k.toUpperCase()}</label>
                          <input value={s[k]} onChange={(e) => setSeason(idx, k, e.target.value)} style={inputStyle} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#888', borderRadius: 8, padding: '8px 14px', fontSize: 11 }}>
                Cancel
              </button>
              <button onClick={handleSave} style={{ background: 'rgba(77,166,255,0.12)', border: '1px solid rgba(77,166,255,0.35)', color: '#4da6ff', borderRadius: 8, padding: '8px 14px', fontSize: 11, fontWeight: 700 }}>
                Save Player Edits
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
