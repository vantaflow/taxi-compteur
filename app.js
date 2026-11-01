import { attenteTotale, DEFAULT_TARIFS, nouvelleCourse, tick, position, detail, pause, reprendre, terminer,
  ajouterSupplement, retirerSupplement } from './meter.js';
import { CLES, SUPPLEMENTS_DEFAUT, RECU_DEFAUT, lire, ecrire, nouvelId, chargerProfils, sauverProfils, profilActif,
  enregistrement, ajouterAuHistorique, supprimerDuHistorique, totaux, csv, fmtDate, fmtHeure, fmtArgent, numeroRecu } from './donnees.js';
import { canvasRecu, texteRecu, blobRecu } from './recu.js';

const $ = (id) => document.getElementById(id);
const store = (() => { try { return window.localStorage; } catch { return { getItem: () => null, setItem() {}, removeItem() {} }; } })();
const CLE_COURSE = 'taxi.course';

let profilsData = chargerProfils(store);
let tarifs = profilActif(profilsData);
let course = lire(store, CLE_COURSE, null);
if (course && !course.supplements) course.supplements = [];
// La course garde les tarifs avec lesquels elle a démarré.
let tarifsCourse = course?.tarifs || tarifs;
let supplementsConfig = lire(store, CLES.supplements, SUPPLEMENTS_DEFAUT);
let infosRecu = { ...RECU_DEFAUT, ...lire(store, CLES.recu, {}) };
let watchId = null;
let wakeLock = null;
let gpsMsg = { txt: 'GPS : en attente', cls: '' };

const fmt = (n) => n.toFixed(2);
const fmtTemps = (s) => {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const el = (tag, props = {}, ...enfants) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const c of enfants) if (c != null) e.append(c);
  return e;
};
const svgCroix = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M6 6l12 12M18 6L6 18"></path>';
  return s;
};

// ================= Affichage principal =================
function rendu() {
  const t = tarifsCourse;
  $('devise').textContent = t.devise;
  const etat = $('etat');
  if (!course) {
    $('total').textContent = fmt(tarifs.priseEnCharge);
    $('devise').textContent = tarifs.devise;
    etat.textContent = 'LIBRE'; etat.className = 'badge';
    $('mode').textContent = 'Appuyez sur Démarrer'; $('mode').className = 'mode';
    for (const id of ['distance', 'attente', 'duree', 'vitesse']) $(id).textContent = id === 'distance' ? '0.00 km' : id === 'vitesse' ? '0 km/h' : '0:00';
    lignesDetail(tarifs, { priseEnCharge: tarifs.priseEnCharge, distancePart: 0, attentePart: 0, coef: 1 }, 0, 0);
    $('badgeNuit').hidden = true;
    boutons('libre');
  } else {
    const d = detail(course, t);
    $('total').textContent = fmt(d.total);
    $('distance').textContent = `${(course.distance / 1000).toFixed(2)} km`;
    $('attente').textContent = fmtTemps(attenteTotale(course));
    $('duree').textContent = fmtTemps(course.duree);
    $('vitesse').textContent = `${Math.round(course.vitesse)} km/h`;
    lignesDetail(t, d, course.distance, attenteTotale(course));
    $('badgeNuit').hidden = !course.nuit;
    const mode = $('mode');
    if (course.etat === 'en_course') {
      etat.textContent = 'EN COURSE'; etat.className = 'badge course';
      if (course.enMouvement) { mode.textContent = 'En route : compté au kilomètre'; mode.className = 'mode roule'; }
      else { mode.textContent = "À l'arrêt : compté à la minute"; mode.className = 'mode arret'; }
    } else if (course.etat === 'pause') {
      etat.textContent = 'PAUSE'; etat.className = 'badge pause';
      mode.textContent = 'Compteur arrêté'; mode.className = 'mode';
    } else {
      etat.textContent = 'TERMINÉE'; etat.className = 'badge fin';
      mode.textContent = 'Montant à payer'; mode.className = 'mode';
    }
    boutons(course.etat);
  }
  $('profilChoix').hidden = !!course || profilsData.profils.length < 2;
  majBoutonsSupps();
  majDetailSupps();
  const g = $('gps'); g.textContent = gpsMsg.txt; g.className = `gps ${gpsMsg.cls}`;
  visuels();
}

