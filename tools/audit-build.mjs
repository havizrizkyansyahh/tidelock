// The build audit: everything the entry can prove locally, proved from the files it actually
// writes. It runs main.ts twice into two clean directories, compares a full path→SHA256 manifest
// of both, rebuilds the dossier independently with the official helper, and checks the gate's
// numeric caps itself. It writes tests/build-audit.json and exits non-zero if anything fails.
//
//   node tools/audit-build.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, htmlFacts, sourceImports, resolveGamePath, importOrder, isRelativeSpecifier, isRelativeRef } from '../vendor/makefun-game.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CAPS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
  game_path_max_bytes: 1_000,
};
const KIT_HELPER_SHA = 'dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const walk = (dir, base = dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out.sort();
};
const manifestOf = (dir) =>
  Object.fromEntries(walk(dir).map((path) => [path, sha256(readFileSync(join(dir, path)))]));

/** Width and height from a JPEG SOF or a PNG IHDR, so image caps are checked, not assumed. */
function imageSize(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20), kind: 'png' };
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc2) return { w: bytes.readUInt16BE(i + 7), h: bytes.readUInt16BE(i + 5), kind: 'jpeg' };
    if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return null;
}

const results = { checks: [], failures: [] };
function check(name, ok, detail) {
  results.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) results.failures.push(`${name}: ${detail}`);
  return ok;
}

// 1. Two clean runs of the entrypoint.
const runA = join(ROOT, 'out-audit-a');
const runB = join(ROOT, 'out-audit-b');
for (const dir of [runA, runB]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execFileSync(process.execPath, [join(ROOT, 'main.ts')], { env: { ...process.env, MAKEFUN_OUTPUT_DIR: dir }, stdio: 'pipe' });
}
const manifestA = manifestOf(runA);
const manifestB = manifestOf(runB);
const samePaths = JSON.stringify(Object.keys(manifestA)) === JSON.stringify(Object.keys(manifestB));
const differing = samePaths ? Object.keys(manifestA).filter((p) => manifestA[p] !== manifestB[p]) : ['path sets differ'];
check('two runs write identical paths', samePaths, `${Object.keys(manifestA).length} paths in run A`);
check('two runs write identical bytes', differing.length === 0, differing.length ? differing.slice(0, 5).join(', ') : 'every file matches by sha256');

// 2. The dossier must be exactly what the official helper writes from the output itself.
const dossierBytes = readFileSync(join(runA, 'dossier.json'));
const rebuilt = buildDossier(runA, CAPS);
check('dossier.json matches an independent helper rebuild', sha256(dossierBytes) === sha256(rebuilt), `${dossierBytes.length} bytes, sha256 ${sha256(dossierBytes)}`);

// 2b. A second rebuild from the *other* run proves the dossier is a function of the files alone.
const rebuiltB = buildDossier(runB, CAPS);
check('both runs rebuild to the same dossier', sha256(rebuilt) === sha256(rebuiltB), sha256(rebuiltB));

// 3. Caps over game/.
const gameDir = join(runA, 'game');
const gameEntries = [];
(function walkEntries(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    gameEntries.push({ path: relative(gameDir, full), dir: entry.isDirectory(), size: entry.isFile() ? statSync(full).size : 0 });
    if (entry.isDirectory()) walkEntries(full);
  }
})(gameDir);
const gameFiles = gameEntries.filter((e) => !e.dir);
const gameBytes = gameFiles.reduce((sum, f) => sum + f.size, 0);
const longestPath = Math.max(...gameEntries.map((e) => Buffer.byteLength(e.path, 'utf8')));
check('game/ entry count within 993', gameEntries.length <= CAPS.game_max_files, `${gameEntries.length} files and directories`);
check('game/ bytes within 48 MiB', gameBytes <= CAPS.game_max_bytes, `${gameBytes} bytes`);
check('every game/ path within 1000 UTF-8 bytes', longestPath <= CAPS.game_path_max_bytes, `longest ${longestPath} bytes`);
check('index.html is a regular file within 1 MiB', statSync(join(gameDir, 'index.html')).size <= 1_048_576, `${statSync(join(gameDir, 'index.html')).size} bytes`);

// 4. Screenshots: count, bytes, and real pixel dimensions.
const shotsDir = join(runA, 'screenshots');
const shots = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort();
const shotFacts = shots.map((name) => {
  const bytes = readFileSync(join(shotsDir, name));
  const size = imageSize(bytes);
  return { name, bytes: bytes.length, ...size };
});
check('three or four screenshots', shots.length >= 3 && shots.length <= 4, `${shots.length} files: ${shots.join(', ')}`);
check(
  'every screenshot within 256 KiB',
  shotFacts.every((s) => s.bytes <= CAPS.screenshots.max_bytes),
  shotFacts.map((s) => `${s.name} ${s.bytes}`).join(' · '),
);
check(
  'every screenshot long side <= 1280 and short side >= 480',
  shotFacts.every((s) => Math.max(s.w, s.h) <= 1280 && Math.min(s.w, s.h) >= 480),
  shotFacts.map((s) => `${s.name} ${s.w}x${s.h}`).join(' · '),
);
check('screenshot names are URL-safe', shotFacts.every((s) => /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(s.name)), shots.join(', '));

