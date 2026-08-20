import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    initialSpeed: uniform(0.0),
    maxSpeed: uniform(30.0),
    boundsSize: uniform(10.0),
    particleSize: uniform(0.035),

    boundaryMode: uniform(1.0),

    dispersionEnabled: uniform(0.0),
    dispersionStrength: uniform(25.0),

    // VIENTO
    windEnabled: uniform(1.0), // Activo por defecto para que responda al slider
    wind: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),
    windZ: uniform(0.0),       // <-- NUEVO: Fuerza del viento en Z (-50 a 50)

    radialEnabled: uniform(0.0),
    attractor: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),
    radialStrength: uniform(25.0),
    softening: uniform(0.35),

    vortexEnabled: uniform(0.0),
    vortexStrength: uniform(1.4),

    dragEnabled: uniform(1.0),
    dragCoefficient: uniform(0.12),

    // FUERZA DE RAYOS / DESCARGA HACIA EL MOUSE
    lightningEnabled: uniform(0.0),
    lightningStrength: uniform(60.0),
    time: uniform(0.0),

    // SISTEMA L (RAMIFICACIÓN FRACTAL / ÁRBOL)
    lsystemEnabled: uniform(0.0),
    lsystemStrength: uniform(30.0),
    lsystemAngle: uniform(0.45), // ~25-30 grados de ramificación
    lsystemScaleBoost: uniform(2.5), // Multiplicador de tamaño al activarse

    // COLOR Y DEGRADADOS (Lento -> Rápido)
    colorSlow: uniform(new THREE.Color('#46a6ff')),
    colorFast: uniform(new THREE.Color('#ffb35a'))
  };
}