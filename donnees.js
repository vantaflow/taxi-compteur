// Données de l'appli, toutes gardées sur le téléphone (aucun serveur) :
// tarifs enregistrés, suppléments, infos du reçu et historique des courses.
// Le stockage est passé en paramètre pour pouvoir tester sans navigateur.
import { DEFAULT_TARIFS, detail, attenteTotale } from './meter.js';

export const CLES = {
  profils: 'taxi.profils', actif: 'taxi.profilActif', ancienTarifs: 'taxi.tarifs',
  supplements: 'taxi.supplements', recu: 'taxi.recu', historique: 'taxi.historique',
};
export const MAX_HISTORIQUE = 5000;

export const SUPPLEMENTS_DEFAUT = [
  { nom: 'Bagage', montant: 5 },
  { nom: 'Aéroport', montant: 10 },
  { nom: 'Péage', montant: null }, // null : montant demandé au moment de l'ajout
];
export const RECU_DEFAUT = { chauffeur: '', taxi: '', telephone: '' };

export function lire(store, cle, defaut) {
  try { const v = store.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; }
}
export function ecrire(store, cle, v) {
  try { v == null ? store.removeItem(cle) : store.setItem(cle, JSON.stringify(v)); return true; } catch { return false; }
}

export const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---- Tarifs enregistrés (profils) ----
// Première ouverture après la mise à jour : l'ancien tarif unique devient « Ville ».
export function chargerProfils(store) {
  let profils = lire(store, CLES.profils, null);
  if (!Array.isArray(profils) || !profils.length) {
    const ancien = lire(store, CLES.ancienTarifs, {});
    profils = [{ ...DEFAULT_TARIFS, ...ancien, id: 'ville', nom: 'Ville' }];
  }
  profils = profils.map((p) => ({ ...DEFAULT_TARIFS, ...p }));
  let actif = lire(store, CLES.actif, profils[0].id);
  if (!profils.some((p) => p.id === actif)) actif = profils[0].id;
  return { profils, actif };
}
export function sauverProfils(store, profils, actif) {
  ecrire(store, CLES.profils, profils);
  ecrire(store, CLES.actif, actif);
}
export const profilActif = ({ profils, actif }) => profils.find((p) => p.id === actif) || profils[0];

// ---- Historique ----
// Ce qu'on garde d'une course terminée : de quoi refaire le reçu et les totaux.
export function enregistrement(course, t) {
  const d = detail(course, t);
  return {
    id: nouvelId(),
    debut: course.debut, fin: course.fin ?? Date.now(),
    profil: course.profil || t.nom || '',
    distance: course.distance, attente: attenteTotale(course), duree: course.duree,
    nuit: !!course.nuit, coef: d.coef,
    prixKm: t.prixKm, prixMinute: t.prixMinute, devise: t.devise,
    priseEnCharge: d.priseEnCharge, distancePart: d.distancePart, attentePart: d.attentePart,
    minimum: t.minimum || 0, minimumApplique: d.minimumApplique,
    supplements: (course.supplements || []).map((s) => ({ ...s })),
    total: d.total,
  };
}
export function ajouterAuHistorique(store, rec) {
  const h = lire(store, CLES.historique, []);
  h.unshift(rec);
  if (h.length > MAX_HISTORIQUE) h.length = MAX_HISTORIQUE;
  return ecrire(store, CLES.historique, h);
}
export function supprimerDuHistorique(store, id) {
  ecrire(store, CLES.historique, lire(store, CLES.historique, []).filter((r) => r.id !== id));
}

// Totaux : aujourd'hui, cette semaine (depuis lundi), ce mois.
export function totaux(hist, maintenant = new Date()) {
  const jour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).getTime();
  const decalLundi = (maintenant.getDay() + 6) % 7;
  const semaine = jour - decalLundi * 86400000;
  const mois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1).getTime();
  const res = { jour: { n: 0, total: 0 }, semaine: { n: 0, total: 0 }, mois: { n: 0, total: 0 } };
  for (const r of hist) {
    const t = r.fin;
    if (t >= jour) { res.jour.n++; res.jour.total += r.total; }
    if (t >= new Date(semaine).setHours(0, 0, 0, 0)) { res.semaine.n++; res.semaine.total += r.total; }
    if (t >= mois) { res.mois.n++; res.mois.total += r.total; }
  }
  return res;
}

// ---- Formats ----
const deux = (n) => String(n).padStart(2, '0');
export const fmtDate = (ms) => { const d = new Date(ms); return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtHeure = (ms) => { const d = new Date(ms); return `${deux(d.getHours())}:${deux(d.getMinutes())}`; };
export const fmtArgent = (n) => n.toFixed(2);
export function fmtDuree(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h} h ${deux(m)} min`;
  if (m) return sec ? `${m} min ${deux(sec)} s` : `${m} min`;
  return `${sec} s`;
}
export const numeroRecu = (r) => {
  const d = new Date(r.debut);
  return `${d.getFullYear()}${deux(d.getMonth() + 1)}${deux(d.getDate())}-${deux(d.getHours())}${deux(d.getMinutes())}`;
};

// Export pour Excel (français : séparateur « ; », virgule décimale).
export function csv(hist) {
  const v = (n) => n.toFixed(2).replace('.', ',');
  const esc = (s) => /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lignes = [['Date', 'Départ', 'Arrivée', 'Tarif', 'Nuit', 'Distance (km)', 'Attente (min)', 'Durée (min)', 'Suppléments', 'Montant suppléments', 'Total', 'Devise'].join(';')];
  for (const r of hist) {
    const supp = r.supplements.map((s) => `${s.nom} ${v(s.montant)}`).join(', ');
    lignes.push([fmtDate(r.debut), fmtHeure(r.debut), fmtHeure(r.fin), esc(r.profil), r.nuit ? 'oui' : 'non',
      v(r.distance / 1000), v(r.attente / 60), v(r.duree / 60), esc(supp),
      v(r.supplements.reduce((s, x) => s + x.montant, 0)), v(r.total), esc(r.devise)].join(';'));
  }
  return '﻿' + lignes.join('\r\n') + '\r\n';
}