// Néon : « 8 » éteints derrière le prix ; barre début/distance/attente.
// Épuré : l'anneau fait un tour par minute d'attente (ou par km en roulant).
function visuels() {
  $('fantome').textContent = $('total').textContent.replace(/\d/g, '8');
  const t = course ? tarifsCourse : tarifs;
  const d = course ? detail(course, t) : { priseEnCharge: t.priseEnCharge, distancePart: 0, attentePart: 0 };
  $('bDeb').style.flexGrow = d.priseEnCharge || 0.0001;
  $('bDist').style.flexGrow = d.distancePart;
  $('bAtt').style.flexGrow = d.attentePart + (d.supplementsPart || 0);
  let tour = 0;
  if (course && course.etat !== 'terminee') tour = course.enMouvement ? (course.distance % 1000) / 1000 : (attenteTotale(course) % 60) / 60;
  if (course?.etat === 'terminee') tour = 1;
  document.querySelector('.ecran').style.setProperty('--tour', tour.toFixed(3));
}

// Détail du prix : chaque ligne montre sa base (km, temps) et son montant en devise.
function lignesDetail(t, d, distanceM, attenteS) {
  const dev = ` ${t.devise}`;
  const nuit = d.coef > 1 ? ` +${Math.round((d.coef - 1) * 100)} %` : '';
  $('dPec').textContent = fmt(d.priseEnCharge) + dev;
  $('lDist').textContent = `Distance : ${(distanceM / 1000).toFixed(2)} km × ${fmt(t.prixKm)}${nuit}`;
  $('dDist').textContent = fmt(d.distancePart) + dev;
  $('lAtt').textContent = `Attente : ${fmtTemps(attenteS)} × ${fmt(t.prixMinute)}/min${nuit}`;
  $('dAtt').textContent = fmt(d.attentePart) + dev;
}

function boutons(etat) {
  $('btnStart').hidden = etat !== 'libre';
  $('btnPause').hidden = !(etat === 'en_course' || etat === 'pause');
  $('lblPause').textContent = etat === 'pause' ? 'Reprendre' : 'Pause';
  $('icoPause').innerHTML = etat === 'pause' ? '<path d="M8 5.5v13l10.5-6.5z"></path>' : '<rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect>';
  $('btnStop').hidden = !(etat === 'en_course' || etat === 'pause');
  $('btnReset').hidden = etat !== 'terminee';
  $('btnRecu').hidden = !(etat === 'terminee' && course?.recId);
  $('btnReglages').disabled = etat === 'en_course' || etat === 'pause';
  // Deux boutons : côte à côte. Un seul : toute la largeur.
  const zone = document.querySelector('.actions');
  zone.classList.toggle('seul', [...zone.children].filter((b) => !b.hidden).length === 1);
}

// ---- Suppléments pendant la course ----
// On ne reconstruit les boutons que s'ils changent (le rendu tourne chaque seconde).
let cleBoutonsSupps = '';
function majBoutonsSupps() {
  const actif = course && (course.etat === 'en_course' || course.etat === 'pause');
  const cle = actif ? JSON.stringify(supplementsConfig) + tarifsCourse.devise : '';
  if (cle === cleBoutonsSupps) return;
  cleBoutonsSupps = cle;
  const zone = $('supps'); zone.replaceChildren();
  if (!actif) return;
  supplementsConfig.forEach((s) => {
    const prix = s.montant > 0 ? ` ${fmt(s.montant)}` : ' …';
    const b = el('button', { type: 'button', className: 'supp', textContent: `+ ${s.nom}${prix}` });
    b.setAttribute('aria-label', `Ajouter le supplément ${s.nom}`);
    b.onclick = () => {
      let montant = s.montant;
      if (!(montant > 0)) {
        const rep = prompt(`Montant du supplément « ${s.nom} » (${tarifsCourse.devise}) :`);
        if (rep == null) return;
        montant = parseFloat(rep.replace(',', '.'));
        if (!(montant > 0)) { alert('Montant invalide.'); return; }
      }
      ajouterSupplement(course, s.nom, montant); sauver(); rendu();
      navigator.vibrate?.(30);
    };
    zone.append(b);
  });
}

