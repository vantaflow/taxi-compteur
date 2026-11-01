// Reçu de course, fabriqué sur le téléphone sans internet :
// en texte (WhatsApp, SMS…) ou en image PNG dessinée dans un canvas.
import { fmtDate, fmtHeure, fmtArgent, fmtDuree, numeroRecu } from './donnees.js';

// Description commune au texte et à l'image : une suite de blocs.
export function contenuRecu(r, infos = {}) {
  const dev = r.devise;
  const nuit = r.nuit ? ` (nuit +${Math.round((r.coef - 1) * 100)} %)` : '';
  const entete = [infos.chauffeur, infos.taxi && (/taxi/i.test(infos.taxi) ? infos.taxi : `Taxi ${infos.taxi}`), infos.telephone && `Tél. ${infos.telephone}`].filter(Boolean);
  const lignesPrix = [
    ['Prix du début', fmtArgent(r.priseEnCharge)],
    [`Distance ${(r.distance / 1000).toFixed(2)} km × ${fmtArgent(r.prixKm)}${r.nuit ? ' ×' + r.coef.toFixed(2) : ''}`, fmtArgent(r.distancePart)],
    [`Attente ${fmtDuree(r.attente)} × ${fmtArgent(r.prixMinute)}/min`, fmtArgent(r.attentePart)],
  ];
  if (r.minimumApplique) lignesPrix.push([`Course minimum appliquée`, fmtArgent(r.minimum)]);
  for (const s of r.supplements) lignesPrix.push([`Supplément ${s.nom}`, fmtArgent(s.montant)]);
  return {
    titre: 'REÇU DE COURSE TAXI',
    entete,
    infos: [
      ['Date', fmtDate(r.debut)],
      ['Départ', fmtHeure(r.debut)],
      ['Arrivée', fmtHeure(r.fin)],
      ['Durée', fmtDuree(r.duree)],
      ['Distance', `${(r.distance / 1000).toFixed(2)} km`],
      ['Attente', fmtDuree(r.attente)],
      ['Tarif', `${r.profil || '—'}${nuit}`],
    ],
    lignesPrix,
    total: `${fmtArgent(r.total)} ${dev}`,
    devise: dev,
    pied: ['Merci et bonne route !', `Reçu n° ${numeroRecu(r)}`],
  };
}

export function texteRecu(r, infos) {
  const c = contenuRecu(r, infos);
  const trait = '------------------------------';
  return [
    `*${c.titre}*`,
    ...c.entete,
    trait,
    ...c.infos.map(([k, v]) => `${k} : ${v}`),
    trait,
    ...c.lignesPrix.map(([k, v]) => `${k} : ${v} ${c.devise}`),
    trait,
    `*TOTAL : ${c.total}*`,
    trait,
    ...c.pied,
  ].join('\n');
}

// Image du reçu, façon ticket imprimé : fond blanc, texte noir.
export function canvasRecu(r, infos, doc = document, couleur = '#ffcc00') {
  const c = contenuRecu(r, infos);
  const L = 600, M = 40, echelle = 2;
  const police = (taille, gras = false) => `${gras ? 800 : 500} ${taille}px Manrope, system-ui, sans-serif`;
  const H = 150 + c.entete.length * 30 + c.infos.length * 34 + c.lignesPrix.length * 34 + 220;
  const cv = doc.createElement('canvas');
  cv.width = L * echelle; cv.height = H * echelle;
  const g = cv.getContext('2d');
  g.scale(echelle, echelle);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, L, H);
  g.fillStyle = couleur; g.fillRect(0, 0, L, 10); // bandeau à la couleur du taxi
  g.fillStyle = '#111111'; g.textBaseline = 'alphabetic';
  let y = 64;
  const centre = (txt, taille, gras) => { g.font = police(taille, gras); g.textAlign = 'center'; g.fillText(txt, L / 2, y); };
  const ligne = (gauche, droite, taille = 19, gras = false, couleurGauche = '#555') => {
    g.font = police(taille, gras); g.textAlign = 'left'; g.fillStyle = couleurGauche;
    // coupe un libellé trop long pour ne pas chevaucher le montant
    let txt = gauche; const max = L - 2 * M - g.measureText(droite).width - 16;
    while (g.measureText(txt).width > max && txt.length > 4) txt = txt.slice(0, -2) + '…';
    g.fillText(txt, M, y);
    g.fillStyle = '#111'; g.textAlign = 'right'; g.fillText(droite, L - M, y);
  };
  const pointilles = () => {
    y += 4; g.strokeStyle = '#999'; g.setLineDash([6, 6]); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(M, y); g.lineTo(L - M, y); g.stroke(); g.setLineDash([]); y += 34;
  };
  centre(c.titre, 28, true); y += 34;
  g.fillStyle = '#444';
  for (const e of c.entete) { centre(e, 19); y += 30; }
  g.fillStyle = '#111';
  pointilles();
  for (const [k, v] of c.infos) { ligne(k, v); y += 34; }
  pointilles();
  for (const [k, v] of c.lignesPrix) { ligne(k, `${v} ${c.devise}`); y += 34; }
  pointilles();
  y += 6; ligne('TOTAL', c.total, 32, true, '#111'); y += 26;
  pointilles();
  g.fillStyle = '#444';
  for (const p of c.pied) { centre(p, 17); y += 28; }
  return cv;
}

export const blobRecu = (cv) => new Promise((ok) => cv.toBlob(ok, 'image/png'));
