import { attenteTotale, DEFAULT_TARIFS, nouvelleCourse, tick, position, detail, pause, reprendre, terminer } from './meter.js';

const $ = (id) => document.getElementById(id);
const CLE_TARIFS = 'taxi.tarifs';
const CLE_COURSE = 'taxi.course';

function lire(cle, defaut) {
  try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; }
}
function ecrire(cle, v) {
  try { v == null ? localStorage.removeItem(cle) : localStorage.setItem(cle, JSON.stringify(v)); } catch { /* stockage indisponible */ }
}

let tarifs = { ...DEFAULT_TARIFS, ...lire(CLE_TARIFS, {}) };
let course = lire(CLE_COURSE, null);
// La course garde les tarifs avec lesquels elle a démarré.
let tarifsCourse = course?.tarifs || tarifs;
let watchId = null;
let wakeLock = null;
let gpsMsg = { txt: 'GPS : en attente', cls: '' };

const fmt = (n) => n.toFixed(2);
const fmtTemps = (s) => {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

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
  $('bAtt').style.flexGrow = d.attentePart;
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
  $('btnReglages').disabled = etat === 'en_course' || etat === 'pause';
}

function sauver() { ecrire(CLE_COURSE, course ? { ...course, tarifs: tarifsCourse } : null); }

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
  tick(course, tarifsCourse); terminer(course); arreterGps(); libererEcran(); sauver(); rendu();
};
$('btnReset').onclick = () => { course = null; tarifsCourse = tarifs; sauver(); rendu(); };

// Style d'affichage : Néon nuit, Jaune taxi, Épuré clair
const COULEUR_BARRE = { neon: '#07090c', jaune: '#ffcc00', epure: '#f6f6f3' };
function appliquerStyle(s) {
  document.documentElement.dataset.style = s;
  document.querySelector('meta[name="theme-color"]').content = COULEUR_BARRE[s] || '#07090c';
  document.querySelectorAll('.carte-style').forEach((b) => b.setAttribute('aria-pressed', String(b.value === s)));
}
appliquerStyle(document.documentElement.dataset.style || 'neon');
const dlgStyles = $('styles');
$('btnTheme').onclick = () => dlgStyles.showModal();
dlgStyles.addEventListener('close', () => {
  const s = dlgStyles.returnValue;
  if (!COULEUR_BARRE[s]) return;
  try { localStorage.setItem('taxi.style', s); localStorage.removeItem('taxi.theme'); } catch { /* indisponible */ }
  appliquerStyle(s); rendu();
});

// Réglages
const dlg = $('reglages'), form = $('formReglages');
// Aide des réglages : explications sous chaque champ et exemple calculé en direct.
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
$('btnReglages').onclick = () => {
  for (const [k, v] of Object.entries(tarifs)) {
    const el = form.elements[k]; if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
  exempleAide();
  dlg.showModal();
};
dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'ok') return;
  const n = { ...tarifs };
  for (const k of Object.keys(DEFAULT_TARIFS)) {
    const el = form.elements[k]; if (!el) continue;
    if (el.type === 'checkbox') n[k] = el.checked;
    else if (el.type === 'number') { const v = parseFloat(String(el.value).replace(',', '.')); if (Number.isFinite(v) && v >= 0) n[k] = v; }
    else n[k] = el.value.trim() || DEFAULT_TARIFS[k];
  }
  tarifs = n; ecrire(CLE_TARIFS, tarifs);
  if (!course) tarifsCourse = tarifs;
  rendu();
});

// Horloge : le compteur avance aussi à l'arrêt.
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

rendu();