let cleDetailSupps = '';
function majDetailSupps() {
  const liste = course?.supplements || [];
  const modifiable = course && course.etat !== 'terminee';
  const cle = JSON.stringify(liste) + modifiable + tarifsCourse.devise;
  if (cle === cleDetailSupps) return;
  cleDetailSupps = cle;
  document.querySelectorAll('.detail .ligne-supp').forEach((n) => n.remove());
  liste.forEach((s, i) => {
    const gauche = el('span', {}, `Supplément ${s.nom}`);
    if (modifiable) {
      const x = el('button', { type: 'button', className: 'retirer' }, svgCroix());
      x.setAttribute('aria-label', `Retirer le supplément ${s.nom}`);
      x.onclick = () => { retirerSupplement(course, i); sauver(); rendu(); };
      gauche.prepend(x);
    }
    $('detail').append(el('div', { className: 'ligne-supp' }, gauche, el('span', { textContent: `${fmt(s.montant)} ${tarifsCourse.devise}` })));
  });
}

// ---- Choix du tarif avant de démarrer ----
function remplirSelProfil() {
  const sel = $('selProfil');
  sel.replaceChildren(...profilsData.profils.map((p) => el('option', { value: p.id, textContent: p.nom })));
  sel.value = profilsData.actif;
}
$('selProfil').onchange = (e) => {
  profilsData.actif = e.target.value;
  sauverProfils(store, profilsData.profils, profilsData.actif);
  tarifs = profilActif(profilsData);
  if (!course) tarifsCourse = tarifs;
  rendu();
};

function sauver() { ecrire(store, CLE_COURSE, course ? { ...course, tarifs: tarifsCourse } : null); }

// ================= GPS et écran =================
function demarrerGps() {
  if (watchId != null) return;
  if (!('geolocation' in navigator)) { gpsMsg = { txt: 'GPS indisponible : seul le temps est compté', cls: 'ko' }; return; }
  watchId = navigator.geolocation.watchPosition((pos) => {
    const c = pos.coords;
    gpsMsg = { txt: `GPS : précision ${Math.round(c.accuracy)} m`, cls: c.accuracy <= 50 ? 'ok' : '' };
    if (course) {
      position(course, tarifsCourse, { lat: c.latitude, lon: c.longitude, acc: c.accuracy, t: pos.timestamp || Date.now(), speed: c.speed });
      sauver();
    }
    rendu();
  }, (err) => {
    gpsMsg = { txt: err.code === 1 ? 'GPS refusé : autorisez la localisation' : 'GPS : signal perdu', cls: 'ko' };
    rendu();
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
}
function arreterGps() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  gpsMsg = { txt: 'GPS : arrêté', cls: '' };
}
async function garderEcran() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* refusé */ }
}
function libererEcran() { try { wakeLock?.release(); } catch { /* déjà libéré */ } wakeLock = null; }

// ================= Boutons de course =================
$('btnStart').onclick = () => {
  tarifsCourse = { ...tarifs };
  course = nouvelleCourse(tarifsCourse);
  demarrerGps(); garderEcran(); sauver(); rendu();
};
$('btnPause').onclick = () => {
  if (course.etat === 'en_course') { pause(course); arreterGps(); }
  else { reprendre(course); demarrerGps(); garderEcran(); }
  sauver(); rendu();
};
$('btnStop').onclick = () => {
  if (!confirm('Terminer la course ?')) return;
  tick(course, tarifsCourse); terminer(course); arreterGps(); libererEcran();
  const rec = enregistrement(course, tarifsCourse);
  if (ajouterAuHistorique(store, rec)) course.recId = rec.id;
  else alert("Mémoire du téléphone pleine : la course n'a pas pu être ajoutée à l'historique.");
  sauver(); rendu();
};
$('btnReset').onclick = () => { course = null; tarifsCourse = tarifs; sauver(); rendu(); };
$('btnRecu').onclick = () => {
  const rec = lire(store, CLES.historique, []).find((r) => r.id === course?.recId);
  if (rec) ouvrirRecu(rec, false);
};

