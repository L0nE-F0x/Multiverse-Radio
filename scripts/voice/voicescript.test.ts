// Runs the voice renderer's stdlib-only modes (`--check`, `--index`) against small fixture
// scripts and libraries in a temp dir: the v4 fields (arc, days, [[show]] days), The
// Convergence in station files, the stand-alone kits (jam, tomorrow-<MHz>, full-moon) and
// /voice/_index.json. Skipped when no Python >= 3.11 is available (CI has one).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const RENDER = fileURLToPath(new URL('./render.py', import.meta.url));

/** Same choice as run.mjs: $VOICE_PYTHON, the Kokoro venv, then python3 / python. */
function findPython(): string | null {
  const candidates = [process.env.VOICE_PYTHON, join(homedir(), '.local/share/bb-tts/venv/bin/python'), 'python3', 'python'];
  for (const python of candidates) {
    if (!python || (python.includes('/') && !existsSync(python))) continue;
    const probe = spawnSync(python, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)']);
    if (probe.status === 0) return python;
  }
  return null;
}

const PYTHON = findPython();
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(files: Record<string, string | Buffer> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'mvr-voice-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function run(args: string[]) {
  const result = spawnSync(PYTHON!, [RENDER, ...args], { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

interface Issue {
  file: string;
  level: 'error' | 'warning';
  message: string;
}

/** `--check` a set of scripts; returns its exit status and the issues it printed. */
function check(files: Record<string, string>) {
  const { status, output } = run(['--check', '--content', tempDir(files)]);
  const issues: Issue[] = [];
  for (const line of output.split('\n')) {
    const m = /^(?:.*\/)?([^/]+\.toml)(?::\d+)?: (error|warning): (.*)$/.exec(line);
    if (m) issues.push({ file: m[1]!, level: m[2] as Issue['level'], message: m[3]! });
  }
  const errors = issues.filter((i) => i.level === 'error').map((i) => `${i.file}: ${i.message}`);
  const warnings = issues.filter((i) => i.level === 'warning').map((i) => `${i.file}: ${i.message}`);
  return { status, errors, warnings, output };
}

const HOST = '[voices]\nhost = { voice = "af_heart", name = "DJ Test" }\nhush = { voice = "af_heart", fx = "ship", name = "HUSH" }\n';
const LINE = 'lines = [{ say = "host", text = "Something has happened, and we are all very calm about it, thank you." }]';
const HUSH_LINE = 'lines = [{ say = "hush", text = "Minor heading correction. Nothing to see here, operator." }]';
const TOPICS = ['missing-moon', 'the-smell', 'the-song', 'the-knock', 'wrong-colour', 'the-pigeon'];

const clip = (id: string, fields: string, line = LINE) => `\n[[clip]]\nid = "${id}"\n${fields}\n${line}\n`;
const station = (id: string, body: string) => `station = "${id}"\n${HOST}${body}`;
const reactions = (topics = TOPICS) =>
  topics.map((kit) => clip(`react-${kit}`, `category = "event"\nevent = "convergence"\nkit = "${kit}"`)).join('');

describe.skipIf(!PYTHON)('voice:check (v4 fields)', () => {
  it('accepts a complete v4 library without errors or v4 warnings', () => {
    const events = TOPICS.flatMap((kit) => [
      clip(`conv-${kit}-open`, `category = "event"\nevent = "convergence"\nkit = "${kit}"\npart = "open"`),
      clip(`conv-${kit}-close`, `category = "event"\nevent = "convergence"\nkit = "${kit}"\npart = "close"`),
    ]).join('');
    const ship = [1, 2, 3].map((step) => clip(`arc-${step}`, `category = "ship"\narc = { id = "off-course", step = ${step} }`, HUSH_LINE)).join('')
      + clip('jam-01', 'category = "ship"\nkit = "jam"', HUSH_LINE);
    const { status, errors, warnings } = check({
      '_events.toml': station('_events', events),
      '_ship.toml': station('_ship', ship),
      'void-beats.toml': station('void-beats', reactions()
        + clip('review', 'category = "dj"\ndays = [1]')
        + clip('moon', 'category = "dj"\nkit = "full-moon"\ndays = [3, 0]')),
    });
    expect(errors).toEqual([]);
    expect(warnings.filter((w) => /convergence|arc|days|kit/.test(w))).toEqual([]);
    expect(status).toBe(0);
  });

  describe('arc', () => {
    it('must be in _ship', () => {
      const { errors } = check({ 'void-beats.toml': station('void-beats', reactions() + clip('a', 'category = "dj"\narc = { id = "off-course", step = 1 }')) });
      expect(errors).toEqual([expect.stringContaining('arc (HUSH\'s long storylines) is only for _ship.toml')]);
    });

    it('needs { id, step } with a kebab id and a whole step from 1', () => {
      const bad = [
        'arc = { id = "off-course" }',
        'arc = { id = "off-course", step = 1, extra = 2 }',
        'arc = { id = "Off Course", step = 1 }',
        'arc = { id = "off-course", step = 0 }',
        'arc = { id = "off-course", step = 1.5 }',
        'arc = "off-course"',
      ];
      const ship = bad.map((field, i) => clip(`a-${i}`, `category = "ship"\n${field}`, HUSH_LINE)).join('');
      const { errors, status } = check({ '_ship.toml': station('_ship', ship) });
      expect(errors).toHaveLength(bad.length);
      expect(errors.join('\n')).toMatch(/arc must look like/);
      expect(errors.join('\n')).toMatch(/arc id must be kebab-case/);
      expect(errors.join('\n')).toMatch(/arc step must be a whole number from 1/);
      expect(status).toBe(1);
    });

    it('has unique steps that run 1, 2, 3 per arc', () => {
      const ship = [
        clip('a1', 'category = "ship"\narc = { id = "off-course", step = 1 }', HUSH_LINE),
        clip('a1-again', 'category = "ship"\narc = { id = "off-course", step = 1 }', HUSH_LINE),
        clip('a3', 'category = "ship"\narc = { id = "off-course", step = 3 }', HUSH_LINE),
        clip('b1', 'category = "ship"\narc = { id = "other-arc", step = 1 }', HUSH_LINE),
      ].join('');
      const { errors } = check({ '_ship.toml': station('_ship', ship) });
      expect(errors).toEqual([
        expect.stringMatching(/'a1-again': arc 'off-course' step 1 is already clip 'a1'/),
        expect.stringMatching(/arc 'off-course' skips step\(s\) 2/),
      ]);
    });

    it('warns when an arc step is not a ship notice', () => {
      const { errors, warnings } = check({ '_ship.toml': station('_ship', clip('a1', 'category = "dj"\narc = { id = "off-course", step = 1 }', HUSH_LINE)) });
      expect(errors).toEqual([]);
      expect(warnings).toContainEqual(expect.stringContaining('arc steps are HUSH notices'));
    });
  });

  describe('days', () => {
    it.each([['[]'], ['[7]'], ['[-1]'], ['[1, 1]'], ['["mon"]'], ['[1.5]'], ['1']])('rejects days = %s on a clip', (days) => {
      const { errors } = check({ 'void-beats.toml': station('void-beats', reactions() + clip('d', `category = "dj"\ndays = ${days}`)) });
      expect(errors).toEqual([expect.stringContaining('days must be a non-empty list of local weekdays 0-6')]);
    });

    it('rejects bad [[show]] days', () => {
      const show = '[[show]]\nid = "greg"\nname = "Greg"\nblurb = "Quiet."\nstart = 2\nend = 3\ndays = [0, 9]\n';
      const { errors } = check({ 'void-beats.toml': station('void-beats', show + reactions()) });
      expect(errors).toEqual([expect.stringContaining("show 'greg': days must be a non-empty list")]);
    });

    it('lets weekly shows share hours on different days, and catches real overlaps', () => {
      const show = (id: string, start: number, end: number, days?: string) =>
        `[[show]]\nid = "${id}"\nname = "${id}"\nblurb = "A show."\nstart = ${start}\nend = ${end}\n${days ? `days = ${days}\n` : ''}`;
      const fine = check({ 'void-beats.toml': station('void-beats', show('sunday', 2, 3, '[0]') + show('monday', 2, 4, '[1]') + reactions()) });
      expect(fine.errors).toEqual([]);
      // A Saturday 22-02 show runs into Sunday 01:00, where the Sunday show sits.
      const wrap = check({ 'void-beats.toml': station('void-beats', show('late', 22, 2, '[6]') + show('sunday', 1, 3, '[0]') + reactions()) });
      expect(wrap.errors).toEqual([expect.stringMatching(/show 'sunday' overlaps show 'late' .* on Sunday 01:00/)]);
      // A daily show clashes with a weekly one in the same hour.
      const daily = check({ 'void-beats.toml': station('void-beats', show('nightly', 1, 5) + show('sunday', 2, 3, '[0]') + reactions()) });
      expect(daily.errors).toEqual([expect.stringMatching(/show 'sunday' overlaps show 'nightly' .* on Sunday 02:00/)]);
    });
  });

  describe('The Convergence', () => {
    it('accepts reactions in station files and checks their shape', () => {
      const body = reactions(TOPICS.slice(0, 5))
        + clip('bad-kit', 'category = "event"\nevent = "convergence"\nkit = "the-smel"')
        + clip('no-kit', 'category = "event"\nevent = "convergence"')
        + clip('wrong-cat', 'category = "dj"\nevent = "convergence"\nkit = "the-song"')
        + clip('with-part', 'category = "event"\nevent = "convergence"\nkit = "the-song"\npart = "open"')
        + clip('storm', 'category = "event"\nevent = "dimensional-storm"')
        + clip('no-event', 'category = "event"\nkit = "the-song"');
      const { errors, warnings } = check({ 'void-beats.toml': station('void-beats', body) });
      expect(errors).toEqual([
        expect.stringMatching(/'bad-kit': a convergence reaction needs kit = one of .*did you mean 'the-smell'/),
        expect.stringMatching(/'no-kit': a convergence reaction needs kit = one of/),
        expect.stringMatching(/'wrong-cat': a convergence reaction needs category = "event"/),
        expect.stringMatching(/'with-part': a convergence reaction is a single clip; drop `part`/),
        expect.stringMatching(/'storm': station scripts only hold reactions to 'convergence'/),
        expect.stringMatching(/'no-event': event clips in station scripts are convergence reactions/),
      ]);
      expect(warnings).toContainEqual(expect.stringMatching(/no convergence reaction for the-pigeon/));
    });

    it('warns about a station with no reactions at all, but not about pools or drafts', () => {
      const { warnings } = check({
        'void-beats.toml': station('void-beats', clip('dj', 'category = "dj"')),
        '_shared.toml': station('_shared', clip('psa', 'category = "psa"')),
        '_example.toml': station('_example', clip('dj', 'category = "dj"')),
      });
      expect(warnings.filter((w) => w.includes('convergence reaction'))).toEqual([
        expect.stringMatching(/^void-beats\.toml: no convergence reaction for any topic/),
      ]);
    });

    it('needs a topic kit and an open or close in _events', () => {
      const events = clip('ok', 'category = "event"\nevent = "convergence"\nkit = "the-knock"\npart = "open"')
        + clip('body', 'category = "event"\nevent = "convergence"\nkit = "the-knock"\npart = "body"')
        + clip('kitless', 'category = "event"\nevent = "convergence"\npart = "close"');
      const { errors, warnings } = check({ '_events.toml': station('_events', events) });
      expect(errors).toEqual([
        expect.stringMatching(/'body': convergence clips in _events.toml are the shared open or close/),
        expect.stringMatching(/'kitless': convergence clips need kit = one of/),
      ]);
      expect(warnings).toContainEqual(expect.stringMatching(/convergence topics without an open or close: missing-moon \(open and close\).*the-knock \(close\)/));
      // Convergence kits are open + close only: no "kit has no body" warning.
      expect(warnings.filter((w) => w.includes('but no body'))).toEqual([]);
    });

    it('keeps event clips out of the other pools', () => {
      const { errors } = check({ '_ship.toml': station('_ship', clip('c', 'category = "ship"\nevent = "convergence"\nkit = "the-song"', HUSH_LINE)) });
      expect(errors).toEqual([expect.stringContaining('event is only for _events.toml')]);
    });
  });

  describe('stand-alone kits', () => {
    it('allows jam in _ship and full-moon anywhere without a part', () => {
      const { warnings, errors } = check({
        '_ship.toml': station('_ship', clip('jam', 'category = "ship"\nkit = "jam"', HUSH_LINE)),
        'moon-dub.toml': station('moon-dub', reactions() + clip('fm', 'category = "dj"\nkit = "full-moon"')),
        'void-beats.toml': station('void-beats', reactions() + clip('jam', 'category = "dj"\nkit = "jam"')),
      });
      expect(errors).toEqual([]);
      expect(warnings.filter((w) => w.includes('only matters on modular parts'))).toEqual([
        expect.stringMatching(/^void-beats\.toml: .*kit 'jam' only matters on modular parts.*belongs in _ship\.toml/),
      ]);
    });

    it('checks tomorrow-<MHz> against the drifting station', () => {
      const ok = check({ 'free-frequency.toml': station('free-frequency', reactions() + clip('t', 'category = "dj"\nkit = "tomorrow-110.65"')) });
      expect(ok.errors).toEqual([]);
      expect(ok.warnings.filter((w) => w.includes('only matters'))).toEqual([]);
      expect(ok.warnings).toContainEqual(expect.stringMatching(/no tomorrow-<MHz> clip for 108\.85, 109\.75, 111\.55/));

      const bad = check({
        'free-frequency.toml': station('free-frequency', reactions() + clip('t', 'category = "dj"\nkit = "tomorrow-114.30"')),
        'void-beats.toml': station('void-beats', reactions() + clip('t', 'category = "dj"\nkit = "tomorrow-110.65"')),
      });
      expect(bad.errors).toEqual([
        expect.stringMatching(/^free-frequency\.toml: .*kit 'tomorrow-114\.30' isn't one of free-frequency's drift frequencies.*'tomorrow-114\.3'/),
        expect.stringMatching(/^void-beats\.toml: .*tomorrow-<MHz> kits are for stations that drift .*free-frequency/),
      ]);
    });
  });
});

describe.skipIf(!PYTHON)('pronunciation lexicon', () => {
  const HERE = fileURLToPath(new URL('.', import.meta.url));
  /** Runs Python with scripts/voice on the path and returns stdout as JSON. */
  function py(code: string, env: Record<string, string> = {}) {
    const result = spawnSync(PYTHON!, ['-c', code], { encoding: 'utf8', cwd: HERE, env: { ...process.env, ...env } });
    if (result.status !== 0) throw new Error(result.stderr);
    return JSON.parse(result.stdout);
  }

  it('respells whole words only, keeping the written case', () => {
    const out = py(`
import json
from voicescript import apply_lexicon
lex = {"theremin": "therr-a-min", "la la": "lah lah"}
print(json.dumps([apply_lexicon(t, lex) for t in [
  "The theremin, the Theremin's case, THEREMIN!", "theremins and thereminist", "Sing la la, not lala.", "No change."]]))`);
    expect(out).toEqual([
      "The therr-a-min, the Therr-a-min's case, THERR-A-MIN!",
      'theremins and thereminist',
      'Sing lah lah, not lala.',
      'No change.',
    ]);
  });

  it('changes what Kokoro hears (and the clip hash) but not the captions', () => {
    const dir = tempDir({
      'lexicon.toml': '[words]\ntheremin = "therr-a-min"\n',
      'tiki-satellite.toml': station('tiki-satellite', clip('t', 'category = "dj"',
        'lines = [{ say = "host", text = "The Theremin is warming up." }, { pause = 0.5 }, { say = "host", text = "Theremin, theremin, therem", cut = 0.5 }]')),
    });
    const code = `
import json, sys
sys.argv = ["render.py"]
import render
from pathlib import Path
lex = render.load_lexicon(Path(${JSON.stringify(join(dir, 'lexicon.toml'))}))
[script] = render.load_all([Path(${JSON.stringify(join(dir, 'tiki-satellite.toml'))})], Path(${JSON.stringify(dir)}))
clip = script.clips[0]
spoken = [l.text for l in clip.lines if hasattr(l, "text")]
heard = [{"speaker": "Lyle", "text": t, "startMs": 0} for t in ["The Therr-a-min is warming up.", "Therr-a-min, therr-—"]]
print(json.dumps({"lex": lex, "spoken": spoken, "written": {str(k): v for k, v in clip.written.items()},
                  "captions": [c["text"] for c in render.written_captions(clip, heard)],
                  "canonical": json.dumps(clip.audio_canonical())}))`;
    const out = py(code, { VOICE_LEXICON: join(dir, 'lexicon.toml') });
    expect(out.lex).toEqual({ theremin: 'therr-a-min' });
    expect(out.spoken).toEqual(['The Therr-a-min is warming up.', 'Therr-a-min, therr-a-min, therem']);
    expect(out.written).toEqual({ 0: 'The Theremin is warming up.', 2: 'Theremin, theremin, therem' });
    expect(out.captions).toEqual(['The Theremin is warming up.', 'Theremin, theremin—']);
    expect(out.canonical).toContain('Therr-a-min');
    expect(out.canonical).not.toContain('Theremin');
  });

  it('rejects a malformed lexicon before checking anything', () => {
    for (const bad of ['[words]\nTheremin = "x"\n', '[words]\ntheremin = ""\n', '[words]\ntheremin = "theremin"\n', 'theremin = "x"\n']) {
      const dir = tempDir({ 'lexicon.toml': bad, 'void-beats.toml': station('void-beats', reactions()) });
      const result = spawnSync(PYTHON!, [RENDER, '--check', '--content', dir], {
        encoding: 'utf8',
        env: { ...process.env, VOICE_LEXICON: join(dir, 'lexicon.toml') },
      });
      expect(result.status, bad).toBe(1);
      expect(result.stderr).toMatch(/lexicon\.toml: /);
    }
  });

  it('ships a lexicon that loads', () => {
    const out = py('import json; from pathlib import Path; from voicescript import load_lexicon; print(json.dumps(load_lexicon(Path("lexicon.toml"))))');
    expect(out.theremin).toBeTruthy();
  });
});

describe.skipIf(!PYTHON)('voice:render --index', () => {
  const manifest = (station: string, ids: string[]) =>
    `${JSON.stringify({
      version: 1,
      station,
      clips: ids.map((id) => ({ id, category: 'dj', url: `/voice/${station}/${id}.mp3`, durationMs: 1000, overMusic: true, lines: [] })),
    }, null, 2)}\n`;

  function library() {
    return tempDir({
      'void-beats.json': manifest('void-beats', ['a', 'b']),
      'void-beats/a.mp3': Buffer.from('aaaa'),
      'void-beats/b.mp3': Buffer.from('bbbbbb'),
      '_ship.json': manifest('_ship', ['x']),
      '_ship/x.mp3': Buffer.from('x'),
      '_shows.json': JSON.stringify({ version: 1, shows: {} }),
    });
  }

  const readIndex = (dir: string) => JSON.parse(readFileSync(join(dir, '_index.json'), 'utf8'));

  it('writes one entry per manifest with clips, bytes and a content version', () => {
    const dir = library();
    expect(run(['--index', '--out', dir]).status).toBe(0);
    const index = readIndex(dir);
    expect(index.version).toBe(1);
    expect(Object.keys(index.entries)).toEqual(['_ship', 'void-beats']);
    expect(index.entries['void-beats']).toMatchObject({ clips: 2, bytes: 10 });
    expect(index.entries._ship).toMatchObject({ clips: 1, bytes: 1 });
    // version = sha256(manifest file, then each clip's MP3 in manifest order), 12 hex digits.
    const expected = createHash('sha256')
      .update(readFileSync(join(dir, 'void-beats.json')))
      .update('aaaa')
      .update('bbbbbb')
      .digest('hex')
      .slice(0, 12);
    expect(index.entries['void-beats'].version).toBe(expected);
  });

  it('changes a version when a clip or the manifest changes, and only that one', () => {
    const dir = library();
    run(['--index', '--out', dir]);
    const before = readIndex(dir).entries;
    writeFileSync(join(dir, 'void-beats/a.mp3'), 'aaab');
    run(['--index', '--out', dir]);
    const afterClip = readIndex(dir).entries;
    expect(afterClip['void-beats'].version).not.toBe(before['void-beats'].version);
    expect(afterClip['void-beats'].bytes).toBe(10);
    expect(afterClip._ship.version).toBe(before._ship.version);

    writeFileSync(join(dir, '_ship.json'), manifest('_ship', ['x']).replace('"durationMs": 1000', '"durationMs": 1001'));
    run(['--index', '--out', dir]);
    expect(readIndex(dir).entries._ship.version).not.toBe(before._ship.version);
  });

  it('reports clips missing on disk', () => {
    const dir = library();
    rmSync(join(dir, 'void-beats/b.mp3'));
    const { status, output } = run(['--index', '--out', dir]);
    expect(status).toBe(1);
    expect(output).toContain('/voice/void-beats/b.mp3 is in a manifest but missing on disk');
  });
});
