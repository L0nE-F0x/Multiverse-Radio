#!/usr/bin/env python3
"""Render voice scripts (content/voice/*.toml) into MP3 clips and manifests.

    content/voice/<station>.toml  ->  public/voice/<station>/<clip-id>.mp3
                                      public/voice/<station>.json   (VoiceManifest)
    every file's [[show]] blocks  ->  public/voice/_shows.json     (ShowIndex)

Usage (see scripts/voice/README.md):
    render.py                         render every station and pool (skips _example and other drafts)
    render.py --station void-beats    just one station (repeatable; also renders drafts by name)
    render.py --check                 validate every script without rendering
    render.py --force                 re-render clips even if nothing changed
    render.py --out /tmp/voice        render somewhere other than public/voice
    render.py --clip 'id-*' --out D   only matching clips (test renders outside public/voice)
    render.py --gallery --out DIR     audition every fx, bed, sfx and sting

Needs Python >= 3.11. Rendering also needs numpy, soundfile, kokoro-onnx and ffmpeg;
--check needs only the standard library.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import signal
import sys
import time
from pathlib import Path

from voicescript import Script, available_voices, bitrate_for, load_script, roster_station_ids, ts_string_array

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CONTENT = ROOT / "content" / "voice"
PUBLIC = ROOT / "public" / "voice"
ROSTER = ROOT / "src" / "stations" / "roster.ts"
TYPES = ROOT / "src" / "broadcast" / "types.ts"
# Hash and size of every clip rendered into public/voice, committed with the library so a
# fresh checkout (no .cache) only renders what actually changed.
LOCK = HERE / "render-lock.json"
SHOWS = "_shows.json"
CACHE = Path(os.environ.get("VOICE_CACHE", HERE / ".cache"))
KOKORO_MODEL = Path(os.environ.get("KOKORO_MODEL", "~/.local/share/bb-tts/kokoro-v1.0.onnx")).expanduser()
KOKORO_VOICES = Path(os.environ.get("KOKORO_VOICES", "~/.local/share/bb-tts/voices-v1.0.bin")).expanduser()
LOCK_HASH = 16  # hex digits of the clip hash kept in the lock file


def rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def fmt_seconds(s: float) -> str:
    h, rest = divmod(int(round(s)), 3600)
    m, sec = divmod(rest, 60)
    if h:
        return f"{h}h{m:02d}m"
    return f"{m}m{sec:02d}s" if m else f"{sec}s"


def kbps(bitrate: str) -> int:
    from voicescript import KBPS_ESTIMATE

    return KBPS_ESTIMATE.get(bitrate) or int(bitrate.rstrip("k"))


# ── Discovery and validation ──────────────────────────────────────────────────


def discover(content: Path, stations: list[str]) -> list[Path]:
    if stations:
        paths = []
        for name in stations:
            path = content / f"{name.removesuffix('.toml')}.toml"
            if not path.exists():
                sys.exit(f"error: no script for station {name!r} ({rel(path)} doesn't exist)")
            paths.append(path)
        return paths
    return sorted(content.glob("*.toml"))


def load_all(paths: list[Path]) -> list[Script]:
    roster = roster_station_ids(ROSTER)
    if not roster:
        sys.exit(f"error: couldn't read any station ids from {rel(ROSTER)}")
    events = ts_string_array(TYPES, "EVENT_IDS")
    if not events:
        sys.exit(f"error: couldn't read EVENT_IDS from {rel(TYPES)}")
    voices = available_voices(KOKORO_VOICES)
    scripts = []
    for path in paths:
        script = load_script(path, voices, roster, events)
        for issue in script.issues:
            issue.path = Path(rel(issue.path))
        scripts.append(script)
    return scripts


def report(scripts: list[Script]) -> tuple[int, int]:
    errors = warnings = 0
    for script in scripts:
        for issue in script.issues:
            print(issue, file=sys.stderr if issue.level == "error" else sys.stdout)
            errors += issue.level == "error"
            warnings += issue.level == "warning"
    return errors, warnings


def projected_bytes(seconds: float, bitrate: str) -> float:
    return seconds * kbps(bitrate) * 1000 / 8


def check(scripts: list[Script]) -> int:
    errors, warnings = report(scripts)
    total_clips = total_est = total_bytes = 0.0
    total_shows = 0
    for script in scripts:
        est = sum(c.estimate_seconds() for c in script.clips)
        flag = "draft, not aired" if script.is_draft else ("FAILED" if not script.ok else "ok")
        extras = []
        if script.shows:
            extras.append(f"{len(script.shows)} show{'s' if len(script.shows) > 1 else ''}")
        parts = sum(1 for c in script.clips if c.part)
        if parts:
            extras.append(f"{parts} part{'s' if parts > 1 else ''}")
        serials = {c.serial.id for c in script.clips if c.serial}
        if serials:
            extras.append(f"{len(serials)} serial{'s' if len(serials) > 1 else ''}")
        extra = f"  ({', '.join(extras)})" if extras else ""
        print(f"  {script.station:<22} {len(script.clips):>4} clips  ~{fmt_seconds(est):>7}  {flag}{extra}")
        if not script.is_draft:
            total_clips += len(script.clips)
            total_est += est
            total_shows += len(script.shows)
            total_bytes += sum(projected_bytes(c.estimate_seconds(), bitrate_for(c)) for c in script.clips)
    aired = [s for s in scripts if not s.is_draft]
    print(f"{len(scripts)} scripts ({len(aired)} aired): {int(total_clips)} clips, {total_shows} shows, "
          f"~{fmt_seconds(total_est)} estimated (~{total_bytes / 1e6:.0f} MB of MP3); "
          f"{errors} errors, {warnings} warnings")
    return 1 if errors else 0


# ── State: what's already rendered ────────────────────────────────────────────


def read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_json(path: Path, data, indent: int | None = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, indent=indent, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def state_path(out: Path, station: str) -> Path:
    key = hashlib.sha1(str(out.resolve()).encode()).hexdigest()[:16]
    return CACHE / "state" / key / f"{station}.json"


class Lock:
    """render-lock.json: {"clips": {station: {clip id: "<hash>:<size>"}}} for public/voice."""

    def __init__(self, path: Path | None) -> None:
        self.path = path
        data = read_json(path) if path else {}
        clips = data.get("clips")
        self.clips: dict[str, dict[str, str]] = clips if isinstance(clips, dict) else {}
        self.dirty = False

    def matches(self, station: str, clip_id: str, digest: str, size: int) -> bool:
        return self.clips.get(station, {}).get(clip_id) == f"{digest[:LOCK_HASH]}:{size}"

    def set_station(self, station: str, records: dict[str, tuple[str, int]]) -> None:
        if self.path is None:
            return
        new = {cid: f"{digest[:LOCK_HASH]}:{size}" for cid, (digest, size) in sorted(records.items())}
        if self.clips.get(station) != new:
            self.clips[station] = new
            self.dirty = True

    def drop_station(self, station: str) -> None:
        if self.clips.pop(station, None) is not None:
            self.dirty = True

    def save(self) -> None:
        if self.path is None or not self.dirty:
            return
        write_json(self.path, {
            "version": 1,
            "about": "Written by scripts/voice/render.py: hash:size of every clip in public/voice. Commit it with the clips.",
            "clips": {station: self.clips[station] for station in sorted(self.clips)},
        })
        self.dirty = False


def manifest_lookup(out: Path, station: str) -> dict[str, dict]:
    data = read_json(out / f"{station}.json")
    clips = data.get("clips") if data.get("station") == station else None
    if not isinstance(clips, list):
        return {}
    return {c["id"]: c for c in clips if isinstance(c, dict) and isinstance(c.get("id"), str)}


def manifest_entry(station: str, clip, duration_ms: int, lines: list[dict]) -> dict:
    entry: dict = {
        "id": clip.id,
        "category": clip.category,
        "url": f"/voice/{station}/{clip.id}.mp3",
        "durationMs": duration_ms,
    }
    if clip.title:
        entry["title"] = clip.title
    entry["overMusic"] = clip.over_music
    if clip.daypart:
        entry["daypart"] = clip.daypart
    if clip.stations:
        entry["stations"] = list(clip.stations)
    if clip.part:
        entry["part"] = clip.part
    if clip.kit:
        entry["kit"] = clip.kit
    if clip.show:
        entry["show"] = clip.show
    if clip.serial:
        entry["serial"] = {"id": clip.serial.id, "episode": clip.serial.episode}
    if clip.dates:
        entry["dates"] = list(clip.dates)
    if clip.level is not None:
        entry["level"] = clip.level
    if clip.event:
        entry["event"] = clip.event
    entry["lines"] = lines
    return entry


def is_manifest(path: Path) -> bool:
    data = read_json(path)
    return data.get("version") == 1 and isinstance(data.get("station"), str) and isinstance(data.get("clips"), list)


def remove_orphans(out: Path, station: str, keep: set[str]) -> int:
    removed = 0
    folder = out / station
    if folder.is_dir():
        for f in folder.glob("*.mp3"):
            if f.stem not in keep:
                f.unlink()
                removed += 1
    return removed


def remove_orphan_stations(out: Path, live: set[str]) -> list[str]:
    gone = []
    if not out.is_dir():
        return gone
    for manifest in out.glob("*.json"):
        station = manifest.stem
        if station in live or not is_manifest(manifest):
            continue
        manifest.unlink()
        folder = out / station
        if folder.is_dir():
            for f in folder.glob("*.mp3"):
                f.unlink()
            try:
                folder.rmdir()
            except OSError:
                pass
        gone.append(station)
    return gone


def write_shows(out: Path, scripts: list[Script], full: bool) -> bool:
    """Compile [[show]] blocks into <out>/_shows.json (ShowIndex). A partial run (--station)
    only replaces the stations it loaded. Returns True if the file changed."""
    path = out / SHOWS
    existing = read_json(path).get("shows")
    shows: dict[str, list[dict]] = {} if full or not isinstance(existing, dict) else dict(existing)
    for script in scripts:
        if script.is_draft or script.is_pool:
            continue
        shows.pop(script.station, None)
        if script.shows:
            shows[script.station] = [s.to_json() for s in script.shows]
    data = {"version": 1, "shows": {station: shows[station] for station in sorted(shows)}}
    if read_json(path) == data:
        return False
    write_json(path, data)
    return True


# ── Rendering ─────────────────────────────────────────────────────────────────


def clip_hash(engine, model: str, station: str, clip, bitrate: str) -> str:
    payload = json.dumps({"engine": engine.for_clip(clip), "model": model, "station": station, "bitrate": bitrate,
                          "clip": clip.audio_canonical()}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def clip_seed(station: str, clip) -> int:
    """Noise and reverb seeds depend on the clip, not the engine, so engine tweaks don't reshuffle them."""
    payload = json.dumps({"station": station, "id": clip.id, "clip": clip.audio_canonical()}, sort_keys=True)
    return int(hashlib.sha256(payload.encode()).hexdigest()[:12], 16)