// ================= Reçu =================
const dlgRecu = $('recu');
let recuOuvert = null; // { rec, cv }
async function ouvrirRecu(rec, depuisHistorique) {
  try { await Promise.all([document.fonts.load('800 20px Manrope'), document.fonts.load('500 20px Manrope')]); } catch { /* police système */ }
  const cv = canvasRecu(rec, infosRecu, document, couleurCourante());
  recuOuvert = { rec, cv };
  $('imgRecu').src = cv.toDataURL('image/png');
  $('btnSupprCourse').hidden = !depuisHistorique;
  if (!dlgRecu.open) dlgRecu.showModal();
}
const nomFichier = (rec, ext) => `recu-taxi-${numeroRecu(rec)}.${ext}`;
function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function partagerFichier(blob, nom, type, titre) {
  const f = new File([blob], nom, { type });
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], title: titre }); } catch (e) { if (e.name !== 'AbortError') telecharger(blob, nom); }
  } else telecharger(blob, nom);
}
$('btnPartagerImg').onclick = async () => {
  if (!recuOuvert) return;
  await partagerFichier(await blobRecu(recuOuvert.cv), nomFichier(recuOuvert.rec, 'png'), 'image/png', 'Reçu de course');
};
$('btnEnregistrerImg').onclick = async () => {
  if (recuOuvert) telecharger(await blobRecu(recuOuvert.cv), nomFichier(recuOuvert.rec, 'png'));
};
$('btnPartagerTxt').onclick = async () => {
  if (!recuOuvert) return;
  const texte = texteRecu(recuOuvert.rec, infosRecu);
  if (navigator.share) {
    try { await navigator.share({ text: texte }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(texte); alert('Reçu copié : collez-le dans un message.'); }
  catch { prompt('Copiez le reçu :', texte); }
};
$('btnSupprCourse').onclick = () => {
  if (!recuOuvert || !confirm('Supprimer cette course de l\'historique ?')) return;
  supprimerDuHistorique(store, recuOuvert.rec.id);
  if (course?.recId === recuOuvert.rec.id) { delete course.recId; sauver(); }
  dlgRecu.close(''); remplirHistorique(); rendu();
};

// ================= Historique =================
const dlgHist = $('historique');
function remplirHistorique() {
  const hist = lire(store, CLES.historique, []);
  const dev = tarifs.devise;
  const tt = totaux(hist);
  $('totaux').replaceChildren(...[['Aujourd\'hui', tt.jour], ['Semaine', tt.semaine], ['Mois', tt.mois]].map(([nom, v]) =>
    el('div', {}, el('div', { className: 'lbl', textContent: nom }),
      el('div', { className: 'somme', textContent: `${fmtArgent(v.total)} ${dev}` }),
      el('div', { className: 'nb', textContent: `${v.n} course${v.n > 1 ? 's' : ''}` }))));
  const ul = $('listeCourses'); ul.replaceChildren();
  let jourCourant = '';
  for (const r of hist.slice(0, 300)) {
    const jour = fmtDate(r.debut);
    if (jour !== jourCourant) { jourCourant = jour; ul.append(el('li', { className: 'jour', textContent: jour })); }
    const supp = r.supplements.length ? ` · ${r.supplements.length} suppl.` : '';
    const b = el('button', { type: 'button' },
      el('span', { className: 'quand', textContent: `${fmtHeure(r.debut)} → ${fmtHeure(r.fin)}` }),
      el('span', { className: 'combien', textContent: `${fmtArgent(r.total)} ${r.devise}` }),
      el('span', { className: 'quoi', textContent: `${(r.distance / 1000).toFixed(2)} km · ${r.profil || '—'}${r.nuit ? ' · nuit' : ''}${supp}` }));
    b.onclick = () => ouvrirRecu(r, true);
    ul.append(el('li', {}, b));
  }
  if (hist.length > 300) ul.append(el('li', { className: 'jour', textContent: `… et ${hist.length - 300} courses plus anciennes (voir l'export)` }));
  $('histVide').hidden = hist.length > 0;
  $('btnExport').disabled = $('btnViderHist').disabled = hist.length === 0;
}
$('btnHistorique').onclick = () => { remplirHistorique(); dlgHist.showModal(); };
$('btnExport').onclick = async () => {
  const hist = lire(store, CLES.historique, []);
  const d = new Date();
  const nom = `courses-taxi-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`;
  await partagerFichier(new Blob([csv(hist)], { type: 'text/csv' }), nom, 'text/csv', 'Historique des courses');
};
$('btnViderHist').onclick = () => {
  const n = lire(store, CLES.historique, []).length;
  if (!confirm(`Effacer tout l'historique (${n} course${n > 1 ? 's' : ''}) ? Pensez à l'exporter avant.`)) return;
  ecrire(store, CLES.historique, []);
  if (course?.recId) { delete course.recId; sauver(); }
  remplirHistorique(); rendu();
};

// ================= Style d'affichage =================
const COULEUR_BARRE = { neon: '#07090c', jaune: null, epure: '#f6f6f3' };
const couleurCourante = () => getComputedStyle(document.documentElement).getPropertyValue('--c').trim() || '#ffcc00';
function appliquerStyle(s) {
  document.documentElement.dataset.style = s;
  // Barre d'état du téléphone : couleur du fond (celle du taxi en « Couleur taxi »).
  document.querySelector('meta[name="theme-color"]').content = COULEUR_BARRE[s] || couleurCourante();
  document.querySelectorAll('.carte-style').forEach((b) => b.setAttribute('aria-pressed', String(b.value === s)));
}

// ---- Couleur du taxi ----
const TC = window.TaxiCouleur;
function choisirCouleur(hex) {
  TC.enregistrer(hex); TC.appliquer(hex);
  appliquerStyle(document.documentElement.dataset.style || 'neon');
  marquerCouleur(); rendu();
}
function marquerCouleur() {
  const actuelle = TC.lire();
  document.querySelectorAll('.pastille').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.hex || null) === actuelle)));
  $('couleurPerso').value = actuelle || couleurCourante();
}
$('couleurs').replaceChildren(...TC.PALETTE.map((p) => {
  const rond = el('span', { className: 'rond' + (p.hex ? '' : ' origine') });
  if (p.hex) rond.style.background = p.hex;
  const b = el('button', { type: 'button', className: 'pastille' }, rond, el('span', { textContent: p.nom }));
  if (p.hex) b.dataset.hex = p.hex;
  b.onclick = () => choisirCouleur(p.hex);
  return b;
}));
$('couleurPerso').addEventListener('input', (e) => choisirCouleur(e.target.value.toLowerCase()));
marquerCouleur();
appliquerStyle(document.documentElement.dataset.style || 'neon');
const dlgStyles = $('styles');
$('btnTheme').onclick = () => { marquerCouleur(); dlgStyles.showModal(); };
dlgStyles.addEventListener('close', () => {
  const s = dlgStyles.returnValue;
  if (!COULEUR_BARRE[s]) return;
  try { localStorage.setItem('taxi.style', s); localStorage.removeItem('taxi.theme'); } catch { /* indisponible */ }
  appliquerStyle(s); rendu();
});

