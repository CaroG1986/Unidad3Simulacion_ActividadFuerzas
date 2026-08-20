import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  color,
  float,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  step,
  uint,
  uv,
  vec3,
  vec4
} from 'three/tsl';

export function createSimulation({ renderer, scene, params, count = 131072 }) {
  // STATE -----------------------------------------------------------------
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');

  // INITIALIZATION ------------------------------------------------------
  const initParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);

    const r1 = hash(i.add(uint(11)));
    const r2 = hash(i.add(uint(23)));
    const r3 = hash(i.add(uint(37)));
    const r4 = hash(i.add(uint(53)));
    const r5 = hash(i.add(uint(71)));
    const r6 = hash(i.add(uint(89)));

    // Disco 3D
    const innerRadius = float(0.5);
    const outerRadius = params.boundsSize.mul(float(0.35));
    const diskHeight = float(0.2);

    const radiusSq = mix(innerRadius.mul(innerRadius), outerRadius.mul(outerRadius), r1);
    const radius = radiusSq.sqrt();
    const angle = r2.mul(float(Math.PI * 2.0));

    const x = radius.mul(angle.cos());
    const y = radius.mul(angle.sin());
    const z = r3.sub(float(0.5)).mul(diskHeight);

    p.assign(vec3(x, y, z));
    v.assign(vec3(r4, r5, r6).sub(float(0.5)).mul(params.initialSpeed));
  })().compute(count).setName('Initialize Particles');

  // UPDATE / COMPUTE SHADER ----------------------------------------------
  const updateParticles = Fn(() => {
    const p = positionBuffer.element(instanceIndex);
    const v = velocityBuffer.element(instanceIndex);

    const dt = params.dt.mul(params.timeScale);
    const force = vec3(0.0).toVar();

    // 1) DISPERSIÓN ENTRE SÍ
    const distFromCenter = max(p.length(), float(0.001));
    const dirOutward = p.div(distFromCenter);
    force.addAssign(dirOutward.mul(params.dispersionStrength).mul(params.dispersionEnabled));

    // 2) VIENTO (Ejes XY originales + Eje Z)
    const windForceZ = vec3(float(0.0), float(0.0), params.windZ);
    force.addAssign(params.wind.add(windForceZ).mul(params.windEnabled));

    // 3) FUERZA RADIAL (ATRACCIÓN Y REPULSIÓN DEL MOUSE)
    // Solo se calcula cuando boundaryMode NO es 0.0 (es decir, cuando la esfera está activa)
    const toAttractor = params.attractor.sub(p);
    const distance = max(toAttractor.length(), params.softening);
    const radialDirection = toAttractor.div(distance);

    // Condición: Si boundaryMode != 0.0 (HARD o SOFT)
    const isSphereActive = params.boundaryMode.notEqual(float(0.0));

    const radialForce = radialDirection
      .mul(params.radialStrength)
      .div(distance.pow(float(2.0)))
      .mul(params.radialEnabled)
      .mul(isSphereActive); // Se multiplica por la condición
    force.addAssign(radialForce);

    // 4) VÓRTICE
    const zAxis = vec3(0.0, 0.0, 1.0);
    const tangent = zAxis.cross(radialDirection);
    force.addAssign(tangent.mul(params.vortexStrength).mul(params.vortexEnabled).mul(isSphereActive));

    // 5) FUERZA DE RAYOS (DESCARGA ELÉCTRICA / ZIG-ZAG HACIA EL MOUSE)
    // Se proyectan las partículas a alta velocidad hacia el puntero con oscilaciones caóticas tipo rayo
    const pIdx = float(instanceIndex);
    const freq = float(18.0);
    const jitterX = p.y.mul(freq).add(params.time.mul(float(45.0))).add(pIdx.mul(float(0.1))).sin();
    const jitterY = p.x.mul(freq).add(params.time.mul(float(40.0))).add(pIdx.mul(float(0.13))).cos();
    const jitterZ = p.z.mul(freq).add(params.time.mul(float(50.0))).add(pIdx.mul(float(0.17))).sin();
    const lightningJitter = vec3(jitterX, jitterY, jitterZ).mul(params.lightningStrength.mul(float(0.45)));
    const lightningDirect = radialDirection.mul(params.lightningStrength);
    const totalLightning = lightningDirect.add(lightningJitter).mul(params.lightningEnabled);
    force.addAssign(totalLightning);

    // 6) SISTEMA L / RAMIFICACIÓN FRACTAL (BRANCHING FORCES)
    // Se divide el espacio y las partículas en ramas discretas angulares (L-System reglas + / - / & / ^)
    const level1 = pIdx.mul(float(0.5)).fract().sub(float(0.25)).mul(float(4.0)); // Variación -1 a +1
    const level2 = pIdx.mul(float(0.25)).fract().sub(float(0.5)).mul(float(1.5));
    const branchAngle = params.lsystemAngle.mul(level1.add(level2));

    // Rotación del vector radial para generar bifurcaciones en abanico/árbol fractal
    const cosA = branchAngle.cos();
    const sinA = branchAngle.sin();
    const branchDirX = radialDirection.x.mul(cosA).sub(radialDirection.y.mul(sinA));
    const branchDirY = radialDirection.x.mul(sinA).add(radialDirection.y.mul(cosA));
    const branchDirZ = radialDirection.z.add(level2.mul(float(0.2)));
    const rawBranchDir = vec3(branchDirX, branchDirY, branchDirZ);
    const branchForceDir = rawBranchDir.div(max(rawBranchDir.length(), float(0.001)));

    force.addAssign(branchForceDir.mul(params.lsystemStrength).mul(params.lsystemEnabled));

    // 7) LINEAR DRAG: F = -c v
    force.addAssign(v.mul(params.dragCoefficient).mul(params.dragEnabled).mul(float(-1.0)));

    // INTEGRACIÓN
    v.addAssign(force.mul(dt));

    const speed = v.length();
    If(speed.greaterThan(params.maxSpeed), () => {
      v.assign(v.normalize().mul(params.maxSpeed));
    });

    p.addAssign(v.mul(dt));

    // =========================================================================
    // MÁQUINA DE ESTADOS: LÍMITES / CAMPO DE FUERZA
    // =========================================================================
    const maxRadius = params.boundsSize.mul(float(0.5));
    const distToCenter = p.length();

    // ESTADO 1: HARD (Pared sólida con rebote - boundaryMode == 1.0)
    If(params.boundaryMode.equal(float(1.0)).and(distToCenter.greaterThan(maxRadius)), () => {
      const normal = p.normalize();
      p.assign(normal.mul(maxRadius));
      const vDotN = v.dot(normal);
      If(vDotN.greaterThan(float(0.0)), () => {
        const restitutionFactor = float(1.8);
        v.subAssign(normal.mul(vDotN.mul(restitutionFactor)));
      });
    });

    // ESTADO 2: SOFT (Campo de fuerza suave - boundaryMode == 2.0)
    If(params.boundaryMode.equal(float(2.0)).and(distToCenter.greaterThan(maxRadius.mul(float(0.8)))), () => {
      const depth = distToCenter.sub(maxRadius.mul(float(0.8))).div(maxRadius.mul(float(0.2)));
      const dampingFactor = float(1.0).sub(depth.clamp(float(0.0), float(0.95)));
      v.mulAssign(dampingFactor);
    });

    // (Si boundaryMode es 0.0, no entra a ningún If y la atracción/repulsión tampoco se aplica)
  })().compute(count).setName('Update Particles');

  // RENDER ---------------------------------------------------------------
  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  });

  material.positionNode = positionBuffer.toAttribute();

  // Aumento de tamaño dinámico cuando el Sistema L está activo para resaltar las ramas
  material.scaleNode = params.particleSize.mul(
    mix(float(1.0), params.lsystemScaleBoost, params.lsystemEnabled)
  );

  material.colorNode = Fn(() => {
    const speed = velocityBuffer.toAttribute().length();
    const t = speed.div(params.maxSpeed).clamp(float(0.0), float(1.0));
    return vec4(mix(params.colorSlow, params.colorFast, t), float(1.0));
  })();

  material.opacityNode = step(uv().xy.sub(float(0.5)).length(), float(0.5));

  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  scene.add(mesh);

  function reset() {
    renderer.compute(initParticles);
  }

  function stepSimulation() {
    renderer.compute(updateParticles);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
  }

  return {
    count,
    positionBuffer,
    velocityBuffer,
    reset,
    stepSimulation,
    dispose
  };
}