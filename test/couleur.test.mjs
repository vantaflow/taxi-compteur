import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../couleur.js');
const TC = globalThis.TaxiCouleur;

test('encre noire sur couleur claire, blanche sur couleur foncée', () => {
  assert.equal(TC.variantes('#ffcc00')['--c-sur'], '#111111');   // jaune
  assert.equal(TC.variantes('#d8c3a5')['--c-sur'], '#111111');   // beige
  assert.equal(TC.variantes('#c8102e')['--c-sur'], '#ffffff');   // rouge
  assert.equal(TC.variantes('#1f5fbf')['--c-sur'], '#ffffff');   // bleu
});

test('toutes les couleurs proposées restent lisibles partout', () => {
  for (const { nom, hex } of TC.PALETTE) {
    if (!hex) continue;
    const v = TC.variantes(hex);
    assert.ok(TC.contraste(v['--c'], v['--c-sur']) >= 4.5, `${nom} : texte sur la couleur`);
    assert.ok(TC.contraste(v['--c-vif'], '#07090c') >= 4.5, `${nom} : chiffres du style Néon`);
    assert.ok(TC.contraste(v['--c-fonce'], '#ffffff') >= 5, `${nom} : texte du style Épuré`);
  }
});

test('une couleur choisie librement, même très sombre, reste lisible', () => {
  const v = TC.variantes('#101820');
  assert.equal(v['--c-sur'], '#ffffff');
  assert.ok(TC.contraste(v['--c-vif'], '#07090c') >= 4.5);
});

test('seules les couleurs #rrggbb sont acceptées', () => {
  assert.equal(TC.valide('#1a2b3c'), true);
  assert.equal(TC.valide('red'), false);
  assert.equal(TC.valide('#fff'), false);
  assert.equal(TC.valide(null), false);
});
