// Moteur « grand-mère » : pluie déclenchante → délai → fenêtre, modulé par
// les températures, la sécheresse, la saison et l'humidité locale de la parcelle.

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const fmtD = (s) => { const d = parseD(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

export const STATUS_LABEL = {
  ouverte: 'Fenêtre ouverte', faible: 'Ouverte, faible', prepare: 'Ça se prépare',
  fermee: 'Se ferme', annulee: 'Poussée cassée', rien: 'Rien en vue', hors: 'Hors saison',
};

/**
 * @param sp espèce (seuils)
 * @param M météo {time[], tmax[], tmin[], rain[]}
 * @param i index du jour évalué
 * @param h humidité locale 0..1 (0 = sol drainant, 1 = bord de lac / marais)
 */
export function evalSpecies(sp, M, i, h = 0) {
  const P = {
    pluieMm: num(sp.pluieMm, 30), pluieJours: num(sp.pluieJours, 5),
    latenceMin: num(sp.latenceMin, 8), latencePic: num(sp.latencePic, 11), latenceMax: num(sp.latenceMax, 16),
    tmaxMin: num(sp.tmaxMin, 12), tmaxMax: num(sp.tmaxMax, 22), gelSeuil: num(sp.gelSeuil, 0),
    chaleurMax: num(sp.chaleurMax, 25), secJours: num(sp.secJours, 6),
  };
  // Humidité locale : un sol qui garde l'eau se déclenche avec moins de pluie
  // et supporte plus longtemps le sec. Coefficients de départ, à calibrer.
  const seuil = P.pluieMm * (1 - 0.3 * h);
  const secTol = P.secJours * (1 + 0.8 * h);

  const roll = (j) => { let s = 0; for (let k = Math.max(0, j - P.pluieJours + 1); k <= j; k++) s += M.rain[k] || 0; return s; };
  const month = parseD(M.time[i]).getUTCMonth() + 1;
  const inSeason = !Array.isArray(sp.mois) || sp.mois.length === 0 || sp.mois.includes(month);
  const reasons = [];
  if (h >= 0.3) reasons.push(`Sol humide (indice ${Math.round(h * 100)} %) : seuil abaissé à ${seuil.toFixed(0)} mm`);

  let j0 = -1;
  for (let j = i; j >= Math.max(1, i - P.latenceMax - 6); j--) {
    if (roll(j) >= seuil && roll(j - 1) < seuil) { j0 = j; break; }
  }
  if (j0 < 0) {
    const r = roll(i);
    reasons.unshift(r >= seuil * 0.5
      ? `${r.toFixed(0)} mm sur ${P.pluieJours} j, il en faut ${seuil.toFixed(0)}`
      : `Pas de pluie déclenchante récente (${seuil.toFixed(0)} mm en ${P.pluieJours} j)`);
    return { status: inSeason ? 'rien' : 'hors', score: 0, d: null, reasons };
  }
  const d = i - j0;
  let score; let phase;
  if (d < P.latenceMin) { phase = 'prepare'; score = 15 + 35 * d / Math.max(1, P.latenceMin); }
  else if (d <= P.latencePic) { phase = 'ouverte'; score = 60 + 40 * (d - P.latenceMin) / Math.max(1, P.latencePic - P.latenceMin); }
  else if (d <= P.latenceMax) { phase = 'ouverte'; score = 100 - 55 * (d - P.latencePic) / Math.max(1, P.latenceMax - P.latencePic); }
  else { phase = 'fermee'; score = Math.max(0, 15 - 5 * (d - P.latenceMax)); }
  reasons.unshift(`Pluie déclenchante le ${fmtD(M.time[j0])} (${roll(j0).toFixed(0)} mm) · J+${d}`);

  let frost = 0; let heat = 0; let tsum = 0; let tcount = 0;
  for (let k = j0; k <= i; k++) {
    if (M.tmin[k] < P.gelSeuil) frost++;
    if (M.tmax[k] > P.chaleurMax) heat++;
    tsum += M.tmax[k]; tcount++;
  }
  let dry = 0; for (let k = i; k >= 0 && (M.rain[k] || 0) < 1; k--) dry++;
  const tavg = tsum / tcount;
  let cancelled = false;
  if (frost > 0) { score *= 0.15; cancelled = true; reasons.push(`Gel (${frost} j sous ${P.gelSeuil} °C)`); }
  if (heat >= 2) { score *= 0.2; cancelled = true; reasons.push(`Trop chaud (${heat} j au-dessus de ${P.chaleurMax} °C)`); }
  if (tavg < P.tmaxMin || tavg > P.tmaxMax) { score *= 0.7; reasons.push(`Max moyenne ${tavg.toFixed(0)} °C, hors plage ${P.tmaxMin}–${P.tmaxMax} °C`); }
  else reasons.push(`Températures dans la plage (max moy. ${tavg.toFixed(0)} °C)`);
  if (dry >= secTol * 1.6) { score *= 0.55; reasons.push(`${dry} jours sans pluie : le sol sèche fort`); }
  else if (dry >= secTol) { score *= 0.75; reasons.push(`${dry} jours sans pluie : la fenêtre raccourcit`); }
  else if (dry >= P.secJours && h >= 0.3) reasons.push(`${dry} jours sans pluie, compensés par le sol humide`);
  if (!inSeason) { score *= 0.25; reasons.push('Hors de sa saison habituelle'); }

  score = Math.round(Math.max(0, Math.min(100, score)));
  let status;
  if (!inSeason) status = 'hors';
  else if (cancelled) status = 'annulee';
  else if (phase === 'prepare') status = 'prepare';
  else if (phase === 'fermee') status = score > 0 ? 'fermee' : 'rien';
  else status = score >= 45 ? 'ouverte' : 'faible';
  return { status, score, d, reasons };
}

export function todayParis() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function dayIndex(M, iso) {
  let i = M.time.indexOf(iso);
  if (i < 0) i = iso > M.time[M.time.length - 1] ? M.time.length - 1 : 0;
  return i;
}
