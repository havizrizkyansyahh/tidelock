// Title, pause and result: the three moments the game stops and talks to the player. One function
// per screen, so the copy and the numbers live together.
export class Screens {
  constructor(document) {
    this.el = {
      title: document.getElementById('screen-title'),
      pause: document.getElementById('screen-pause'),
      result: document.getElementById('screen-result'),
      titleBest: document.getElementById('title-best'),
      pauseBest: document.getElementById('pause-best'),
      outcome: document.getElementById('result-outcome'),
      total: document.getElementById('result-total'),
      depth: document.getElementById('r-depth'),
      spores: document.getElementById('r-spores'),
      beacons: document.getElementById('r-beacons'),
      surface: document.getElementById('r-surface'),
      rTotal: document.getElementById('r-total'),
      note: document.getElementById('result-note'),
      best: document.getElementById('result-best'),
    };
  }

  hideAll() {
    for (const name of ['title', 'pause', 'result']) this.el[name].classList.remove('show');
  }

  title(best) {
    this.hideAll();
    this.el.titleBest.textContent = String(best);
    this.el.title.classList.add('show');
  }

  pause(best) {
    this.el.pauseBest.textContent = String(best);
    this.el.pause.classList.add('show');
  }

  unpause() {
    this.el.pause.classList.remove('show');
  }

  result(run) {
    this.hideAll();
    const { score } = run;
    const surfaced = run.outcome === 'surfaced';
    this.el.outcome.textContent = surfaced ? 'SURFACED' : 'LOST';
    this.el.outcome.classList.toggle('lost', !surfaced);
    this.el.total.textContent = String(score.total);
    this.el.depth.textContent = `${score.depth} m`;
    this.el.spores.textContent = String(score.spores);
    this.el.beacons.textContent = String(score.beacons);
    this.el.surface.textContent = String(score.surface);
    this.el.rTotal.textContent = String(score.total);
    this.el.best.textContent = String(run.best);
    this.el.note.textContent = surfaced
      ? 'You brought the skiff up. The trench keeps the rest.'
      : run.reason === 'air'
        ? 'The tank ran dry in the dark. Depth still counts.'
        : 'The hull gave way. Depth still counts.';
    this.el.result.classList.add('show');
  }
}