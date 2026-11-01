import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TARIFS, nouvelleCourse, tick, terminer, detail, ajouterSupplement, retirerSupplement } from '../meter.js';
import { CLES, chargerProfils, sauverProfils, profilActif, enregistrement, ajouterAuHistorique, supprimerDuHistorique, lire, totaux, csv } from '../donnees.js';
import { texteRecu, contenuRecu } from '../recu.js';

const memoire = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const t = { ...DEFAULT_TARIFS, nuitAuto: false, priseEnCharge: 6, prixKm: 1, prixMinute: 0.5, nom: 'Ville' };

test('suppléments : ajoutés au total, après le minimum, retirables', () => {
  const tm = { ...t, minimum: 20 };
  const c = nouvelleCourse(tm, 0);
  ajouterSupplement(c, 'Bagage', 5);
  ajouterSupplement(c, 'Péage', 0);            // montant nul refusé
  assert.equal(c.supplements.length, 1);
  const d = detail(c, tm);
  assert.equal(d.minimumApplique, true);
  assert.equal(d.total, 25);                    // minimum 20 + bagage 5
  retirerSupplement(c, 0);
  assert.equal(detail(c, tm).total, 20);
});

test('suppléments : impossibles une fois la course terminée', () => {
  const c = nouvelleCourse(t, 0); terminer(c, 1000);
  ajouterSupplement(c, 'Bagage', 5);
  assert.equal(c.supplements.length, 0);
});

test("tarifs : l'ancien tarif unique devient « Ville »", () => {
  const s = memoire({ [CLES.ancienTarifs]: JSON.stringify({ priseEnCharge: 6, prixKm: 1 }) });
  const p = chargerProfils(s);
  assert.equal(p.profils.length, 1);
  assert.equal(profilActif(p).nom, 'Ville');
  assert.equal(profilActif(p).priseEnCharge, 6);
  assert.equal(profilActif(p).prixMinute, DEFAULT_TARIFS.prixMinute);
});

test('tarifs : plusieurs tarifs et tarif actif conservés', () => {
  const s = memoire();
  sauverProfils(s, [{ ...t, id: 'a', nom: 'Ville' }, { ...t, id: 'b', nom: 'Aéroport', priseEnCharge: 50 }], 'b');
  const p = chargerProfils(s);
  assert.equal(profilActif(p).nom, 'Aéroport');
  assert.equal(profilActif(p).priseEnCharge, 50);
});

function courseFinie(debut, km = 3, supp = []) {
  const c = nouvelleCourse(t, debut);
  c.distance = km * 1000; tick(c, t, debut + 240000);
  for (const [n, m] of supp) ajouterSupplement(c, n, m);
  terminer(c, debut + 240000);
  return enregistrement(c, t);
}

test('historique : enregistrement, ajout, suppression', () => {
  const s = memoire();
  const r = courseFinie(Date.now() - 300000, 3, [['Bagage', 5]]);
  assert.equal(r.profil, 'Ville');
  assert.equal(+r.total.toFixed(2), 6 + 3 + 2 + 5);   // début + 3 km + 4 min × 0,50 + bagage
  ajouterAuHistorique(s, r);
  assert.equal(lire(s, CLES.historique, []).length, 1);
  supprimerDuHistorique(s, r.id);
  assert.equal(lire(s, CLES.historique, []).length, 0);
});

test('historique : totaux du jour, de la semaine et du mois', () => {
  const now = new Date(2026, 10, 4, 15, 0);          // mercredi 4 novembre 2026
  const a = { total: 10, fin: new Date(2026, 10, 4, 9, 0).getTime() };    // aujourd'hui
  const b = { total: 20, fin: new Date(2026, 10, 2, 9, 0).getTime() };    // lundi
  const c = { total: 40, fin: new Date(2026, 10, 1, 9, 0).getTime() };    // dimanche (semaine précédente)
  const d = { total: 80, fin: new Date(2026, 9, 31, 9, 0).getTime() };    // mois précédent
  const tt = totaux([a, b, c, d], now);
  assert.deepEqual(tt.jour, { n: 1, total: 10 });
  assert.deepEqual(tt.semaine, { n: 2, total: 30 });
  assert.deepEqual(tt.mois, { n: 3, total: 70 });
});

test('export Excel : en-tête, virgule décimale, une ligne par course', () => {
  const r = courseFinie(new Date(2026, 10, 1, 14, 5).getTime(), 3, [['Bagage', 5]]);
  const lignes = csv([r]).replace('﻿', '').trim().split('\r\n');
  assert.equal(lignes.length, 2);
  assert.match(lignes[0], /^Date;Départ;Arrivée;Tarif/);
  assert.match(lignes[1], /^01\/11\/2026;14:05;14:09;Ville;non;3,00;4,00;4,00;Bagage 5,00;5,00;16,00;DH$/);
});

test('reçu : infos du chauffeur, détail et total', () => {
  const r = courseFinie(new Date(2026, 10, 1, 14, 5).getTime(), 3, [['Bagage', 5]]);
  const txt = texteRecu(r, { chauffeur: 'Karim', taxi: '1234-A', telephone: '' });
  assert.match(txt, /REÇU DE COURSE TAXI/);
  assert.match(txt, /Karim\nTaxi 1234-A\n/);
  assert.doesNotMatch(txt, /Tél\./);
  assert.match(txt, /Supplément Bagage : 5\.00 DH/);
  assert.match(txt, /TOTAL : 16\.00 DH/);
  assert.match(txt, /Reçu n° 20261101-1405/);
  assert.equal(contenuRecu(r, {}).entete.length, 0);
});