WORKER_GB = 0.9  # peak memory of one worker (Kokoro session + DSP buffers)


def default_jobs() -> int:
    """Worker processes for a shared machine: Kokoro runs best single-threaded (1.65x realtime per
    core; 4 threads only reach 70% efficiency), so one worker per idle core, minus one, capped
    by free memory and at 8."""
    cores = os.cpu_count() or 2
    try:
        busy = os.getloadavg()[0]
    except (AttributeError, OSError):
        busy = 0.0
    workers = int(cores - busy) - 1
    try:
        meminfo = Path("/proc/meminfo").read_text()
        available_gb = int(meminfo.split("MemAvailable:")[1].split()[0]) / 1e6
        workers = min(workers, int(available_gb / WORKER_GB) - 1)
    except (OSError, IndexError, ValueError):
        pass
    return max(1, min(8, workers))


def run_jobs(jobs: list, workers: int, threads: int, nice: int, on_done) -> None:
    import clip as engine

    init = (str(KOKORO_MODEL), str(KOKORO_VOICES), str(CACHE), threads, nice)
    if workers <= 1 or len(jobs) <= 1:
        engine.init_worker(*init)
        for job in jobs:
            on_done(job, engine.render_safe(job))
        return
    import multiprocessing
    from concurrent.futures import ProcessPoolExecutor, as_completed

    ctx = multiprocessing.get_context("forkserver" if sys.platform != "win32" else "spawn")
    pool = ProcessPoolExecutor(max_workers=workers, mp_context=ctx, initializer=engine.init_worker, initargs=init)
    futures = {pool.submit(engine.render_safe, job): job for job in jobs}
    try:
        for future in as_completed(futures):
            on_done(futures[future], future.result())
    except BaseException:
        # Stop now rather than waiting for the clips in flight: what finished is saved, the
        # rest renders on the next run. (Half-written files are temp files, cleaned up later.)
        processes = list((getattr(pool, "_processes", None) or {}).values())
        pool.shutdown(wait=False, cancel_futures=True)
        for process in processes:
            process.terminate()
        raise
    pool.shutdown(wait=True)


