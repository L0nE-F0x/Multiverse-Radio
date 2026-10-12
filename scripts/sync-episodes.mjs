#!/usr/bin/env node
// Checks public/episodes.json against the audio files in public/ and fills in
// durationSeconds from the files themselves (via ffprobe).
//
//   npm run content:sync    update durations in place
//   npm run content:check   report only; exits 1 if anything is missing or stale

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'public', 'episodes.json');
const checkOnly = process.argv.includes('--check');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest.channels)) fail('episodes.json needs a top-level "channels" array.');

let hasFfprobe = true;
try {
  execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
} catch {
  hasFfprobe = false;
  console.warn('ffprobe not found: durations will not be checked. Install ffmpeg to enable this.');
}

const problems = [];
const ids = new Set();
let updated = 0;

for (const channel of manifest.channels) {
  if (!channel.id || !channel.name) problems.push(`Channel without id/name: ${JSON.stringify(channel).slice(0, 60)}…`);
  for (const episode of channel.episodes ?? []) {
    const label = `${channel.id}/${episode.id ?? '?'}`;
    if (!episode.id || !episode.title || !episode.audioUrl) {
      problems.push(`${label}: "id", "title" and "audioUrl" are required.`);
      continue;
    }
    if (ids.has(episode.id)) problems.push(`${label}: duplicate episode id.`);
    ids.add(episode.id);

    if (/^[a-z]+:/i.test(episode.audioUrl)) continue; // remote file, can't check
    const file = join(root, 'public', episode.audioUrl.replace(/^\//, ''));
    if (!existsSync(file)) {
      problems.push(`${label}: missing file public${episode.audioUrl.startsWith('/') ? '' : '/'}${episode.audioUrl}`);
      continue;
    }
    if (!hasFfprobe) continue;

    const seconds = Math.round(probe(file));
    if (episode.durationSeconds !== seconds) {
      if (checkOnly) {
        problems.push(`${label}: durationSeconds is ${episode.durationSeconds ?? 'missing'}, file is ${seconds}s.`);
      } else {
        episode.durationSeconds = seconds;
        updated++;
      }
    }
  }
}

if (!checkOnly && updated > 0) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated ${updated} duration${updated === 1 ? '' : 's'} in public/episodes.json.`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
const total = manifest.channels.reduce((sum, c) => sum + (c.episodes?.length ?? 0), 0);
console.log(`✓ ${manifest.channels.length} channels, ${total} episodes, all files present.`);

function probe(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  return Number.parseFloat(out.trim());
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
