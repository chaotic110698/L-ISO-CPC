import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertSpeed,
  cuttingSpeed,
  spindleSpeed,
  limitDiameter,
  feedRate,
  feedPerRevolution,
  roughness,
  feedForRoughness,
  noseRadiusCompensation,
  grindingSpeedRatio,
} from '../../src/engine/cutting.js';

const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);

test('conversions de vitesse : mm/min, mm/s, m/min, m/s', () => {
  near(convertSpeed(600, 'mm/min', 'mm/s'), 10);
  near(convertSpeed(10, 'mm/s', 'mm/min'), 600);
  near(convertSpeed(1, 'm/min', 'mm/min'), 1000);
  near(convertSpeed(30, 'm/s', 'm/min'), 1800);
  near(convertSpeed(30, 'm/s', 'mm/s'), 30000);
});

test('vitesse de coupe ↔ vitesse de rotation', () => {
  near(cuttingSpeed(50, 1000), (Math.PI * 50 * 1000) / 1000); // ≈ 157 m/min
  near(spindleSpeed(50, 220), (220 * 1000) / (Math.PI * 50)); // ≈ 1401 tr/min
  near(spindleSpeed(50, cuttingSpeed(50, 1234)), 1234);
  // Meule Ø400 à 1500 tr/min ≈ 31,4 m/s
  near(cuttingSpeed(400, 1500, 'm/s'), (Math.PI * 400 * 1500) / 60000);
  near(spindleSpeed(400, 35, 'm/s'), (35 * 60000) / (Math.PI * 400));
  near(cuttingSpeed(20, 300, 'mm/s'), (Math.PI * 20 * 300) / 60);
});

test('diamètre limite G50 en vitesse de coupe constante', () => {
  near(limitDiameter(220, 3000), (220 * 1000) / (Math.PI * 3000)); // ≈ 23,3 mm
});

test('avance', () => {
  near(feedRate(0.2, 1500), 300);
  near(feedRate(0.1 * 4, 2000), 800); // fraisage : fz × Z × N
  near(feedPerRevolution(300, 1500), 0.2);
});

test('rugosité théorique et avance pour une rugosité visée', () => {
  const { ra, rt } = roughness(0.2, 0.8);
  near(rt, 6.25);
  near(ra, 1.6038, 1e-3);
  near(feedForRoughness(ra, 0.8), 0.2);
});

test('compensation du rayon de bec', () => {
  const chamfer = noseRadiusCompensation(0.8, 45);
  near(chamfer.dz, 0.8 * (1 - Math.tan(Math.PI / 8)));
  near(chamfer.dxDiameter, 2 * chamfer.dz);
  near(noseRadiusCompensation(0.4, 0).dz, 0.4); // épaulement droit : r en Z
  near(noseRadiusCompensation(0.4, 90).dxRadius, 0.4); // dressage : r en X
  near(noseRadiusCompensation(0.4, 90).dz, 0);
});

test('rapport de vitesses en rectification', () => {
  near(grindingSpeedRatio(30, 'm/s', 20, 'm/min'), 90);
  near(grindingSpeedRatio(30, 'm/s', 500, 'mm/s'), 60);
});
