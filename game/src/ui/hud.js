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
    };
    this.el.hull.innerHTML = '<i></i>'.repeat(HULL_SEGMENTS);
    this.el.pips.innerHTML = '<i></i>'.repeat(SONAR_PIPS);
    this.hullSegs = [...this.el.hull.children];
    this.pips = [...this.el.pips.children];
    this.last = {};
  }

  show(visible) {
    this.el.hud.hidden = !visible;
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
    const line = next ? `beacon 0${next.number} · ${Math.max(0, Math.round(next.distance))} m` : 'no beacon charted';
    if (this.last.line !== line) {
      this.last.line = line;
      this.el.beaconLine.textContent = line;
    }
    this.el.prompt.classList.toggle('show', run.inBeacon);
    const close = run.drifters.some((d) => Math.hypot(d.x - run.skiff.x, d.y - run.skiff.y, d.z - run.skiff.z) < 9);
    if (this.last.close !== close) {
      this.last.close = close;
      this.el.threat.classList.toggle('hot', close);
    }
  }
}