// ================= Réglages =================
const dlg = $('reglages'), form = $('formReglages');
const CLE_AIDE = 'taxi.aide';
function afficherAide(oui) {
  form.classList.toggle('avec-aide', oui);
  $('btnAide').setAttribute('aria-expanded', String(oui));
  $('btnAide').setAttribute('aria-label', oui ? "Masquer l'aide" : "Afficher l'aide");
}
function exempleAide() {
  const v = (k) => { const n = parseFloat(String(form.elements[k].value).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const dev = form.elements.devise.value.trim() || 'DH';
  const f = (n) => n.toFixed(2).replace('.', ',');
  const pec = v('priseEnCharge'), km = v('prixKm'), mn = v('prixMinute'), maj = 1 + v('majorationNuit') / 100;
  const jour = Math.max(pec + 5 * km + 4 * mn, v('minimum'));
  const nuit = Math.max(pec + (5 * km + 4 * mn) * maj, v('minimum'));
  $('aideExemple').textContent = `Exemple : 5 km et 4 min d'attente = ${f(pec)} + 5 × ${f(km)} + 4 × ${f(mn)} = ${f(jour)} ${dev}` +
    (maj > 1 ? ` (de nuit : ${f(nuit)} ${dev})` : '') + '.';
}
$('btnAide').onclick = () => {
  const oui = !form.classList.contains('avec-aide');
  afficherAide(oui); exempleAide();
  try { localStorage.setItem(CLE_AIDE, oui ? '1' : '0'); } catch { /* indisponible */ }
};
form.addEventListener('input', exempleAide);
let aideVue = '1';
try { aideVue = localStorage.getItem(CLE_AIDE) ?? '1'; } catch { /* indisponible */ }
afficherAide(aideVue === '1');

// Toucher à côté d'une fenêtre la ferme sans rien changer.
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => { if (e.target === d) d.close(''); });
}

