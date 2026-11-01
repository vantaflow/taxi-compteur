// Couleur dominante (couleur des taxis de la ville). Script classique chargé dans <head>,
// avant l'affichage, pour éviter un flash de la mauvaise couleur.
// À partir d'une couleur, on calcule des variantes toujours lisibles :
//   --c       la couleur telle quelle (fonds, anneau, boutons)
//   --c-sur   noir ou blanc, l'encre la plus lisible posée sur --c
//   --c-vif   la couleur éclaircie si besoin pour être lisible sur fond très sombre (Néon)
//   --c-fonce la couleur assombrie si besoin pour être lisible sur fond clair (Épuré)
(function (g) {
  var CLE = 'taxi.couleur';

  // Couleurs proposées. null = la couleur d'origine de chaque style.
  var PALETTE = [
    { nom: "D'origine", hex: null },
    { nom: 'Jaune · New York', hex: '#ffcc00' },
    { nom: 'Rouge · Casablanca, Fès', hex: '#c8102e' },
    { nom: 'Bleu · Rabat', hex: '#1f5fbf' },
    { nom: 'Beige · Marrakech', hex: '#d8c3a5' },
    { nom: 'Orange · Agadir', hex: '#f07c1b' },
    { nom: 'Turquoise · Tanger', hex: '#1aa6a6' },
    { nom: 'Bleu ciel · Meknès', hex: '#5bb4e5' },
    { nom: 'Vert', hex: '#2e9d4f' },
  ];

  function rgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function hex(c) {
    return '#' + c.map(function (v) { return Math.round(v).toString(16).padStart(2, '0'); }).join('');
  }
  function luminance(h) {
    var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contraste(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function melange(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return hex(x.map(function (v, i) { return v + (y[i] - v) * t; }));
  }
  // Rapproche la couleur de `vers` jusqu'à atteindre le contraste voulu contre `fond`.
  function lisible(h, fond, vers, mini) {
    for (var t = 0; t <= 1.0001; t += 0.05) {
      var m = melange(h, vers, t);
      if (contraste(m, fond) >= mini) return m;
    }
    return vers;
  }
  function valide(h) { return typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h); }

  function variantes(h) {
    return {
      '--c': h,
      '--c-sur': contraste(h, '#111111') >= contraste(h, '#ffffff') ? '#111111' : '#ffffff',
      '--c-vif': lisible(h, '#07090c', '#ffffff', 4.5),
      '--c-fonce': lisible(h, '#ffffff', '#000000', 5),
    };
  }

  function appliquer(h, racine) {
    var s = (racine || document.documentElement).style;
    var v = valide(h) ? variantes(h) : null;
    ['--c', '--c-sur', '--c-vif', '--c-fonce'].forEach(function (k) {
      if (v) s.setProperty(k, v[k]); else s.removeProperty(k);
    });
  }
  function lire() {
    try { var h = localStorage.getItem(CLE); return valide(h) ? h : null; } catch (e) { return null; }
  }
  function enregistrer(h) {
    try { if (valide(h)) localStorage.setItem(CLE, h); else localStorage.removeItem(CLE); } catch (e) { /* indisponible */ }
  }

  g.TaxiCouleur = { PALETTE: PALETTE, variantes: variantes, contraste: contraste, appliquer: appliquer, lire: lire, enregistrer: enregistrer, valide: valide };
})(typeof window !== 'undefined' ? window : globalThis);
