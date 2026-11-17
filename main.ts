// TIDELOCK's entrypoint (Node 22+, standard library only).
//
// The game is plain static files in game/; this program hands the entry in: it copies game/ and
// screenshots/ beside it into the output directory and writes dossier.json — the cover sheet and
// source text the judge reads — with the official make.fun library in vendor/makefun-game.ts,
// unmodified. It writes the same bytes on every run: nothing here reads the clock, the network or
// anything outside this repository except the caps below.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Inside the grader, MAKEFUN_OUTPUT_DIR is unset and the output directory is /output.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The scorer's caps, as the entry's own limits: game/ files, bytes and path length; screenshots. */
const CAPS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
  game_path_max_bytes: 1_000,
} as const;

const gameSrc = join(here, 'game');
const shotsSrc = join(here, 'screenshots');
if (!existsSync(join(gameSrc, 'index.html'))) {
  throw new Error('main.ts: game/index.html is missing — the entry has no game to hand in');
}
if (!existsSync(shotsSrc)) {
  throw new Error('main.ts: screenshots/ is missing — the entry needs 3 or 4 real renders');
}

mkdirSync(out, { recursive: true });
// Start clean so a local re-run and the grader's fresh directory write the same tree.
for (const name of ['game', 'screenshots']) {
  rmSync(join(out, name), { recursive: true, force: true });
  cpSync(join(here, name), join(out, name), { recursive: true });
}

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

const shots = readdirSync(join(out, 'screenshots')).filter((name) => !name.startsWith('.')).length;
console.log(`game/ → ${join(out, 'game')}`);
console.log(`screenshots/ → ${join(out, 'screenshots')} (${shots} files)`);
console.log(`dossier.json: ${dossier.length} bytes`);