// Couleur dominante (couleur des taxis de la ville). Script classique chargé dans <head>,
// avant l'affichage, pour éviter un flash de la mauvaise couleur.
// À partir d'une couleur, on calcule des variantes toujours lisibles :
//   --c       la couleur telle quelle (fonds, anneau, boutons)
//   --c-sur   noir ou blanc, l'encre la plus lisible posée sur --c
//   --c-vif   la couleur éclaircie si besoin pour être lisible sur fond très sombre (Néon)
//   --c-fonce la couleur assombrie si besoin pour être lisible sur fond clair (Épuré)
//   --c-anneau la couleur assombrie si besoin pour se voir sur l'anneau gris (Épuré)
(function (g) {
  var CLE = 'taxi.couleur';

  // Couleurs proposées. null = la couleur d'origine de chaque style.
  // Couleurs des taxis. Maroc : https://fr.wikipedia.org/wiki/Taxi_au_Maroc
  // Monde : https://en.wikipedia.org/wiki/Taxicabs_by_country
  var PALETTE = [
    { nom: "D'origine", hex: null, groupe: '' },
    { nom: 'Jaune · Salé, Tétouan, Beni Mellal', hex: '#ffcc00', groupe: 'Maroc' },
    { nom: 'Rouge · Casablanca, Fès, Oujda', hex: '#c8102e', groupe: 'Maroc' },
    { nom: 'Bleu · Rabat, Essaouira', hex: '#1f5fbf', groupe: 'Maroc' },
    { nom: 'Bleu ciel · Meknès, Taza, Tanger', hex: '#5bb4e5', groupe: 'Maroc' },
    { nom: 'Ocre · Marrakech', hex: '#cc8a3c', groupe: 'Maroc' },
    { nom: 'Orange · Agadir, Berkane', hex: '#f07c1b', groupe: 'Maroc' },
    { nom: 'Vert · Mohammédia, Ifrane, Témara', hex: '#2e9d4f', groupe: 'Maroc' },
    { nom: 'Blanc · El Jadida, Kénitra, Safi', hex: '#f5f5f2', groupe: 'Maroc' },
    { nom: "Rose · Kelaat M'Gouna", hex: '#e88aa8', groupe: 'Maroc' },
    { nom: 'Jaune · New York, Moscou, Budapest', hex: '#f7c600', groupe: 'Monde' },
    { nom: 'Noir · Londres, Osaka', hex: '#1b1b1d', groupe: 'Monde' },
    { nom: 'Blanc · Italie, Espagne, Israël', hex: '#fafafa', groupe: 'Monde' },
    { nom: 'Ivoire · Allemagne', hex: '#e6d2b5', groupe: 'Monde' },
    { nom: 'Rose · Mexico', hex: '#e4007c', groupe: 'Monde' },
    { nom: 'Rouge · Hong Kong', hex: '#d71920', groupe: 'Monde' },
    { nom: 'Vert · Hong Kong (Nouveaux Territoires)', hex: '#3aa655', groupe: 'Monde' },
    { nom: 'Bleu clair · Jakarta', hex: '#3fa9f5', groupe: 'Monde' },
    { nom: 'Orange · Ghana, Oman', hex: '#f28c28', groupe: 'Monde' },
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
    var btn;
    var v = {
      '--c': h,
      '--c-sur': contraste(h, '#111111') >= contraste(h, '#ffffff') ? '#111111' : '#ffffff',
      '--c-vif': lisible(h, '#07090c', '#ffffff', 4.5),
      '--c-fonce': lisible(h, '#ffffff', '#000000', 5),
      // anneau du style Épuré : doit se voir sur son fond gris très clair (blanc, beige…)
      '--c-anneau': lisible(h, '#e6e6e1', '#000000', 1.6),
      // style Couleur taxi : cases du damier et boutons posés sur le panneau noir
      '--c-damier': contraste(h, '#111111') >= 2 ? '#111111' : '#ffffff',
      '--c-btn': contraste(h, '#111111') >= 2 ? h : lisible(h, '#111111', '#ffffff', 3),
    };
    btn = v['--c-btn'];
    v['--c-btn-sur'] = contraste(btn, '#111111') >= contraste(btn, '#ffffff') ? '#111111' : '#ffffff';
    return v;
  }

  function appliquer(h, racine) {
    var s = (racine || document.documentElement).style;
    var v = valide(h) ? variantes(h) : null;
    ['--c', '--c-sur', '--c-vif', '--c-fonce', '--c-anneau', '--c-damier', '--c-btn', '--c-btn-sur'].forEach(function (k) {
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
