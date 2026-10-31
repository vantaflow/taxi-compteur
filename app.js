import { DEFAULT_TARIFS, nouvelleCourse, tick, position, detail, pause, reprendre, terminer } from './meter.js';

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
    $('dPec').textContent = fmt(tarifs.priseEnCharge); $('dDist').textContent = fmt(0); $('dAtt').textContent = fmt(0);
    $('badgeNuit').hidden = true;
    boutons('libre');
  } else {
    const d = detail(course, t);
    $('total').textContent = fmt(d.total);
    $('distance').textContent = `${(course.distance / 1000).toFixed(2)} km`;
    $('attente').textContent = fmtTemps(course.attente);
    $('duree').textContent = fmtTemps(course.duree);
    $('vitesse').textContent = `${Math.round(course.vitesse)} km/h`;
    $('dPec').textContent = fmt(d.priseEnCharge);
    $('dDist').textContent = fmt(d.distancePart);
    $('dAtt').textContent = fmt(d.attentePart);
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
}

function boutons(etat) {
  $('btnStart').hidden = etat !== 'libre';
  $('btnPause').hidden = !(etat === 'en_course' || etat === 'pause');
  $('btnPause').textContent = etat === 'pause' ? 'Reprendre' : 'Pause';
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

// Réglages
const dlg = $('reglages'), form = $('formReglages');
$('btnReglages').onclick = () => {
  for (const [k, v] of Object.entries(tarifs)) {
    const el = form.elements[k]; if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
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
if (course?.etat === 'en_course') { course.dernierPoint = null; demarrerGps(); garderEcran(); }

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
