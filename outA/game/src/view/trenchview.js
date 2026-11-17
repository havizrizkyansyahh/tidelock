// The trench itself: a shell of dark water that follows the skiff, and the rock columns that grow
// out of its walls. Rock is one InstancedMesh rebuilt from the simulation's own list each frame,
// so what you dodge is exactly what is drawn.
import * as THREE from '../../vendor/three/three.module.min.js';

const MAX_ROCKS = 96;

export class TrenchView {
  constructor(scene) {
    this.scene = scene;

    // The wall: an open cylinder seen from the inside, moved and resized with the skiff.
    const shellGeo = new THREE.CylinderGeometry(1, 1, 260, 26, 1, true);
    shellGeo.rotateX(Math.PI / 2); // axis along z, so it wraps the trench
    this.shell = new THREE.Mesh(
      shellGeo,
      new THREE.MeshBasicMaterial({ color: 0x0a201c, side: THREE.BackSide, fog: true }),
    );
    this.shell.frustumCulled = false;
    scene.add(this.shell);

    // A dim ring of silt at the wall foot, to give the tube a floor line.
    const siltGeo = new THREE.CylinderGeometry(1, 1, 260, 26, 1, true);
    siltGeo.rotateX(Math.PI / 2);
    this.silt = new THREE.Mesh(siltGeo, new THREE.MeshBasicMaterial({ color: 0x0d2b24, side: THREE.BackSide, fog: true }));
    this.silt.scale.set(0.92, 0.92, 1);
    this.silt.frustumCulled = false;
    scene.add(this.silt);

    // Rock columns: a tapered column, lit by baked vertex colours, one instance per rock.
    const rockGeo = new THREE.CylinderGeometry(0.42, 0.86, 1, 7, 1, false);
    rockGeo.translate(0, 0.5, 0);
    rockGeo.deleteAttribute('uv');
    const colors = [];
    const pos = rockGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const along = 1 - pos.getY(i); // 0 at the wall, 1 at the tip
      const shade = 0.30 + 0.42 * along;
      colors.push(0.20 * shade, 0.34 * shade, 0.29 * shade);
    }
    rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    this.rockMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    this.rocks = new THREE.InstancedMesh(rockGeo, this.rockMat, MAX_ROCKS);
    this.rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rocks.frustumCulled = false;
    this.rocks.count = 0;
    scene.add(this.rocks);

    this.matrix = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.dir = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.scale = new THREE.Vector3();
  }

  /** Draw the water the skiff is in: radius from the run, rock from the run's loaded columns. */
  update(run, reveal) {
    const radius = run.radius;
    this.shell.position.set(0, 0, run.skiff.z - 110);
    this.shell.scale.set(radius, radius, 1);
    this.silt.position.set(0, 0, run.skiff.z - 110);
    this.silt.scale.set(radius * 0.98, radius * 0.7, 1);

    const rockTint = reveal > 0 ? 0.55 : 0.34;
    this.rockMat.color.setRGB(rockTint, rockTint * 1.5, rockTint * 1.25);

    let n = 0;
    for (const rock of run.rocks) {
      if (n >= MAX_ROCKS) break;
      if (rock.z > run.skiff.z + 6) continue; // behind the lens
      if (rock.z < run.skiff.z - 130) continue; // lost in the fog
      const angle = rock.angle ?? Math.atan2(rock.y, rock.x);
      this.dir.set(Math.cos(angle), Math.sin(angle) * 0.8, 0).normalize();
      const reach = Math.min(run.radius, Math.hypot(rock.x, rock.y / 0.8) + rock.length * 0.5);
      this.pos.set(this.dir.x * reach, this.dir.y * reach, rock.z);
      this.quat.setFromUnitVectors(this.up, this.dir.clone().multiplyScalar(-1));
      this.scale.set(rock.girth, rock.length, rock.girth);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.rocks.setMatrixAt(n, this.matrix);
      n += 1;
    }
    this.rocks.count = n;
    this.rocks.instanceMatrix.needsUpdate = true;
  }
}