class Plan:
    """One script's clips: which are fresh (with their manifest data) and which need rendering."""

    def __init__(self, script: Script, out: Path, state: dict, hashes: dict[str, str]):
        self.script = script
        self.out = out
        self.state = state  # clip id -> {"hash", "size", "durationMs", "lines"}
        self.hashes = hashes
        self.dirty = False

    def record(self, clip_id: str, size: int, duration_ms: int, lines: list[dict]) -> None:
        self.state[clip_id] = {"hash": self.hashes[clip_id], "size": size, "durationMs": duration_ms, "lines": lines}
        self.dirty = True

    def fresh(self, clip_id: str) -> dict | None:
        record = self.state.get(clip_id)
        mp3 = self.out / self.script.station / f"{clip_id}.mp3"
        if record and record.get("hash") == self.hashes[clip_id] and mp3.exists() and mp3.stat().st_size == record.get("size"):
            return record
        return None

    def save_state(self) -> None:
        if self.dirty:
            live = {c.id for c in self.script.clips}
            state = {cid: rec for cid, rec in self.state.items() if cid in live}
            write_json(state_path(self.out, self.script.station),
                       {"out": str(self.out.resolve()), "clips": state}, indent=None)
            self.dirty = False


def plan_all(scripts: list[Script], out: Path, lock: Lock, engine, model: str, force: bool):
    """Hash every clip and work out what's fresh: from the local state (.cache), or from the
    committed lock plus the existing manifest (a fresh checkout of public/voice)."""
    from clip import Job

    plans, todo = [], []
    for script in scripts:
        state = read_json(state_path(out, script.station)).get("clips", {})
        state = state if isinstance(state, dict) else {}
        hashes, bitrates = {}, {}
        for clip in script.clips:
            bitrates[clip.id] = bitrate_for(clip)
            hashes[clip.id] = clip_hash(engine, model, script.station, clip, bitrates[clip.id])
        plan = Plan(script, out, state, hashes)
        manifest = None
        for clip in script.clips:
            if force:
                plan.state.pop(clip.id, None)
            elif not plan.fresh(clip.id):
                mp3 = out / script.station / f"{clip.id}.mp3"
                size = mp3.stat().st_size if mp3.exists() else -1
                if size > 0 and lock.matches(script.station, clip.id, hashes[clip.id], size):
                    manifest = manifest if manifest is not None else manifest_lookup(out, script.station)
                    entry = manifest.get(clip.id)
                    if entry and isinstance(entry.get("durationMs"), int) and isinstance(entry.get("lines"), list):
                        plan.record(clip.id, size, entry["durationMs"], entry["lines"])
                        continue
            if force or not plan.fresh(clip.id):
                todo.append(Job(script.station, clip, str(out / script.station / f"{clip.id}.mp3"),
                                clip_seed(script.station, clip), bitrates[clip.id]))
        plans.append(plan)
    return plans, todo


