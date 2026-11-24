'use strict';

// Build the Sim.ai image with the workflow_executor arg-mapping fix applied.
//
// Usage:
//   node build.cjs [--commit <sha>] [--tag <name:tag>] [--no-srcmaps] [--keep]
//
// Requirements (host):
//   - git, node, docker (BuildKit)
//   - Docker memory limit >= 12 GB (the build runs `next build` with an 8 GB
//     Node heap, plus the node-gyp isolated-vm rebuild). A 16 GB host with the
//     default ~8 GB Docker cap WILL OOM — raise Docker Desktop / WSL2 memory
//     limit first, or run on a larger runner/CI.
//
// The script does NOT touch the running instance; it only builds a new image.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO_URL = 'https://github.com/simstudioai/sim';
const PINNED_COMMIT = 'f8a561d20a487ad69a39d92126e3d1c61f2ddab7';
const DEFAULT_TAG = 'simai-simstudio-argmap-fix:1';

function parseArgs(argv) {
  const opts = { commit: PINNED_COMMIT, tag: DEFAULT_TAG, noSrcmaps: false, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') opts.commit = argv[++i];
    else if (a === '--tag') opts.tag = argv[++i];
    else if (a === '--no-srcmaps') opts.noSrcmaps = true;
    else if (a === '--keep') opts.keep = true;
    else throw new Error('Unknown arg: ' + a);
  }
  return opts;
}

function run(cmd, args, opts = {}) {
  console.log('$ ' + [cmd, ...args].map(s => (/\s/.test(s) ? JSON.stringify(s) : s)).join(' '));
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function read(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}
function write(dir, rel, txt) {
  fs.writeFileSync(path.join(dir, rel), txt);
}
function replaceOnce(text, anchor, replacement, label) {
  const count = text.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Anchor "${label}" appeared ${count} times (expected 1)`);
  return text.replace(anchor, () => replacement);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const applyScript = path.resolve(__dirname, 'apply.cjs');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-argmap-build-'));
  const repoDir = path.join(work, 'sim');
  console.log(`Work dir: ${work}`);

  // 1) Clone the public Sim.ai repo at the exact pinned commit (partial clone).
  run('git', ['clone', '--filter=blob:none', '--no-checkout', REPO_URL, repoDir]);
  run('git', ['-C', repoDir, 'checkout', opts.commit]);
  const head = execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== opts.commit) throw new Error(`Checkout mismatch: ${head} !== ${opts.commit}`);

  // 2) Apply the arg-mapping fix (providers/utils.ts).
  run('node', [applyScript, path.join(repoDir, 'apps', 'sim')]);

  // 3) Optional: disable production browser source maps to cut build memory.
  if (opts.noSrcmaps) {
    const cfgPath = path.join(repoDir, 'apps', 'sim', 'next.config.ts');
    const cfg = replaceOnce(
      read(repoDir, path.join('apps', 'sim', 'next.config.ts')),
      '  productionBrowserSourceMaps: true,',
      '  productionBrowserSourceMaps: false,',
      'productionBrowserSourceMaps',
    );
    write(repoDir, path.join('apps', 'sim', 'next.config.ts'), cfg);
    console.log('Disabled productionBrowserSourceMaps (memory optimization)');
  }

  // 3b) Curb Turbopack's `next build` peak memory. Next 16.4.x has a known OOM
  //    regression (vercel/next.js#100064): the Turbopack build spawns one
  //    webpack-loader process pool per loader chain x context, so a big app can
  //    reach hundreds of Node processes and >20 GB RSS. `--parallelism 2`
  //    (equivalently TURBO_TASKS_AVAILABLE_PARALLELISM=2) caps every loader pool
  //    at 2 processes; RAYON_NUM_THREADS=2 bounds Turbopack's native Rust thread
  //    pool; and the V8 heap is lowered 8192 -> 6144. This is what lets a 16 GB
  //    runner finish instead of being OOM-killed mid "optimizing generated CSS".
  const pkgRel = path.join('apps', 'sim', 'package.json');
  const pkgAnchor = "NODE_OPTIONS='--max-old-space-size=8192' next build";
  const pkgReplacement =
    "NODE_OPTIONS='--max-old-space-size=6144' TURBO_TASKS_AVAILABLE_PARALLELISM=2 RAYON_NUM_THREADS=2 next build";
  const pkgText = replaceOnce(read(repoDir, pkgRel), pkgAnchor, pkgReplacement, 'next build memory flags');
  write(repoDir, pkgRel, pkgText);
  console.log('Applied Turbopack memory limits (parallelism=2, rayon=2, heap=6144)');

  // 4) Build the image. DOCKER_BUILD=1 (handled inside app.Dockerfile) skips the
  //    type check and emits the standalone output.
  run('docker', ['build', '-f', path.join(repoDir, 'docker', 'app.Dockerfile'), '-t', opts.tag, repoDir]);

  console.log(`\nBUILT: ${opts.tag}`);
  if (!opts.keep) {
    fs.rmSync(repoDir, { recursive: true, force: true });
    console.log(`Cleaned clone. Re-run with --keep to retain it (${repoDir}).`);
  } else {
    console.log(`Kept patched source at: ${repoDir}`);
  }
}

main();