#!/usr/bin/env node
// Runs scripts/voice/render.py with a suitable Python, so `npm run voice:check` and
// `npm run voice:render -- --station void-beats` work without remembering venv paths.
//
// Python is chosen from: $VOICE_PYTHON, the local Kokoro venv (~/.local/share/bb-tts/venv),
// then python3 / python on PATH. `--check` only needs Python >= 3.11 (standard library).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.VOICE_PYTHON,
  join(homedir(), '.local/share/bb-tts/venv/bin/python'),
  'python3',
  'python',
].filter(Boolean);

function usable(python) {
  if (python.includes('/') && !existsSync(python)) return false;
  const probe = spawnSync(python, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)']);
  return probe.status === 0;
}

const python = candidates.find(usable);
if (!python) {
  console.error('voice: no Python >= 3.11 found. Set VOICE_PYTHON to an interpreter (rendering also needs numpy, soundfile, kokoro-onnx).');
  process.exit(1);
}
const result = spawnSync(python, [join(here, 'render.py'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
