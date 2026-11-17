// Boot and the frame loop. This file owns the glue — canvas, input, audio, screens — and calls the
// simulation; it never changes a rule, so the game you play is the game the tests check.
import { Render } from './view/render.js';
import { TrenchView } from './view/trenchview.js';
import { EntitiesView } from './view/entitiesview.js';
import { LightShafts } from './view/lightshafts.js';
import { Landmarks } from './view/landmarks.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { Sound } from './audio/audio.js';
import { Input } from './input.js';
import { createRun, start, step, pause, resume, restart, surface, fireSonar, nextBeacon, autopilotInput } from './core/run.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('view');
const render = new Render(canvas);
const trench = new TrenchView(render.scene);
const entities = new EntitiesView(render.scene);
const shafts = new LightShafts(render.scene);
const landmarks = new Landmarks(render.scene);
const hud = new Hud(document);
const screens = new Screens(document);
const sound = new Sound();
const input = new Input(canvas);

// The title, pause and result cards tell the player to click; route those clicks through the same
// action queue the keyboard uses, so a pointer gesture starts and resumes the dive too.
for (const id of ['start-cta', 'resume-cta', 'restart-cta']) {
  const card = document.getElementById(id);
  if (card) card.addEventListener('click', () => input.press('start'));
}

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const shotMode = shot !== null;

const randomSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

/** A staged screenshot run, or a fresh dive waiting behind the title card. */
let run;
if (shotMode) {
  run = stageShot(shot);
} else {
  run = createRun({ seed: randomSeed(), best: 0 });
  start(run);
  // Populate the view behind the title, then hold it still until the player dives.
  for (let i = 0; i < 150; i += 1) step(run, autopilotInput(run), 1 / 60);
  run.events.length = 0;
  pause(run);
}

let mutedNote = 0;
let lastStrafe = 0;
/** Which overlay the player is looking at: separate from the simulation's own state. */
let ui = 'title';
const crosshair = document.getElementById('crosshair');

function presentScreens() {
  if (shotMode) {
    screens.hideAll();
    hud.show(true);
    if (shot === 'title') {
      hud.show(false);
      crosshair.hidden = true;
      screens.title(run.best);
    }
    if (shot === 'result') screens.result(run);
    if (shot === 'paused') screens.pause(run.best);
    return;
  }
  hud.show(false);
  crosshair.hidden = true;
  screens.title(run.best);
}

function beginDive() {
  sound.ensure();
  input.clearActions();
  if (run.state === 'result') restart(run);
  else if (run.state === 'title' || run.state === 'paused') restart(run);
  else start(run);
  ui = 'playing';
  hud.reset();
  screens.hideAll();
  hud.show(true);
  crosshair.hidden = false;
  input.lock();
}

function handleActions() {
  if (input.takeAction('mute')) {
    mutedNote = sound.toggleMute() ? 1 : 0;
  }
  if (ui === 'title') {
    if (input.takeAction('start') || input.takeAction('sonar')) beginDive();
    return;
  }
  if (ui === 'result') {
    if (input.takeAction('start') || input.takeAction('noseUp') || input.takeAction('sonar')) beginDive();
    return;
  }
  if (input.takeAction('pause')) {
    if (run.state === 'playing') {
      pause(run);
      ui = 'paused';
      screens.pause(run.best);
      document.exitPointerLock?.();
    } else if (run.state === 'paused') {
      resume(run);
      ui = 'playing';
      screens.unpause();
      input.lock();
    }
  }
  if (run.state === 'paused' && (input.takeAction('start') || input.takeAction('sonar'))) {
    resume(run);
    ui = 'playing';
    screens.unpause();
    input.lock();
  }
  if (run.state === 'playing') {
    if (input.takeAction('sonar')) {
      if (fireSonar(run)) {
        sound.ping();
        hud.bloom();
      }
    }
    if (input.takeAction('surface')) {
      if (surface(run)) {
        sound.end(true);
        ui = 'result';
        document.exitPointerLock?.();
        screens.result(run);
      }
    }
  }
}

function playEvents() {
  for (const event of run.events) {
    if (event.type === 'spore') sound.pickup(event.combo);
    else if (event.type === 'rock') {
      sound.hit();
      render.knock(0.9);
      hud.flash(1);
    } else if (event.type === 'bite') {
      sound.bite();
      render.knock(0.45);
      hud.flash(0.6);
    } else if (event.type === 'sonar') {
      hud.bloom();
    }
    else if (event.type === 'beacon') sound.beacon();
    else if (event.type === 'end') {
      sound.end(event.outcome === 'surfaced');
      ui = 'result';
      screens.result(run);
      document.exitPointerLock?.();
    }
  }
  run.events.length = 0;
}

function draw(dt = 0) {
  render.setReveal(run.reveal);
  render.placeCamera(run.skiff, run.time, run.skiff.speed, lastStrafe, dt);
  trench.update(run, run.reveal);
  shafts.update(run, run.time);
  landmarks.update(run, run.time);
  landmarks.applyDepthPalette(render.scene.fog, render.scene.background, run.depth);
  entities.update(run, render.camera, run.time);
  render.render();
  hud.update(run, nextBeacon(run));
  hud.milestone(run.depth);
  hud.tick(dt);
  sound.setThrust(run.state === 'playing' ? run.skiff.speed / 13 : 0);
  sound.setAlarm(run.state === 'playing' && run.air < 25);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  if (!shotMode) {
    handleActions();
    const stick = input.readStick();
    lastStrafe = stick.strafe;
    // The simulation's lookYaw is radians per second; the mouse gives an angle, the keys a rate.
    const lookYaw = stick.lookYaw / Math.max(dt, 1 / 240) + stick.yawRate;
    if (run.state === 'playing') step(run, { ...stick, lookYaw }, dt);
    playEvents();
  }
  draw(dt);
  requestAnimationFrame(frame);
}

presentScreens();
draw();
requestAnimationFrame(frame);

// A hidden tab must not fly the skiff into a wall while nobody is looking: pause on the way out.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && run.state === 'playing' && ui === 'playing' && !shotMode) {
    pause(run);
    ui = 'paused';
    screens.pause(run.best);
    document.exitPointerLock?.();
  }
});

// A small, honest window onto the running game: used by the build's own browser checks.
window.__tidelock = {
  get run() {
    return run;
  },
  info: () => ({
    state: run.state,
    depth: +run.depth.toFixed(2),
    air: +run.air.toFixed(2),
    hull: run.hull,
    score: run.score.total,
    spores: run.sporePoints,
    sonar: run.sonar,
    drifters: run.drifters.length,
    rocks: run.rocks.length,
    loaded: [run.loadedFrom, run.loadedTo],
    draw: render.info(),
    muted: mutedNote,
    pointerLocked: input.pointerLocked,
  }),
  /** Cost of the real scene, measured without the browser's frame scheduling in the way. */
  measure: (frames = 30) => {
    const gl = render.renderer.getContext();
    const started = performance.now();
    for (let i = 0; i < frames; i += 1) {
      render.render();
      gl.finish();
    }
    return { frames, msPerFrame: Number(((performance.now() - started) / frames).toFixed(2)) };
  },
};