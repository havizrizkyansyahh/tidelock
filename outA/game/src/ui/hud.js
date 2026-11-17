import { SONAR_MAX, SONAR_RECHARGE, milestoneAt } from '../core/rules.js';

// The HUD writer: every number the player reads comes from the run, and nothing else touches the
// DOM. Kept separate from the view so a HUD change can never move the simulation.
const HULL_SEGMENTS = 10;
const SONAR_PIPS = 3;

export class Hud {
  constructor(document) {
    this.el = {
      hud: document.getElementById('hud'),
      depth: document.getElementById('depth'),
      air: document.getElementById('air'),
      airNum: document.getElementById('air-num'),
      airFill: document.querySelector('#air > i'),
      score: document.getElementById('score'),
      best: document.getElementById('best'),
      hull: document.getElementById('hull-segs'),
      pips: document.getElementById('pips'),
      spores: document.getElementById('spore-count'),
      combo: document.getElementById('combo'),
      beaconLine: document.getElementById('beacon-line'),
      prompt: document.getElementById('prompt'),
      threat: document.getElementById('threat'),
      flash: document.getElementById('flash'),
      bloom: document.getElementById('bloom'),
      toast: document.getElementById('toast'),
      crosshair: document.getElementById('crosshair'),
      sonarCd: document.querySelector('#sonar-cd > i'),
    };
    this.el.hull.innerHTML = '<i></i>'.repeat(HULL_SEGMENTS);
    this.el.pips.innerHTML = '<i></i>'.repeat(SONAR_PIPS);
    this.hullSegs = [...this.el.hull.children];
    this.pips = [...this.el.pips.children];
    this.last = {};
    this.announced = 0;
    this.flashLeft = 0;
    this.bloomLeft = 0;
    this.toastLeft = 0;
  }

  /** Damage: a red wash from the edges, strongest on a rock strike. */
  flash(strength = 1) {
    this.flashLeft = Math.max(this.flashLeft, 0.45 * strength);
  }

  /** Sonar: a single green bloom behind the pulse ring. */
  bloom() {
    this.bloomLeft = Math.max(this.bloomLeft, 0.5);
  }

  /** Depth feedback: one toast per hundred metres, never repeated. */
  milestone(depth) {
    const reached = milestoneAt(depth, this.announced);
    if (reached === null) return null;
    this.announced = reached;
    this.el.toast.textContent = `${reached} m`;
    this.el.toast.classList.add('show');
    this.toastLeft = 1.5;
    return reached;
  }

  /** Fade the feedback layers. Called every frame with the frame's seconds. */
  tick(dt) {
    if (this.flashLeft > 0) {
      this.flashLeft = Math.max(0, this.flashLeft - dt);
      this.el.flash.style.opacity = String((this.flashLeft / 0.45) * 0.85);
    } else if (this.el.flash.style.opacity !== '0') {
      this.el.flash.style.opacity = '0';
    }
    if (this.bloomLeft > 0) {
      this.bloomLeft = Math.max(0, this.bloomLeft - dt);
      this.el.bloom.style.opacity = String((this.bloomLeft / 0.5) * 0.9);
    } else if (this.el.bloom.style.opacity !== '0') {
      this.el.bloom.style.opacity = '0';
    }
    if (this.toastLeft > 0) {
      this.toastLeft = Math.max(0, this.toastLeft - dt);
      if (this.toastLeft === 0) this.el.toast.classList.remove('show');
    }
  }

  show(visible) {
    this.el.hud.hidden = !visible;
  }

  /** A new dive starts with no announcements and no leftover glow. */
  reset() {
    this.announced = 0;
    this.flashLeft = 0;
    this.bloomLeft = 0;
    this.toastLeft = 0;
    this.el.toast.classList.remove('show');
    this.el.flash.style.opacity = '0';
    this.el.bloom.style.opacity = '0';
    this.last = {};
  }

  /** Update the readouts. Called once a frame; cheap because values are compared first. */
  update(run, next) {
    const airWhole = Math.round(run.air);
    if (this.last.air !== airWhole) {
      this.last.air = airWhole;
      this.el.airNum.textContent = String(airWhole);
      this.el.airFill.style.width = `${Math.max(0, Math.min(100, run.air))}%`;
      this.el.air.classList.toggle('low', run.air < 25);
    }
    const depth = Math.floor(run.depth);
    if (this.last.depth !== depth) {
      this.last.depth = depth;
      this.el.depth.textContent = String(depth);
    }
    const score = run.score.total;
    if (this.last.score !== score) {
      this.last.score = score;
      this.el.score.textContent = String(score);
    }
    if (this.last.best !== run.best) {
      this.last.best = run.best;
      this.el.best.textContent = `best ${run.best}`;
    }
    if (this.last.spores !== run.sporePoints) {
      this.last.spores = run.sporePoints;
      this.el.spores.textContent = String(run.sporePoints);
    }
    if (this.last.combo !== run.combo) {
      this.last.combo = run.combo;
      this.el.combo.textContent = run.combo > 1 ? `×${run.combo}` : '';
    }
    const filled = Math.ceil((run.hull / 100) * HULL_SEGMENTS);
    if (this.last.hull !== filled) {
      this.last.hull = filled;
      this.hullSegs.forEach((seg, i) => seg.classList.toggle('gone', i >= filled));
    }
    if (this.last.sonar !== run.sonar) {
      this.last.sonar = run.sonar;
      this.pips.forEach((pip, i) => pip.classList.toggle('on', i < run.sonar));
    }
    const charge = run.sonar >= SONAR_MAX ? 1 : run.sonarTimer / SONAR_RECHARGE;
    const chargePct = Math.round(charge * 20) / 20;
    if (this.last.charge !== chargePct) {
      this.last.charge = chargePct;
      this.el.sonarCd.style.width = `${Math.max(0, Math.min(1, chargePct)) * 100}%`;
    }
    const line = next ? `beacon 0${next.number} · ${Math.max(0, Math.round(next.distance))} m` : 'no beacon charted';
    if (this.last.line !== line) {
      this.last.line = line;
      this.el.beaconLine.textContent = line;
    }
    this.el.prompt.classList.toggle('show', run.inBeacon);
    this.el.crosshair.classList.toggle('hot', run.inBeacon);
    const close = run.drifters.some((d) => Math.hypot(d.x - run.skiff.x, d.y - run.skiff.y, d.z - run.skiff.z) < 9);
    if (this.last.close !== close) {
      this.last.close = close;
      this.el.threat.classList.toggle('hot', close);
    }
  }
}