// 5. References: every script, link and import inside game/, nothing over a network.
const html = readFileSync(join(gameDir, 'index.html'), 'utf8');
const facts = htmlFacts(html);
const sourcePaths = gameFiles.map((f) => f.path).filter((p) => /\.(js|mjs)$/i.test(p));
const sources = sourcePaths.map((path) => ({ path, text: readFileSync(join(gameDir, path), 'utf8') }));
const order = importOrder(sources, facts);
const badRefs = [];
for (const script of facts.scripts) {
  if (script.src && !script.src.startsWith('data:')) {
    const resolved = resolveGamePath(script.src, 'index.html');
    if (resolved === null || !existsSync(join(gameDir, resolved))) badRefs.push(`script ${script.src}`);
  }
}
for (const link of facts.links) {
  if (link.href && !link.href.startsWith('data:')) {
    const resolved = resolveGamePath(link.href, 'index.html');
    if (resolved === null) badRefs.push(`link ${link.href}`);
  }
}
for (const source of sources) {
  for (const specifier of sourceImports(source.text)) {
    if (specifier.startsWith('node:')) continue;
    if (isRelativeSpecifier(specifier)) {
      const resolved = resolveGamePath(specifier, source.path) ?? resolve(specifier, source.path);
      if (resolved === null || !existsSync(join(gameDir, resolved))) badRefs.push(`${source.path} → ${specifier}`);
    } else if (!/^data:/.test(specifier)) {
      badRefs.push(`${source.path} → bare ${specifier}`);
    }
  }
  // A bare URL string is only a defect in our own code: the vendored three.js build carries
  // licence and documentation URLs in its comments, and the gate parses references, not comments.
  const vendored = source.path.startsWith('vendor/') || /\.min\.(js|mjs)$/i.test(source.path);
  if (!vendored && /https?:\/\//i.test(source.text)) badRefs.push(`${source.path} contains an http(s) address`);
}
check(
  'every reference resolves inside game/',
  badRefs.length === 0,
  badRefs.length ? badRefs.slice(0, 6).join('; ') : `${facts.scripts.length} script tag(s), ${sourcePaths.length} modules scanned, ${order.length} in the import walk`,
);
check('no network address in index.html', !/https?:\/\//i.test(html), 'no http(s) substring in the page');

// 6. Every source module parses as an ES module (the js_parses row).
const parseFailures = [];
for (const path of sourcePaths) {
  const tmp = join(ROOT, 'out-audit-a', `.parse-${path.replace(/[\\/]/g, '_')}.mjs`);
  writeFileSync(tmp, readFileSync(join(gameDir, path)));
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } catch (err) {
    parseFailures.push(`${path}: ${String(err.stderr ?? err).split('\n')[0]}`);
  } finally {
    rmSync(tmp, { force: true });
  }
}
check('every source module parses as ESM', parseFailures.length === 0, parseFailures.length ? parseFailures.join('; ') : `${sourcePaths.length} modules checked with node --check`);

// 7. The vendored helper is the kit's copy, byte for byte.
const helperSha = sha256(readFileSync(join(ROOT, 'vendor/makefun-game.ts')));
check('vendor/makefun-game.ts is the kit copy', helperSha === KIT_HELPER_SHA, helperSha);

// 8. Nothing private ships: no home paths, keys, tokens or secrets in the text the entry hands in.
const privateFindings = [];
const privatePatterns = [
  [/\/home\/[a-z_]+/i, 'home directory path'],
  [/\b(sk-[A-Za-z0-9]{16,}|af_[A-Za-z0-9]{16,})\b/, 'api key shape'],
  [/(PRIVATE KEY|BEGIN OPENSSH)/, 'private key'],
  [/\b[A-Za-z0-9_-]{86,90}\b/, 'possible solana keypair string'],
];
// The dossier is checked as parsed text, not as raw bytes: its image fields are base64 JPEG data,
// which any long-token heuristic would flag.
const textFiles = [...gameFiles.map((f) => join('game', f.path)), 'dossier.json'];
for (const rel of textFiles) {
  if (!/\.(js|mjs|html|css|json|md|txt)$/i.test(rel)) continue;
  const text = rel === 'dossier.json' ? JSON.parse(readFileSync(join(runA, rel), 'utf8')).text : readFileSync(join(runA, rel), 'utf8');
  for (const [pattern, label] of privatePatterns) if (pattern.test(text)) privateFindings.push(`${rel}: ${label}`);
}
check('no secrets or private paths in the shipped text', privateFindings.length === 0, privateFindings.join('; ') || `${textFiles.length} shipped files scanned`);

// 9. The dossier's own text must not be cut by the 160 KiB cap.
const dossierText = JSON.parse(dossierBytes.toString('utf8')).text;
check('no source was cut from the dossier', !dossierText.includes('Cut at 163840 bytes'), `${Buffer.byteLength(dossierText, 'utf8')} bytes of dossier text`);

results.summary = {
  node: process.version,
  outputs: { a: manifestA['dossier.json'], paths: Object.keys(manifestA).length },
  dossierBytes: dossierBytes.length,
  game: { entries: gameEntries.length, files: gameFiles.length, bytes: gameBytes },
  screenshots: shotFacts,
  modules: sourcePaths.length,
  passed: results.checks.filter((c) => c.ok).length,
  failed: results.failures.length,
};
results.checks.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(ROOT, 'tests', 'build-audit.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results.summary, null, 2));
if (results.failures.length) {
  console.error('FAILURES:\n' + results.failures.join('\n'));
  process.exitCode = 1;
}