// Brouillon : rien n'est enregistré avant « Enregistrer ».
let brouillon = null; // { profils, selId, supps }
const CHAMPS_TARIF = [...Object.keys(DEFAULT_TARIFS), 'nom'];
function chargerChamps(p) {
  for (const k of CHAMPS_TARIF) {
    const e = form.elements[k]; if (!e) continue;
    if (e.type === 'checkbox') e.checked = !!p[k]; else e.value = p[k] ?? '';
  }
  $('btnSupprProfil').hidden = brouillon.profils.length < 2;
  exempleAide();
}
function lireChamps(p) {
  for (const k of CHAMPS_TARIF) {
    const e = form.elements[k]; if (!e) continue;
    if (e.type === 'checkbox') p[k] = e.checked;
    else if (e.type === 'number') { const v = parseFloat(String(e.value).replace(',', '.')); if (Number.isFinite(v) && v >= 0) p[k] = v; }
    else p[k] = e.value.trim() || (k === 'nom' ? 'Sans nom' : DEFAULT_TARIFS[k]);
  }
}
const profilBrouillon = () => brouillon.profils.find((p) => p.id === brouillon.selId);
function remplirSelReglage() {
  const sel = $('selProfilReglage');
  sel.replaceChildren(...brouillon.profils.map((p) => el('option', { value: p.id, textContent: p.nom })));
  sel.value = brouillon.selId;
}
$('selProfilReglage').onchange = (e) => {
  lireChamps(profilBrouillon());
  brouillon.selId = e.target.value;
  chargerChamps(profilBrouillon());
};
form.elements.nom.addEventListener('input', (e) => {
  const opt = $('selProfilReglage').selectedOptions[0];
  if (opt) opt.textContent = e.target.value || 'Sans nom';
});
$('btnNouveauProfil').onclick = () => {
  lireChamps(profilBrouillon());
  const p = { ...profilBrouillon(), id: nouvelId(), nom: 'Nouveau tarif' };
  brouillon.profils.push(p); brouillon.selId = p.id;
  remplirSelReglage(); chargerChamps(p);
  form.elements.nom.focus(); form.elements.nom.select();
};
$('btnSupprProfil').onclick = () => {
  if (brouillon.profils.length < 2) return;
  if (!confirm(`Supprimer le tarif « ${profilBrouillon().nom} » ?`)) return;
  brouillon.profils = brouillon.profils.filter((p) => p.id !== brouillon.selId);
  brouillon.selId = brouillon.profils[0].id;
  remplirSelReglage(); chargerChamps(profilBrouillon());
};

