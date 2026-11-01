// Logique pure du taximètre (sans DOM), testable avec Node.
// Règle d'un vrai compteur : au-dessus de la vitesse seuil, on paie la distance ;
// en dessous (arrêt, feu rouge, bouchon), on paie le temps d'attente.

export const DEFAULT_TARIFS = {
  priseEnCharge: 7.5,   // prix affiché au démarrage
  prixKm: 2.5,          // par kilomètre parcouru
  prixMinute: 0.5,      // par minute d'attente (à l'arrêt ou en dessous du seuil)
  vitesseSeuil: 10,     // km/h : en dessous, on facture le temps
  minimum: 0,           // course minimum (0 = aucun)
  majorationNuit: 50,   // % appliqué entre heureDebutNuit et heureFinNuit
  heureDebutNuit: 20,
  heureFinNuit: 6,
  nuitAuto: true,
  devise: 'DH',
};

const R = 6371000; // rayon de la Terre en mètres
// Après une coupure GPS (écran verrouillé, tunnel), on ne connaît que la ligne droite
// entre l'avant et l'après : on la majore pour approcher la distance par la route,
// et on estime le temps passé à rouler à cette vitesse moyenne de ville.
export const FACTEUR_ROUTE = 1.25;
export const VITESSE_MOYENNE_TROU = 30; // km/h

// Temps d'attente affiché : définitif + provisoire (pendant une coupure GPS).
export const attenteTotale = (c) => c.attente + (c.suspens || 0);

export function distanceMetres(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function estNuit(date, t) {
  const h = date.getHours();
  const { heureDebutNuit: d, heureFinNuit: f } = t;
  if (d === f) return false;
  return d < f ? h >= d && h < f : h >= d || h < f;
}

export function nouvelleCourse(t, maintenant = Date.now()) {
  return {
    etat: 'en_course',      // 'en_course' | 'pause' | 'terminee'
    debut: maintenant,
    distance: 0,            // mètres facturés
    attente: 0,             // secondes facturées en attente
    suspens: 0,             // secondes sans GPS, comptées en attente en attendant la position suivante
    duree: 0,               // secondes totales en course
    enMouvement: false,
    vitesse: 0,             // km/h
    dernierPoint: null,     // {lat, lon, t, acc}
    dernierTick: maintenant,
    nuit: t.nuitAuto ? estNuit(new Date(maintenant), t) : false,
    fin: null,
    profil: t.nom || '',    // nom du tarif utilisé (Ville, Aéroport…)
    supplements: [],        // [{nom, montant}] : bagage, péage…
  };
}

// Avance l'horloge : le temps passé sous la vitesse seuil est facturé.
// Si aucune position GPS récente (> 8 s), on considère le taxi à l'arrêt.
export function tick(c, t, maintenant = Date.now()) {
  if (c.etat !== 'en_course') { c.dernierTick = maintenant; return c; }
  const dt = Math.max(0, (maintenant - c.dernierTick) / 1000);
  c.dernierTick = maintenant;
  c.duree += dt;
  const gpsPerimé = !c.dernierPoint || maintenant - c.dernierPoint.t > 8000;
  if (gpsPerimé) { c.enMouvement = false; c.vitesse = 0; }
  // Sans GPS, on ne sait pas si le taxi roule : on compte en attente « provisoire »,
  // régularisée dès que la position suivante arrive.
  if (gpsPerimé) c.suspens = (c.suspens || 0) + dt;
  else if (!c.enMouvement) c.attente += dt;
  return c;
}

function solderSuspens(c) {
  c.attente += c.suspens || 0;
  c.suspens = 0;
}

// Intègre une nouvelle position GPS.
export function position(c, t, p) {
  // p = {lat, lon, acc (m), t (ms), speed (m/s ou null)}
  if (c.etat !== 'en_course') { c.dernierPoint = null; return c; }
  if (p.acc > 50) return c; // trop imprécis : ignoré
  const prec = c.dernierPoint;
  if (!prec) { c.dernierPoint = p; return c; }
  const d = distanceMetres(prec, p);
  const dt = (p.t - prec.t) / 1000;
  if (dt <= 0) return c;
  const vitesseCalc = (d / dt) * 3.6;
  const vitesse = p.speed != null && p.speed >= 0 ? p.speed * 3.6 : vitesseCalc;
  // Filtre anti-dérive : à l'arrêt, le GPS « bouge » de quelques mètres.
  const bruit = Math.max(4, (prec.acc + p.acc) / 3);
  if (vitesseCalc > 200) return c; // saut aberrant
  if (c.suspens > 0) {
    // Fin de coupure : la ligne droite parcourue pendant le trou est facturée en distance,
    // et seul le temps qui n'a pas pu servir à rouler reste en attente.
    if (d >= bruit) {
      const route = d * FACTEUR_ROUTE;
      const tempsRoule = Math.min(c.suspens, route / (VITESSE_MOYENNE_TROU / 3.6));
      c.distance += route;
      c.attente += c.suspens - tempsRoule;
    } else {
      c.attente += c.suspens;
    }
    c.suspens = 0;
    c.dernierPoint = p;
    c.vitesse = p.speed != null && p.speed >= 0 ? p.speed * 3.6 : 0;
    c.enMouvement = c.vitesse >= t.vitesseSeuil;
    return c;
  }
  c.vitesse = vitesse;
  c.enMouvement = vitesse >= t.vitesseSeuil;
  if (d >= bruit) {
    if (c.enMouvement) c.distance += d;
    c.dernierPoint = p;
  } else {
    c.dernierPoint = { ...prec, t: p.t };
  }
  return c;
}

export function detail(c, t) {
  const coef = c.nuit ? 1 + t.majorationNuit / 100 : 1;
  const distancePart = (c.distance / 1000) * t.prixKm * coef;
  const attentePart = (attenteTotale(c) / 60) * t.prixMinute * coef;
  const brut = t.priseEnCharge + distancePart + attentePart;
  // Le minimum porte sur le compteur ; les suppléments s'ajoutent toujours en plus.
  const compteur = Math.max(brut, t.minimum || 0);
  const supplementsPart = (c.supplements || []).reduce((s, x) => s + (x.montant || 0), 0);
  return { priseEnCharge: t.priseEnCharge, distancePart, attentePart, coef,
    minimumApplique: brut < (t.minimum || 0), supplementsPart, total: compteur + supplementsPart };
}

export function ajouterSupplement(c, nom, montant) {
  if (c.etat === 'terminee' || !(montant > 0)) return c;
  (c.supplements ||= []).push({ nom, montant });
  return c;
}

export function retirerSupplement(c, index) {
  if (c.etat === 'terminee') return c;
  c.supplements?.splice(index, 1);
  return c;
}

export function pause(c, maintenant = Date.now()) {
  if (c.etat === 'en_course') { solderSuspens(c); c.etat = 'pause'; c.dernierPoint = null; c.enMouvement = false; c.vitesse = 0; }
  c.dernierTick = maintenant;
  return c;
}

export function reprendre(c, maintenant = Date.now()) {
  if (c.etat === 'pause') c.etat = 'en_course';
  c.dernierTick = maintenant;
  return c;
}

export function terminer(c, maintenant = Date.now()) {
  solderSuspens(c);
  c.etat = 'terminee';
  c.fin = maintenant;
  c.enMouvement = false;
  c.vitesse = 0;
  return c;
}
