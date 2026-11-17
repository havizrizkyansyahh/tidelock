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
    this.shake = 0;
    this.roll = 0;
    this.fov = 74;
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

  /** A knock from a rock or a bite: quick, decaying, never enough to hide the trench. */
  knock(amount = 0.35) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  /**
   * Put the lens in the skiff's seat: a slow swim bob, a sway that follows the side thrusters, a
   * slight widening of the view with speed, and whatever shake is still ringing.
   */
  placeCamera(skiff, time = 0, speed = 0, strafe = 0, dt = 0) {
    const alive = Math.min(1, speed / 13);
    this.roll += ((-strafe * 0.07) - this.roll) * Math.min(1, dt * 8);
    const bobY = Math.sin(time * 1.9) * 0.035 + Math.sin(time * 7.4) * 0.012 * alive;
    const bobX = Math.cos(time * 1.3) * 0.026;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const jolt = this.shake * this.shake;
    const shakeX = Math.sin(time * 61) * 0.09 * jolt;
    const shakeY = Math.cos(time * 47) * 0.07 * jolt;
    this.camera.position.set(skiff.x + bobX + shakeX, skiff.y + bobY + shakeY, skiff.z);
    this.camera.rotation.set(skiff.pitch + Math.sin(time * 2.3) * 0.004, skiff.yaw, this.roll + Math.sin(time * 39) * 0.012 * jolt);
    const wantedFov = 72 + alive * 6;
    if (Math.abs(wantedFov - this.fov) > 0.05) {
      this.fov += (wantedFov - this.fov) * Math.min(1, dt * 3);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  info() {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }
}