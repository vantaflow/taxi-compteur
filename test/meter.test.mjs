import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TARIFS as T, nouvelleCourse, tick, position, detail, attenteTotale, pause, reprendre, terminer } from '../meter.js';

const t = { ...T, nuitAuto: false, priseEnCharge: 6, prixKm: 1, prixMinute: 0.5 };
const LON = -7.5898, M_PAR_DEG = 111195;
const prix = (c) => +detail(c, t).total.toFixed(2);

function roule(c, s, metres, now, lat) {
  for (let i = 0; i < s; i++) { now += 1000; lat += metres / s / M_PAR_DEG; position(c, t, { lat, lon: LON, acc: 8, t: now, speed: metres / s }); tick(c, t, now); }
  return [now, lat];
}

test('prix du début affiché au démarrage', () => {
  assert.equal(prix(nouvelleCourse(t, 0)), 6);
});

test("à l'arrêt le compteur augmente à la minute", () => {
  const c = nouvelleCourse(t, 0); let now = 0;
  for (let i = 1; i <= 120; i++) { now = i * 1000; position(c, t, { lat: 33.5731 + (i % 2) * 1e-5, lon: LON, acc: 10, t: now, speed: 0 }); tick(c, t, now); }
  assert.equal(c.distance, 0); assert.equal(c.attente, 120); assert.equal(prix(c), 7);
});

test('en roulant, au kilomètre, sans attente', () => {
  const c = nouvelleCourse(t, 0);
  position(c, t, { lat: 33.5731, lon: LON, acc: 8, t: 0, speed: 0 });
  roule(c, 100, 1000, 0, 33.5731);
  assert.ok(Math.abs(c.distance - 1000) < 5); assert.equal(c.attente, 0);
});

test('la pause ne compte rien', () => {
  const c = nouvelleCourse(t, 0); pause(c, 0); tick(c, t, 60000); reprendre(c, 60000);
  assert.equal(prix(c), 6);
});

test('verrouillage en roulant : pas de double facturation', () => {
  const c = nouvelleCourse(t, 0); let lat = 33.5731, now = 0;
  position(c, t, { lat, lon: LON, acc: 8, t: 0, speed: 0 });
  [now, lat] = roule(c, 60, 600, now, lat);
  now += 600000; tick(c, t, now);                    // 10 min écran verrouillé
  assert.equal(attenteTotale(c), 600);                // provisoire en attendant le GPS
  lat += 3000 / M_PAR_DEG; position(c, t, { lat, lon: LON, acc: 8, t: now, speed: 0 });
  // 3 km × 1,25 = 3,75 km ; 3,75 km à 30 km/h = 450 s ; reste 150 s d'attente
  assert.ok(Math.abs(c.distance - 4350) < 10);
  assert.ok(Math.abs(c.attente - 150) < 2); assert.equal(c.suspens, 0);
});

test("verrouillage à l'arrêt : tout en attente", () => {
  const c = nouvelleCourse(t, 0);
  position(c, t, { lat: 33.5731, lon: LON, acc: 8, t: 0, speed: 0 });
  tick(c, t, 300000); position(c, t, { lat: 33.5731, lon: LON, acc: 8, t: 300000, speed: 0 });
  assert.equal(c.distance, 0); assert.equal(c.attente, 300); assert.equal(prix(c), 8.5);
});

test('sans GPS du tout, le temps est compté puis soldé à la fin', () => {
  const c = nouvelleCourse(t, 0); tick(c, t, 120000); terminer(c, 120000);
  assert.equal(c.attente, 120); assert.equal(c.suspens, 0); assert.equal(prix(c), 7);
});
