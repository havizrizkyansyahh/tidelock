// Everything alive in the trench: spore clusters with their halos, drifters with their eyes, the
// beacon rings, and the sonar shell that briefly turns the dark into a diagram. All pooled, so a
// dive never allocates while it is being played.
import * as THREE from '../../vendor/three/three.module.min.js';
import { SONAR_REVEAL, SONAR_RADIUS } from '../core/rules.js';

const MAX_SPORES = 160;
const MAX_DRIFTERS = 24;
const MAX_BEACONS = 3;

export class EntitiesView {
  constructor(scene) {
    this.scene = scene;
    this.dummy = new THREE.Object3D();

    this.sporeCore = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.2, 0),
      new THREE.MeshBasicMaterial({ color: 0xb6ffe8, fog: true }),
      MAX_SPORES,
    );
    this.sporeCore.frustumCulled = false;
    this.sporeCore.count = 0;

    this.sporeHalo = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.62, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0x36e0b4,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true,
      }),
      MAX_SPORES,
    );
    this.sporeHalo.frustumCulled = false;
    this.sporeHalo.count = 0;

    this.drifterBody = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xc3cfdd, fog: true }),
      MAX_DRIFTERS,
    );
    this.drifterBody.frustumCulled = false;
    this.drifterBody.count = 0;

    this.drifterEye = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.075, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xff5f6d, fog: true }),
      MAX_DRIFTERS * 2,
    );
    this.drifterEye.frustumCulled = false;
    this.drifterEye.count = 0;

    this.beaconRings = [];
    for (let i = 0; i < MAX_BEACONS; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.6, 0.12, 6, 34),
        new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }),
      );
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(2.3, 24),
        new THREE.MeshBasicMaterial({ color: 0x8a6a2f, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }),
      );
      const group = new THREE.Group();
      group.add(ring, glow);
      group.visible = false;
      scene.add(group);
      this.beaconRings.push(group);
    }

    this.sonar = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x9dffe0,
        wireframe: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sonar.visible = false;
    scene.add(this.sonar);

    scene.add(this.sporeCore, this.sporeHalo, this.drifterBody, this.drifterEye);
  }

  update(run, camera, time) {
    const now = time;
    let s = 0;
    for (const spore of run.spores) {
      if (s >= MAX_SPORES) break;
      if (spore.z > run.skiff.z + 4 || spore.z < run.skiff.z - 120) continue;
      const bob = Math.sin(now * 1.6 + (spore.phase ?? 0)) * 0.12;
      this.dummy.position.set(spore.x, spore.y + bob, spore.z);
      this.dummy.rotation.set(0, now * 0.6 + (spore.phase ?? 0), 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.sporeCore.setMatrixAt(s, this.dummy.matrix);
      const haloScale = 1 + Math.sin(now * 2.2 + (spore.phase ?? 0)) * 0.12;
      this.dummy.scale.setScalar(haloScale);
      this.dummy.updateMatrix();
      this.sporeHalo.setMatrixAt(s, this.dummy.matrix);
      s += 1;
    }
    this.sporeCore.count = s;
    this.sporeHalo.count = s;
    this.sporeCore.instanceMatrix.needsUpdate = true;
    this.sporeHalo.instanceMatrix.needsUpdate = true;

    let d = 0;
    let e = 0;
    for (const drifter of run.drifters) {
      if (d >= MAX_DRIFTERS) break;
      if (drifter.z > run.skiff.z + 4 || drifter.z < run.skiff.z - 110) continue;
      const stunned = drifter.stun > 0;
      this.dummy.position.set(drifter.x, drifter.y, drifter.z);
      this.dummy.lookAt(camera.position);
      this.dummy.scale.set(1, 1.45, 1);
      this.dummy.updateMatrix();
      this.drifterBody.setMatrixAt(d, this.dummy.matrix);

      // Two eyes on the side that faces the lamp: the silhouette the player learns to read.
      const toward = new THREE.Vector3().subVectors(camera.position, this.dummy.position).normalize();
      const side = new THREE.Vector3(-toward.z, 0, toward.x).normalize().multiplyScalar(0.19);
      for (const sign of [-1, 1]) {
        this.dummy.position.set(
          drifter.x + toward.x * 0.42 + side.x * sign,
          drifter.y + 0.16 + toward.y * 0.42,
          drifter.z + toward.z * 0.42 + side.z * sign,
        );
        this.dummy.scale.setScalar(stunned ? 0.55 : 1);
        this.dummy.updateMatrix();
        this.drifterEye.setMatrixAt(e, this.dummy.matrix);
        e += 1;
      }
      d += 1;
    }
    this.drifterBody.count = d;
    this.drifterEye.count = e;
    this.drifterBody.instanceMatrix.needsUpdate = true;
    this.drifterEye.instanceMatrix.needsUpdate = true;

    let b = 0;
    for (const beacon of run.beacons) {
      if (b >= MAX_BEACONS) break;
      if (beacon.z > run.skiff.z + 10 || beacon.z < run.skiff.z - 150) continue;
      const group = this.beaconRings[b];
      group.visible = true;
      group.position.set(beacon.x, beacon.y, beacon.z);
      group.rotation.z = now * 0.25;
      group.scale.setScalar(1 + Math.sin(now * 1.4) * 0.02);
      b += 1;
    }
    for (let i = b; i < MAX_BEACONS; i += 1) this.beaconRings[i].visible = false;

    if (run.reveal > 0) {
      const progress = 1 - run.reveal / SONAR_REVEAL;
      const radius = 1 + progress * SONAR_RADIUS;
      this.sonar.visible = true;
      this.sonar.position.set(run.skiff.x, run.skiff.y, run.skiff.z);
      this.sonar.scale.setScalar(radius);
      this.sonar.material.opacity = Math.max(0, 0.55 * (run.reveal / SONAR_REVEAL));
    } else {
      this.sonar.visible = false;
    }
  }
}