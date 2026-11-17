// Landmarks and depth cues: the things that make the trench a place rather than a tube. Everything
// here is instanced or one Points draw, positions come from a hash of depth (so a seed always
// builds the same trench), and nothing allocates inside `update`.
import * as THREE from '../../vendor/three/three.module.min.js';

const STRATA_COUNT = 28;
const STRATA_SPACING = 11;
const ARCH_COUNT = 4;
const ARCH_SPACING = 210;
const VENT_COUNT = 10;
const VENT_SPACING = 62;
const SILHOUETTE_COUNT = 6;
const DUST_COUNT = 900;

/** Deterministic pseudo-random in [0,1) from an integer, so landmarks never move between frames. */
function hash(n) {
  let x = (n | 0) * 374761393 + 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export class Landmarks {
  constructor(scene) {
    this.scene = scene;
    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.pos = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.euler = new THREE.Euler();

    // Wall strata: thin bands that slide past the lens and give the trench a scale and a speed.
    const band = new THREE.TorusGeometry(1, 0.055, 4, 22);
    this.strata = new THREE.InstancedMesh(
      band,
      new THREE.MeshBasicMaterial({ vertexColors: false, color: 0x2b4c44, transparent: true, opacity: 0.55, fog: true }),
      STRATA_COUNT,
    );
    this.strata.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.strata.frustumCulled = false;
    this.strata.count = 0;
    scene.add(this.strata);

    // Arches: a heavier ring every couple of hundred metres, unmistakably a place you passed.
    const arch = new THREE.TorusGeometry(1, 0.11, 5, 30);
    this.arches = new THREE.InstancedMesh(
      arch,
      new THREE.MeshBasicMaterial({ color: 0x3d6b5f, vertexColors: false, fog: true }),
      ARCH_COUNT,
    );
    this.arches.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arches.frustumCulled = false;
    scene.add(this.arches);

    // Vent clusters: warm amber growths at the wall foot, the only warm colour down here.
    const vent = new THREE.ConeGeometry(0.42, 1.5, 5, 1);
    vent.translate(0, 0.75, 0);
    this.vents = new THREE.InstancedMesh(
      vent,
      new THREE.MeshBasicMaterial({ color: 0xffb457, fog: true }),
      VENT_COUNT * 3,
    );
    this.vents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.vents.frustumCulled = false;
    scene.add(this.vents);

    // Distant silhouettes: shapes the fog has almost eaten, so the eye reads distance.
    const blob = new THREE.IcosahedronGeometry(1, 0);
    this.silhouettes = new THREE.InstancedMesh(
      blob,
      new THREE.MeshBasicMaterial({ color: 0x0a1f1c, fog: true }),
      SILHOUETTE_COUNT,
    );
    this.silhouettes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.silhouettes.frustumCulled = false;
    scene.add(this.silhouettes);

    // Particulate matter: two thin layers of drifting motes, one Points draw each.
    this.dustNear = this.makeDust(0.55, 0x9fe9d4, 0.55);
    this.dustFar = this.makeDust(1.6, 0x6d948c, 0.3);
    scene.add(this.dustNear, this.dustFar);

    this.fogColor = new THREE.Color();
    this.tmpColor = new THREE.Color();
  }

  makeDust(scale, color, opacity) {
    const positions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i += 1) {
      positions[i * 3] = (hash(i * 3) - 0.5) * 22 * scale;
      positions[i * 3 + 1] = (hash(i * 3 + 1) - 0.5) * 16 * scale;
      positions[i * 3 + 2] = -hash(i * 3 + 2) * 90 * scale;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color, size: 0.055 * scale, transparent: true, opacity, depthWrite: false, fog: true }),
    );
    points.frustumCulled = false;
    return points;
  }

  /**
   * Place the landmarks around the skiff. `depth` drives which ones exist; the skiff position only
   * shifts them, so nothing pops in and out while the player is looking at it.
   */
  update(run, time) {
    const depth = run.depth;
    const radius = run.radius;
    const base = run.skiff.z;

    let n = 0;
    const firstBand = Math.floor((depth - 20) / STRATA_SPACING);
    for (let i = 0; i < STRATA_COUNT; i += 1) {
      const index = firstBand + i;
      const z = -(index * STRATA_SPACING) + ((base + depth) % 1);
      const offset = -depth - z;
      if (offset < -18 || offset > 190) continue;
      const radiusJitter = 0.9 + hash(index * 7) * 0.16;
      this.pos.set(0, 0, z);
      this.euler.set(0, 0, hash(index) * Math.PI);
      this.quat.setFromEuler(this.euler);
      this.scale.set(radius * radiusJitter, radius * radiusJitter * 0.8, 1);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.strata.setMatrixAt(n, this.matrix);
      n += 1;
    }
    this.strata.count = n;
    this.strata.instanceMatrix.needsUpdate = true;
    this.strata.material.opacity = run.reveal > 0 ? 0.62 : 0.38;

    let a = 0;
    const firstArch = Math.floor((depth - 40) / ARCH_SPACING);
    for (let i = 0; i < ARCH_COUNT; i += 1) {
      const index = firstArch + i;
      if (index < 0) continue;
      const z = -index * ARCH_SPACING;
      const offset = -depth - z;
      if (offset < -30 || offset > 200) continue;
      const r = radius * (0.86 + hash(index * 11) * 0.08);
      this.pos.set(0, 0, z);
      this.euler.set(0, 0, hash(index * 3) * 0.6);
      this.quat.setFromEuler(this.euler);
      this.scale.set(r, r * 0.82, 1);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.arches.setMatrixAt(a, this.matrix);
      a += 1;
    }
    this.arches.count = a;
    this.arches.instanceMatrix.needsUpdate = true;

    let v = 0;
    const firstVent = Math.floor((depth - 20) / VENT_SPACING);
    for (let i = 0; i < VENT_COUNT; i += 1) {
      const index = firstVent + i;
      if (index < 0) continue;
      const zd = index * VENT_SPACING + hash(index * 5) * 20;
      const z = -zd;
      const offset = -depth - z;
      if (offset < -12 || offset > 150) continue;
      const angle = hash(index * 13) * Math.PI * 2;
      const radiusHere = run.radius * (0.62 + hash(index * 17) * 0.22);
      for (let k = 0; k < 3; k += 1) {
        const sway = (hash(index * 19 + k) - 0.5) * 0.7;
        this.pos.set(
          Math.cos(angle + sway * 0.2) * radiusHere,
          Math.sin(angle + sway * 0.2) * radiusHere * 0.8 - 1.4,
          z + sway,
        );
        this.euler.set(0.1 * sway, angle, 0.12 * sway);
        this.quat.setFromEuler(this.euler);
        const s = 0.7 + hash(index * 23 + k) * 0.9;
        this.scale.set(s, s * (1 + Math.sin(time * 0.8 + index + k) * 0.04), s);
        this.matrix.compose(this.pos, this.quat, this.scale);
        this.vents.setMatrixAt(v, this.matrix);
        v += 1;
      }
    }
    this.vents.count = v;
    this.vents.instanceMatrix.needsUpdate = true;

    let s = 0;
    for (let i = 0; i < SILHOUETTE_COUNT; i += 1) {
      const index = Math.floor(depth / 90) + i;
      const zd = index * 90 + 60 + hash(index * 29) * 20;
      const z = -zd;
      const offset = -depth - z;
      if (offset < -60 || offset > 120) continue;
      const angle = hash(index * 31) * Math.PI * 2;
      const r = run.radius * (0.5 + hash(index * 37) * 0.35);
      this.pos.set(Math.cos(angle) * r, Math.sin(angle) * r * 0.7, z);
      this.quat.identity();
      const scale = 2.4 + hash(index * 41) * 3.4;
      this.scale.set(scale, scale * 1.6, scale);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.silhouettes.setMatrixAt(s, this.matrix);
      s += 1;
    }
    this.silhouettes.count = s;
    this.silhouettes.instanceMatrix.needsUpdate = true;

    // Dust: the two layers follow the lens, and each drifts on its own slow clock.
    this.dustNear.position.set(run.skiff.x, run.skiff.y, run.skiff.z);
    this.dustNear.rotation.z = time * 0.03;
    this.dustNear.position.y += Math.sin(time * 0.4) * 0.2;
    this.dustFar.position.set(run.skiff.x * 0.5, run.skiff.y * 0.5, run.skiff.z);
    this.dustFar.rotation.z = -time * 0.015;
  }

  /** Depth palette: the water cools and darkens as the skiff goes down. */
  applyDepthPalette(fog, background, depth) {
    const t = Math.min(1, Math.max(0, depth / 1350));
    this.tmpColor.setRGB(0.024 + (1 - t) * 0.01, 0.106 + (1 - t) * 0.03, 0.102 + t * 0.02);
    fog.color.copy(this.tmpColor);
    background.copy(this.tmpColor).multiplyScalar(0.55);
  }
}