def finish_station(plan: Plan, lock: Lock) -> tuple[bool, int]:
    """Write the manifest if every clip is rendered; returns (complete, orphans removed)."""
    script, out = plan.script, plan.out
    entries, records = [], {}
    for clip in script.clips:
        record = plan.fresh(clip.id)
        if record is None:
            return False, 0
        entries.append(manifest_entry(script.station, clip, record["durationMs"], record["lines"]))
        records[clip.id] = (record["hash"], record["size"])
    data = {"version": 1, "station": script.station, "clips": entries}
    if read_json(out / f"{script.station}.json") != data:
        write_json(out / f"{script.station}.json", data)
    lock.set_station(script.station, records)
    return True, remove_orphans(out, script.station, {c.id for c in script.clips})


def render(scripts: list[Script], out: Path, force: bool, workers: int, threads: int, nice: int, full: bool,
           lock_path: Path | None) -> int:
    from clip import ENGINE_VERSION, Failure
    from fingerprint import EngineFingerprints
    from tts import model_identity

    started = time.time()
    engine = EngineFingerprints(ENGINE_VERSION)
    model = model_identity(KOKORO_MODEL, KOKORO_VOICES)
    lock = Lock(lock_path)
    plans, todo = plan_all(scripts, out, lock, engine, model, force)
    by_station = {plan.script.station: plan for plan in plans}

    todo.sort(key=lambda job: -job.clip.estimate_seconds())
    total = len(todo)
    cached_count = sum(len(s.clips) for s in scripts) - total
    workers = max(1, min(workers, total or 1))
    est_total = sum(job.clip.estimate_seconds() for job in todo)
    if total:
        print(f"Rendering {total} clips (~{fmt_seconds(est_total)} of audio; {cached_count} unchanged) with "
              f"{workers} workers x {threads} threads -> {rel(out)}", flush=True)
    else:
        print(f"Nothing to render ({cached_count} clips unchanged) -> {rel(out)}")

    failures: list[str] = []
    warnings: list[str] = []
    done = rendered = 0
    audio_seconds = tts_seconds = est_done = 0.0
    width = len(str(total))
    last_save = time.time()

    def save_progress() -> None:
        for plan in plans:
            plan.save_state()

    def on_done(job, result) -> None:
        nonlocal done, rendered, audio_seconds, tts_seconds, est_done, last_save
        done += 1
        est_done += job.clip.estimate_seconds()
        elapsed = time.time() - started
        eta = elapsed / est_done * (est_total - est_done) if est_done > 0 else 0
        name = f"{job.station}/{job.clip.id}"
        prefix = f"  [{done:>{width}}/{total}] {name:<40}"
        if isinstance(result, Failure):
            failures.append(f"{name}: {result.error}")
            print(f"{prefix} FAILED: {result.error}", flush=True)
            return
        rendered += 1
        plan = by_station[job.station]
        plan.record(job.clip.id, Path(job.out_path).stat().st_size, result.duration_ms, result.lines)
        audio_seconds += result.duration_ms / 1000
        tts_seconds += result.tts_seconds
        print(f"{prefix} {result.duration_ms / 1000:6.1f} s {result.loudness:6.1f} LUFS {result.true_peak:5.1f} dBTP "
              f"{job.bitrate:>3}  ({result.elapsed:4.1f} s)  eta {fmt_seconds(eta)}", flush=True)
        for w in result.warnings:
            warnings.append(f"{name}: {w}")
        if time.time() - last_save > 10:  # an interrupted run resumes from here
            save_progress()
            last_save = time.time()

    interrupted = False
    try:
        run_jobs(todo, workers, threads, nice, on_done)
    except KeyboardInterrupt:
        interrupted = True
        print("\nInterrupted; saving progress (re-run to resume).", file=sys.stderr)
    finally:
        save_progress()
        incomplete = []
        for plan in plans:
            complete, removed = finish_station(plan, lock)
            if not complete:
                incomplete.append(plan.script.station)
            elif removed:
                print(f"  removed {removed} stale file(s) from {rel(out / plan.script.station)}")
        if full and not interrupted:
            for station in remove_orphan_stations(out, {s.station for s in scripts}):
                lock.drop_station(station)
                print(f"  removed orphaned station {station}")
        if write_shows(out, scripts, full):
            print(f"  updated {rel(out / SHOWS)}")
        lock.save()

    for w in warnings:
        print(f"warning: {w}")
    wall = time.time() - started
    speed = f", {audio_seconds / wall:.1f}x realtime" if rendered and wall > 0 else ""
    print(f"Done in {fmt_seconds(wall)}: {rendered} rendered ({fmt_seconds(audio_seconds)} of audio, "
          f"{fmt_seconds(tts_seconds)} new TTS){speed}; {cached_count} unchanged.")
    if incomplete:
        print(f"Manifests not updated (clips missing): {', '.join(incomplete)}", file=sys.stderr)
    if failures:
        print(f"{len(failures)} clip(s) failed:", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
    return 130 if interrupted else (1 if failures or incomplete else 0)


# ── Gallery ───────────────────────────────────────────────────────────────────

GALLERY_LINE = "Testing, testing. This is Multiverse Radio, broadcasting from somewhere else."
# Lines (and voices) that suit a treatment better than the generic test line.
GALLERY_FX_LINES = {
    "ship": ("af_heart", 0.95, "Good evening, operator. Relay seven is holding steady. The kettle has been informed."),
    "cb": ("am_fenrir", 1.0, "Breaker breaker, this is Long Haul Lou, eastbound out of dimension nine. Over."),
    "vinyl": ("bm_george", 1.0, "And now, a recording made on a Tuesday that has since been discontinued."),
    "ghost": ("af_nicole", 0.9, "I used to be on this frequency. I think I still am. Can you hear me?"),
}


def gallery(out: Path, voice: str, only: list[str]) -> int:
    """Every fx, bed, sfx and sting as separate MP3s plus an index.html, for auditioning."""
    import html

    import numpy as np

    import clip as engine
    import dsp
    import sounds
    from voicescript import BEDS, FX, SFX, SFX_SECONDS, STINGS, Speech

    engine.init_worker(str(KOKORO_MODEL), str(KOKORO_VOICES), str(CACHE), max(1, (os.cpu_count() or 4) // 2))
    folder = out / "_gallery"
    rng = np.random.default_rng(7)
    rows: list[tuple[str, str, str, float]] = []

    def wanted(name: str) -> bool:
        return not only or any(fnmatch.fnmatch(name, pattern) for pattern in only)

    def save(kind: str, name: str, audio, note: str = "") -> None:
        mastered = engine.master(audio)
        decoded, _ = engine.encode(mastered, folder / f"{kind}-{name}.mp3")
        seconds = len(decoded) / dsp.SR
        rows.append((kind, name, note, seconds))
        print(f"  {rel(folder / f'{kind}-{name}')}.mp3  {seconds:5.1f} s  {dsp.loudness(decoded):6.1f} LUFS", flush=True)

    for fx in FX:
        if wanted(f"fx-{fx}"):
            who, speed, line = GALLERY_FX_LINES.get(fx, (voice, 1.0, GALLERY_LINE))
            audio, _ = engine.speech(Speech(who, line, speed, fx, 0.0, None, ""), rng)
            save("fx", fx, audio, f"{who} at {speed:g}: {line}")
    for bed in BEDS:
        if wanted(f"bed-{bed}"):
            # The bed alone (at its level under a voice), then with the test line over it.
            alone = dsp.fade(sounds.make_bed(bed, 12.0, rng), 0.4, 0.8)
            save("bed", bed, alone, "12 s alone, at its level under a -20 LUFS voice")
    for name in SFX:
        if wanted(f"sfx-{name}"):
            save("sfx", name, sounds.make_sfx(name, SFX_SECONDS[name], 1.0, rng), f"default {SFX_SECONDS[name]:g} s")
    for name in STINGS:
        if wanted(f"sting-{name}"):
            save("sting", name, sounds.make_sting(name, rng))

    items = "\n".join(
        f'<tr><td>{kind}</td><td><code>{html.escape(name)}</code></td><td>{seconds:.1f} s</td>'
        f'<td><audio controls preload="none" src="{kind}-{html.escape(name)}.mp3"></audio></td>'
        f'<td>{html.escape(note)}</td></tr>'
        for kind, name, note, seconds in rows
    )
    (folder / "index.html").write_text(
        "<!doctype html><meta charset=utf-8><title>Voice gallery</title>"
        "<style>body{font:14px system-ui;margin:2em}td{padding:4px 10px;border-bottom:1px solid #ddd}"
        "audio{height:28px}</style><h1>Voice gallery</h1>"
        "<p>Beds and sfx are mastered to -16 LUFS here, so they sound louder than they will under a voice.</p>"
        f"<table>{items}</table>\n",
        encoding="utf-8",
    )
    print(f"Open {rel(folder / 'index.html')} to audition {len(rows)} sounds.")
    return 0


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--station", action="append", default=[], metavar="ID",
                        help="only this station (repeatable); drafts like _example render only when named")
    parser.add_argument("--clip", action="append", default=[], metavar="GLOB",
                        help="only clips whose id matches (repeatable); needs --out outside public/voice")
    parser.add_argument("--check", action="store_true", help="validate scripts without rendering")
    parser.add_argument("--force", action="store_true", help="re-render clips even if unchanged")
    parser.add_argument("--jobs", type=int, default=0, metavar="N",
                        help="worker processes (default: idle cores - 1, capped by free memory, 1-8)")
    parser.add_argument("--threads", type=int, default=1, metavar="N",
                        help="Kokoro threads per worker (default 1: best throughput per core)")
    parser.add_argument("--nice", type=int, default=10, metavar="N",
                        help="lower the workers' CPU priority by N (default 10; 0 to disable)")
    parser.add_argument("--out", type=Path, default=PUBLIC, metavar="DIR", help="output directory (default public/voice)")
    parser.add_argument("--content", type=Path, default=CONTENT, metavar="DIR", help="script directory (default content/voice)")
    parser.add_argument("--gallery", action="store_true", help="render every fx/bed/sfx/sting into <out>/_gallery")
    parser.add_argument("--only", action="append", default=[], metavar="GLOB",
                        help="with --gallery: only these sounds, e.g. 'bed-*' or 'sfx-meow'")
    parser.add_argument("--gallery-voice", default="af_heart", help=argparse.SUPPRESS)
    parser.add_argument("--lock", type=Path, default=None, help=argparse.SUPPRESS)  # testing: a lock for any --out
    args = parser.parse_args()
    outside_public = args.out.resolve() != PUBLIC.resolve()

    if args.gallery:
        if not outside_public:
            parser.error("--gallery needs --out somewhere outside public/voice")
        return gallery(args.out, args.gallery_voice, args.only)
    if args.clip and not outside_public:
        parser.error("--clip renders a subset; use --out somewhere outside public/voice")

    paths = discover(args.content, args.station)
    scripts = load_all(paths)
    if args.check:
        return check(scripts)

    errors, _ = report(scripts)
    if errors:
        print(f"{errors} error(s); fix them (or run with --check for a summary) before rendering.", file=sys.stderr)
        return 1
    if not args.station:
        scripts = [s for s in scripts if not s.is_draft]
    if args.clip:
        for script in scripts:
            script.clips = [c for c in script.clips if any(fnmatch.fnmatch(c.id, g) for g in args.clip)]
        scripts = [s for s in scripts if s.clips]
    if not scripts:
        print(f"No scripts to render in {rel(args.content)}.")
    try:
        import numpy  # noqa: F401
        import soundfile  # noqa: F401
    except ImportError as e:
        sys.exit(f"error: rendering needs numpy, soundfile and kokoro-onnx ({e}). "
                 "Point VOICE_PYTHON (npm scripts) at a Python that has them.")
    full = not args.station and not args.clip
    lock_path = args.lock or (None if outside_public else LOCK)
    return render(scripts, args.out, args.force, args.jobs or default_jobs(), max(1, args.threads), max(0, args.nice),
                  full, lock_path)


def _terminate(signum, frame) -> None:
    raise KeyboardInterrupt  # save progress on `kill` too, like Ctrl-C


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _terminate)
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
