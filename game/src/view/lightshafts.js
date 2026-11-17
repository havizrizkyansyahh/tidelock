// Light shafts: the only light down here is what the surface never quite loses. Six thin cones of
// additive haze drift past the lens, placed procedurally and recycled ahead of the skiff, so the
// water reads as deep rather than empty.
import * as THREE from '../../vendor/three/three.module.min.js';

const COUNT = 6;
const SPAN = 70;

export class LightShafts {
  constructor(scene) {
    const geometry = new THREE.ConeGeometry(2.2, 26, 7, 1, true);
    geometry.translate(0, -13, 0);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x6fd6e8,
      transparent: true,
      opacity: 0.045,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.shafts = [];
    for (let i = 0; i < COUNT; i += 1) {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.shafts.push({ mesh, seed: i * 2.399963, offset: (i / COUNT) * SPAN });
    }
  }

  /** Follow the skiff: each shaft slides down the trench and wraps around when it passes. */
  update(run, time) {
    const depth = -run.skiff.z;
    for (const shaft of this.shafts) {
      const travel = (depth + shaft.offset + time * 0.6) % SPAN;
      const x = Math.sin(shaft.seed * 3.1) * run.radius * 0.55;
      const y = Math.cos(shaft.seed * 2.7) * run.radius * 0.4;
      shaft.mesh.position.set(x, y + 9, run.skiff.z - travel);
      shaft.mesh.rotation.z = Math.sin(time * 0.15 + shaft.seed) * 0.09;
      shaft.mesh.rotation.x = 0.06 + Math.cos(time * 0.11 + shaft.seed) * 0.04;
      shaft.mesh.scale.setScalar(0.75 + 0.35 * Math.sin(shaft.seed));
    }
  }
}