function remplirSuppsReglage() {
  const zone = $('listeSupps');
  zone.replaceChildren(...brouillon.supps.map((s, i) => {
    const nom = el('input', { type: 'text', value: s.nom, maxLength: 20, placeholder: 'Nom' });
    nom.setAttribute('aria-label', `Nom du supplément ${i + 1}`);
    nom.oninput = () => { s.nom = nom.value; };
    const montant = el('input', { type: 'number', step: '0.01', min: '0', inputMode: 'decimal', placeholder: 'Libre', value: s.montant > 0 ? s.montant : '' });
    montant.setAttribute('aria-label', `Montant du supplément ${i + 1} (vide : saisi à chaque fois)`);
    montant.oninput = () => { const v = parseFloat(montant.value.replace(',', '.')); s.montant = v > 0 ? v : null; };
    const x = el('button', { type: 'button', className: 'icone' }, svgCroix());
    x.setAttribute('aria-label', `Supprimer le supplément ${i + 1}`);
    x.onclick = () => { brouillon.supps.splice(i, 1); remplirSuppsReglage(); };
    return el('div', { className: 'ligne-reglage-supp' }, nom, montant, x);
  }));
}
$('btnAjoutSupp').onclick = () => {
  brouillon.supps.push({ nom: '', montant: null });
  remplirSuppsReglage();
  $('listeSupps').lastElementChild?.querySelector('input')?.focus();
};

$('btnReglages').onclick = () => {
  brouillon = {
    profils: profilsData.profils.map((p) => ({ ...p })),
    selId: profilsData.actif,
    supps: supplementsConfig.map((s) => ({ ...s })),
  };
  remplirSelReglage(); chargerChamps(profilBrouillon()); remplirSuppsReglage();
  form.elements.recuChauffeur.value = infosRecu.chauffeur;
  form.elements.recuTaxi.value = infosRecu.taxi;
  form.elements.recuTelephone.value = infosRecu.telephone;
  dlg.showModal();
};
dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'ok' || !brouillon) { brouillon = null; return; }
  lireChamps(profilBrouillon());
  profilsData = { profils: brouillon.profils, actif: brouillon.selId };
  sauverProfils(store, profilsData.profils, profilsData.actif);
  tarifs = profilActif(profilsData);
  supplementsConfig = brouillon.supps.filter((s) => s.nom.trim()).map((s) => ({ nom: s.nom.trim(), montant: s.montant > 0 ? s.montant : null }));
  ecrire(store, CLES.supplements, supplementsConfig);
  infosRecu = {
    chauffeur: form.elements.recuChauffeur.value.trim(),
    taxi: form.elements.recuTaxi.value.trim(),
    telephone: form.elements.recuTelephone.value.trim(),
  };
  ecrire(store, CLES.recu, infosRecu);
  brouillon = null;
  if (!course) tarifsCourse = tarifs;
  remplirSelProfil(); cleBoutonsSupps = '*'; rendu();
});

// ================= Horloge et reprise =================
// Le compteur avance aussi à l'arrêt.
setInterval(() => {
  if (course && course.etat === 'en_course') { tick(course, tarifsCourse); sauver(); }
  rendu();
}, 1000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && course?.etat === 'en_course') garderEcran();
});

// Reprise après fermeture ou rechargement de l'appli
if (course?.etat === 'en_course') { demarrerGps(); garderEcran(); }

// Aide à l'installation
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (!standalone && ios) {
  $('aideInstall').hidden = false;
  $('aideInstall').textContent = "Pour l'installer : bouton Partager, puis « Sur l'écran d'accueil ».";
}
let promptInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); promptInstall = e;
  const a = $('aideInstall'); a.hidden = false; a.innerHTML = '<button class="btn" id="btnInstall">Installer l\'application</button>';
  $('btnInstall').onclick = async () => { await promptInstall.prompt(); a.hidden = true; };
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

remplirSelProfil();
rendu();
