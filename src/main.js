import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';

/*
2^15: 32768
2^16: 65536
2^17: 131072
2^18: 262144
2^19: 524288
2^20: 1048576
2^21: 2097152
2^22: 4194304
2^23: 8388608
2^24: 16777216
*/

const PARTICLE_COUNT = 131072; //2^17. Increase only after measuring performance.

async function main() {
  const mount = document.querySelector('#app');

  if (!WebGPU.isAvailable()) {
    mount.appendChild(WebGPU.getErrorMessage());
    throw new Error('Este proyecto requiere WebGPU para ejecutar compute shaders.');
  }

  // THREE.JS MENTAL MODEL: scene + camera + renderer ---------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050607');

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
  camera.position.set(0, 0, 11);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  mount.appendChild(renderer.domElement);
  await renderer.init();

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0, 0);

  const params = createParameters();
  const simulation = createSimulation({ renderer, scene, params, count: PARTICLE_COUNT });

  // LAB HELPERS -----------------------------------------------------------
 /*st attractorHelper = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  );
  scene.add(attractorHelper);*/
  const axes = new THREE.AxesHelper(1.5);
  scene.add(axes);

  // POINTER -> WORLD POSITION --------------------------------------------
  // This is a useful camera concept: screen coordinates are not world coords.
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

 addEventListener('pointermove', (event) => {
    pointerNdc.x = (event.clientX / innerWidth) * 2 - 1;
    pointerNdc.y = -(event.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.ray.intersectPlane(interactionPlane, hit)) {
      params.attractor.value.copy(hit);
      // attractorHelper.position.copy(hit); <-- Comentar esta línea también
    }
  });

  let paused = false;
  let mode = 'LAB';
  let panel;
  let savedRadialStrength = params.radialStrength.value;
  let savedRadialEnabled = params.radialEnabled.value;

  const applyPreset = (id) => {
    params.windEnabled.value = 0;
    params.radialEnabled.value = 0;
    params.vortexEnabled.value = 0;
    params.dragEnabled.value = 0;
    params.wind.value.set(0, 0, 0);
    params.initialSpeed.value = 0;

    if (id === 'inertia') {
      params.initialSpeed.value = 0.8;
    } else if (id === 'wind') {
      params.windEnabled.value = 1;
      params.wind.value.set(1.5, 0, 0);
    } else if (id === 'attract') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = 3.0;
    } else if (id === 'repel') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = -3.0;
    } else if (id === 'vortex') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = 1.0;
      params.vortexEnabled.value = 1;
      params.vortexStrength.value = 3.0;
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.08;
    }
    simulation.reset();
    panel?.refresh();
  };

  // PALETAS DE DEGRADADOS DE COLOR ---------------------------------------
  const COLOR_PALETTES = [
    { name: 'Cian · Ámbar', slow: '#46a6ff', fast: '#ffb35a' },
    { name: 'Cyberpunk Neón', slow: '#8a2be2', fast: '#00ffff' },
    { name: 'Fuego / Magma', slow: '#ff1e00', fast: '#ffee44' },
    { name: 'Aurora Esmeralda', slow: '#004d40', fast: '#00ff88' },
    { name: 'Atardecer Violeta', slow: '#311b92', fast: '#ff4081' },
    { name: 'Glaciar Eléctrico', slow: '#001f3f', fast: '#7fdbff' }
  ];

  let currentPaletteIndex = 0;
  const targetSlowColor = new THREE.Color(COLOR_PALETTES[0].slow);
  const targetFastColor = new THREE.Color(COLOR_PALETTES[0].fast);

  const nextColorPalette = () => {
    currentPaletteIndex = (currentPaletteIndex + 1) % COLOR_PALETTES.length;
    const p = COLOR_PALETTES[currentPaletteIndex];
    targetSlowColor.set(p.slow);
    targetFastColor.set(p.fast);
    return p.name;
  };

  const getCurrentPaletteName = () => COLOR_PALETTES[currentPaletteIndex].name;

  const setMode = (next) => {
    mode = next;
    const lab = mode === 'LAB';
    panel.setVisible(lab);
    axes.visible = lab;
    hud.innerHTML = lab
      ? '<strong>LAB</strong> · Flechas: Viento X/Y · 1/2: Viento Z · P: perf · C: color · L: rayos · T: ramas'
      : '<strong>PERFORMANCE</strong> · Flechas: Viento X/Y · 1/2: Viento Z · P: lab · C: color · L: rayos · T: ramas · A/S/D: fuerzas';
  };

  panel = createLabPanel({
    params,
    onReset: () => simulation.reset(),
    onPreset: applyPreset,
    onModeChange: () => setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB'),
    onPauseChange: () => paused = !paused,
    onNextColorPalette: () => {
      const name = nextColorPalette();
      return name;
    },
    getCurrentPaletteName
  });

  const hud = document.createElement('div');
  hud.className = 'hud';
  document.body.append(hud);
  setMode('LAB');

  // BASELINE LIVE INSTRUMENT MAPPING -------------------------------------
  savedRadialStrength = params.radialStrength.value;
  savedRadialEnabled = params.radialEnabled.value;

  // Configuración de la máquina de estados en JS
  const BOUNDARY_STATES = {
    OFF: 0.0,
    HARD: 1.0,
    SOFT: 2.0
  };

  let currentBoundaryState = BOUNDARY_STATES.HARD;

  function toggleBoundaryState() {
    if (currentBoundaryState === BOUNDARY_STATES.HARD) {
      currentBoundaryState = BOUNDARY_STATES.OFF;
      console.log('Límite: DESACTIVADO (Partículas libres)');
    } else if (currentBoundaryState === BOUNDARY_STATES.OFF) {
      currentBoundaryState = BOUNDARY_STATES.SOFT;
      console.log('Límite: CAMPO DE FUERZA SUAVE');
    } else {
      currentBoundaryState = BOUNDARY_STATES.HARD;
      console.log('Límite: PARED SÓLIDA');
    }

    params.boundaryMode.value = currentBoundaryState;
  }

  // Event listener para teclado
  addEventListener('keydown', (event) => {
    // =========================================================================
    // CONTROL DEL VIENTO POR TECLADO
    // =========================================================================
    // Flechas Izquierda/Derecha: Viento en X [-4 a 4]
    if (event.code === 'ArrowLeft') {
      event.preventDefault();
      params.wind.value.x = Math.max(-4.0, Number((params.wind.value.x - 0.1).toFixed(2)));
      panel?.refresh();
    }
    if (event.code === 'ArrowRight') {
      event.preventDefault();
      params.wind.value.x = Math.min(4.0, Number((params.wind.value.x + 0.1).toFixed(2)));
      panel?.refresh();
    }

    // Flechas Arriba/Abajo: Viento en Y [-4 a 4]
    if (event.code === 'ArrowUp') {
      event.preventDefault();
      params.wind.value.y = Math.min(4.0, Number((params.wind.value.y + 0.1).toFixed(2)));
      panel?.refresh();
    }
    if (event.code === 'ArrowDown') {
      event.preventDefault();
      params.wind.value.y = Math.max(-4.0, Number((params.wind.value.y - 0.1).toFixed(2)));
      panel?.refresh();
    }

    // Tecla 1 y 2: Viento en Z [-50 a 50] (1 disminuye, 2 aumenta)
    if (event.code === 'Digit1') {
      event.preventDefault();
      params.windZ.value = Math.max(-50.0, Number((params.windZ.value - 1.0).toFixed(1)));
      panel?.refresh();
    }
    if (event.code === 'Digit2') {
      event.preventDefault();
      params.windZ.value = Math.min(50.0, Number((params.windZ.value + 1.0).toFixed(1)));
      panel?.refresh();
    }

    // A partir de aquí no permitir repetición continua innecesaria para toggles
    if (event.repeat) return;

    if (event.code === 'KeyP') setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB');
    if (event.code === 'KeyR') simulation.reset();

    // Transición de degradado de color con la tecla C
    if (event.code === 'KeyC') {
      nextColorPalette();
      panel?.refresh();
    }

    // Activar/Desactivar Estado de Rayos con la tecla L (Toggle)
    if (event.code === 'KeyL') {
      params.lightningEnabled.value = params.lightningEnabled.value > 0 ? 0.0 : 1.0;
      panel?.refresh();
    }

    // Activar/Desactivar Estado de Ramas / L-System con la tecla T (Tree/Bifurcación)
    if (event.code === 'KeyT') {
      params.lsystemEnabled.value = params.lsystemEnabled.value > 0 ? 0.0 : 1.0;
      panel?.refresh();
    }

    // Cambiar estado de límites (B)
    if (event.code === 'KeyB') {
      toggleBoundaryState();
    }

    // ATRACCIÓN HACIA EL MOUSE (Mantener 'A' o 'Space')
    if (event.code === 'KeyA' || event.code === 'Space') {
      event.preventDefault();
      params.radialEnabled.value = 1.0;
      params.radialStrength.value = 25.0; // Positivo
    }

    // REPULSIÓN HACIA EL MOUSE (Mantener 'S')
    if (event.code === 'KeyS') {
      event.preventDefault();
      params.radialEnabled.value = 1.0;
      params.radialStrength.value = -25.0; // Negativo
    }

    // DISPERSIÓN ENTRE SÍ / EXPANSIÓN (Mantener 'D')
    if (event.code === 'KeyD') {
      event.preventDefault();
      params.dispersionEnabled.value = 1.0;
    }
  });

  addEventListener('keyup', (event) => {
    if (event.code === 'KeyA' || event.code === 'Space' || event.code === 'KeyS') {
      params.radialEnabled.value = 0.0;
    }

    if (event.code === 'KeyD') {
      params.dispersionEnabled.value = 0.0;
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  simulation.reset();

  const clock = new THREE.Clock();

  // FRAME LOOP ------------------------------------------------------------
  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    params.time.value += delta;

    if (!paused) simulation.stepSimulation();

    // Transición suave (Lerp) de color en cada cuadro
    params.colorSlow.value.lerp(targetSlowColor, 0.05);
    params.colorFast.value.lerp(targetFastColor, 0.05);

    orbit.update();
    renderer.render(scene, camera);
  });
}

main().catch((error) => {
  console.error(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:16px;white-space:pre-wrap;color:#fff;z-index:50';
  pre.textContent = String(error?.stack || error);
  document.body.append(pre);
});
