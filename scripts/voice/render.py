#!/usr/bin/env python3
"""Render voice scripts (content/voice/*.toml) into MP3 clips and manifests.

    content/voice/<station>.toml  ->  public/voice/<station>/<clip-id>.mp3
                                      public/voice/<station>.json   (VoiceManifest)

Usage (see scripts/voice/README.md):
    render.py                         render every station script (skips _example and other drafts)
    render.py --station void-beats    just one station (repeatable; also renders drafts by name)
    render.py --check                 validate every script without rendering
    render.py --force                 re-render clips even if nothing changed
    render.py --out /tmp/voice        render somewhere other than public/voice
    render.py --gallery --out DIR     audition every fx, bed, sfx and sting

Needs Python >= 3.11. Rendering also needs numpy, soundfile, kokoro-onnx and ffmpeg;
--check needs only the standard library.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

from voicescript import Script, available_voices, load_script, roster_station_ids

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CONTENT = ROOT / "content" / "voice"
PUBLIC = ROOT / "public" / "voice"
ROSTER = ROOT / "src" / "stations" / "roster.ts"
CACHE = Path(os.environ.get("VOICE_CACHE", HERE / ".cache"))
KOKORO_MODEL = Path(os.environ.get("KOKORO_MODEL", "~/.local/share/bb-tts/kokoro-v1.0.onnx")).expanduser()
KOKORO_VOICES = Path(os.environ.get("KOKORO_VOICES", "~/.local/share/bb-tts/voices-v1.0.bin")).expanduser()


def rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def fmt_seconds(s: float) -> str:
    m, sec = divmod(int(round(s)), 60)
    return f"{m}m{sec:02d}s" if m else f"{sec}s"


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
    voices = available_voices(KOKORO_VOICES)
    scripts = []
    for path in paths:
        script = load_script(path, voices, roster)
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


def check(scripts: list[Script]) -> int:
    errors, warnings = report(scripts)
    total_clips = total_est = 0
    for script in scripts:
        est = sum(c.estimate_seconds() for c in script.clips)
        total_clips += len(script.clips)
        total_est += est
        flag = "draft, not aired" if script.is_draft else ("FAILED" if not script.ok else "ok")
        print(f"  {script.station:<22} {len(script.clips):>4} clips  ~{fmt_seconds(est):>7}  {flag}")
    print(f"{len(scripts)} scripts, {total_clips} clips, ~{fmt_seconds(total_est)} estimated; "
          f"{errors} errors, {warnings} warnings")
    return 1 if errors else 0


# ── Rendering ─────────────────────────────────────────────────────────────────


def engine_hash() -> str:
    from clip import ENGINE_FILES, ENGINE_VERSION

    h = hashlib.sha256(f"v{ENGINE_VERSION}".encode())
    for name in ENGINE_FILES:
        h.update((HERE / name).read_bytes())
    return h.hexdigest()


def clip_hash(engine: str, model: str, station: str, clip) -> str:
    payload = json.dumps({"engine": engine, "model": model, "station": station, "clip": clip.to_canonical()},
                         sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def state_path(out: Path, station: str) -> Path:
    key = hashlib.sha1(str(out.resolve()).encode()).hexdigest()[:16]
    return CACHE / "state" / key / f"{station}.json"


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


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


def default_jobs() -> int:
    return max(1, min(6, (os.cpu_count() or 2) // 2))


def run_jobs(jobs: list, workers: int, threads: int, on_done) -> None:
    import clip as engine

    init = (str(KOKORO_MODEL), str(KOKORO_VOICES), str(CACHE), threads)
    if workers <= 1 or len(jobs) <= 1:
        engine.init_worker(*init)
        for job in jobs:
            on_done(job, engine.render_safe(job))
        return
    import multiprocessing
    from concurrent.futures import ProcessPoolExecutor, as_completed

    ctx = multiprocessing.get_context("forkserver" if sys.platform != "win32" else "spawn")
    with ProcessPoolExecutor(max_workers=workers, mp_context=ctx, initializer=engine.init_worker, initargs=init) as pool:
        futures = {pool.submit(engine.render_safe, job): job for job in jobs}
        try:
            for future in as_completed(futures):
                on_done(futures[future], future.result())
        except BaseException:
            for f in futures:
                f.cancel()
            raise


def render(scripts: list[Script], out: Path, force: bool, workers: int, prune_stations: bool) -> int:
    from clip import Failure, Job
    from tts import model_identity

    started = time.time()
    engine = engine_hash()
    model = model_identity(KOKORO_MODEL, KOKORO_VOICES)
    plans = []  # (script, state, {clip_id: hash})
    todo = []
    for script in scripts:
        state = read_json(state_path(out, script.station)).get("clips", {})
        hashes = {}
        for clip in script.clips:
            digest = clip_hash(engine, model, script.station, clip)
            hashes[clip.id] = digest
            mp3 = out / script.station / f"{clip.id}.mp3"
            cached = state.get(clip.id)
            fresh = (cached and cached.get("hash") == digest and mp3.exists()
                     and mp3.stat().st_size == cached.get("size"))
            if force or not fresh:
                todo.append(Job(script.station, clip, str(mp3), int(digest[:12], 16)))
        plans.append((script, state, hashes))

    todo.sort(key=lambda job: -job.clip.estimate_seconds())
    total = len(todo)
    cached_count = sum(len(s.clips) for s in scripts) - total
    threads = max(1, (os.cpu_count() or 2) // max(1, min(workers, total or 1)))
    if total:
        print(f"Rendering {total} clips ({cached_count} unchanged) with {min(workers, total)} workers "
              f"x {threads} threads -> {rel(out)}")
    else:
        print(f"Nothing to render ({cached_count} clips unchanged) -> {rel(out)}")

    results: dict[tuple[str, str], object] = {}
    failures: list[str] = []
    audio_seconds = tts_seconds = 0.0
    warnings: list[str] = []
    width = len(str(total))

    def on_done(job, result) -> None:
        nonlocal audio_seconds, tts_seconds
        done = len(results) + len(failures) + 1
        name = f"{job.station}/{job.clip.id}"
        if isinstance(result, Failure):
            failures.append(f"{name}: {result.error}")
            print(f"  [{done:>{width}}/{total}] {name:<36} FAILED: {result.error}", flush=True)
            return
        results[(job.station, job.clip.id)] = result
        audio_seconds += result.duration_ms / 1000
        tts_seconds += result.tts_seconds
        print(f"  [{done:>{width}}/{total}] {name:<36} {result.duration_ms / 1000:6.1f} s  "
              f"{result.loudness:6.1f} LUFS  {result.true_peak:5.1f} dBTP  ({result.elapsed:.1f} s)", flush=True)
        for w in result.warnings:
            warnings.append(f"{name}: {w}")

    try:
        run_jobs(todo, workers, threads, on_done)
    finally:
        # Persist whatever finished so an interrupted run resumes where it stopped.
        for script, state, hashes in plans:
            new_state, entries = {}, []
            for clip in script.clips:
                result = results.get((script.station, clip.id))
                mp3 = out / script.station / f"{clip.id}.mp3"
                if result is not None:
                    record = {"hash": hashes[clip.id], "size": mp3.stat().st_size,
                              "durationMs": result.duration_ms, "lines": result.lines}
                elif state.get(clip.id, {}).get("hash") == hashes[clip.id] and mp3.exists():
                    record = state[clip.id]
                else:
                    continue
                new_state[clip.id] = record
                entries.append(manifest_entry(script.station, clip, record["durationMs"], record["lines"]))
            write_json(state_path(out, script.station), {"out": str(out.resolve()), "clips": new_state})
            complete = len(entries) == len(script.clips)
            if complete:
                write_json(out / f"{script.station}.json", {"version": 1, "station": script.station, "clips": entries})
                removed = remove_orphans(out, script.station, {c.id for c in script.clips})
                if removed:
                    print(f"  removed {removed} orphaned clip(s) from {rel(out / script.station)}")

    if prune_stations:
        for station in remove_orphan_stations(out, {s.station for s in scripts}):
            print(f"  removed orphaned station {station}")

    for w in warnings:
        print(f"warning: {w}")
    wall = time.time() - started
    speed = f", {audio_seconds / wall:.1f}x realtime" if results and wall > 0 else ""
    print(f"Done in {wall:.1f} s: {len(results)} rendered ({fmt_seconds(audio_seconds)} of audio, "
          f"{fmt_seconds(tts_seconds)} new TTS){speed}; {cached_count} unchanged.")
    if failures:
        print(f"{len(failures)} clip(s) failed; their stations' manifests were not updated:", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        return 1
    return 0


# ── Gallery ───────────────────────────────────────────────────────────────────

GALLERY_LINE = "Testing, testing. This is Multiverse Radio, broadcasting from somewhere else."


def gallery(out: Path, voice: str) -> int:
    """Every fx, bed, sfx and sting as separate MP3s, for auditioning."""
    import numpy as np

    import clip as engine
    import dsp
    import sounds
    import voicefx
    from voicescript import BEDS, FX, SFX, SFX_SECONDS, STINGS, Speech

    engine.init_worker(str(KOKORO_MODEL), str(KOKORO_VOICES), str(CACHE), os.cpu_count() or 4)
    folder = out / "_gallery"
    rng = np.random.default_rng(7)

    def save(name: str, audio) -> None:
        mastered = engine.master(audio)
        engine.encode(mastered, folder / f"{name}.mp3")
        print(f"  {rel(folder / name)}.mp3  {len(mastered) / dsp.SR:5.1f} s")

    for fx in FX:
        audio, _ = engine.speech(Speech(voice, GALLERY_LINE, 1.0, fx, 0.0, None, ""), rng)
        save(f"fx-{fx}", audio)
    for bed in BEDS:
        save(f"bed-{bed}", dsp.fade(sounds.make_bed(bed, 10.0, rng), 0.4, 0.8))
    for name in SFX:
        save(f"sfx-{name}", sounds.make_sfx(name, SFX_SECONDS[name], 1.0, rng))
    for name in STINGS:
        save(f"sting-{name}", sounds.make_sting(name, rng))
    assert set(voicefx.PRESETS) == set(FX)
    return 0


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--station", action="append", default=[], metavar="ID",
                        help="only this station (repeatable); drafts like _example render only when named")
    parser.add_argument("--check", action="store_true", help="validate scripts without rendering")
    parser.add_argument("--force", action="store_true", help="re-render clips even if unchanged")
    parser.add_argument("--jobs", type=int, default=default_jobs(), metavar="N", help="worker processes")
    parser.add_argument("--out", type=Path, default=PUBLIC, metavar="DIR", help="output directory (default public/voice)")
    parser.add_argument("--content", type=Path, default=CONTENT, metavar="DIR", help="script directory (default content/voice)")
    parser.add_argument("--gallery", action="store_true", help="render every fx/bed/sfx/sting into <out>/_gallery")
    parser.add_argument("--gallery-voice", default="af_heart", help=argparse.SUPPRESS)
    args = parser.parse_args()

    if args.gallery:
        if args.out.resolve() == PUBLIC.resolve():
            parser.error("--gallery needs --out somewhere outside public/voice")
        return gallery(args.out, args.gallery_voice)

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
    if not scripts:
        print(f"No scripts to render in {rel(args.content)}.")
    return render(scripts, args.out, args.force, max(1, args.jobs), prune_stations=not args.station)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
