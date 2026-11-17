// The renderer, the camera and the water between them. Deliberately unlit: every surface carries
// its own baked colour, so the whole scene is a handful of draws and stays fast on weak hardware.
import * as THREE from '../../vendor/three/three.module.min.js';

export const WATER = 0x03120f;
const FOG_BASE = 0.052;

export class Render {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.setClearColor(WATER, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(WATER);
    this.scene.fog = new THREE.FogExp2(0x061b1a, FOG_BASE);

    this.camera = new THREE.PerspectiveCamera(74, 1, 0.1, 140);
    this.camera.rotation.order = 'YXZ';

    this.reveal = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Sonar light: push the fog out and lift the palette while a pulse is live. */
  setReveal(reveal) {
    this.reveal = reveal > 0 ? Math.min(1, reveal / 4) : 0;
    this.scene.fog.density = FOG_BASE * (1 - 0.55 * this.reveal);
    this.scene.fog.color.setHex(this.reveal > 0 ? 0x0b2b28 : 0x061b1a);
    this.scene.background.setHex(this.reveal > 0 ? 0x07231f : WATER);
  }

  placeCamera(skiff) {
    this.camera.position.set(skiff.x, skiff.y, skiff.z);
    this.camera.rotation.set(skiff.pitch, skiff.yaw, 0);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  info() {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }
}