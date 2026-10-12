"""Fingerprints of the audio engine's source code, so a clip re-renders only when code it
actually uses changes.

A clip's audio depends on the engine core (timeline, mastering, encoding, TTS) and on the
fx, beds, sfx and stings it names. Each of those gets its own fingerprint: the source of
its function plus, transitively, every engine function, class and constant it refers to.
Adding a new sting therefore doesn't re-render the library, while editing `dsp.band`
re-renders everything that filters (which is everything).

The registries (PRESETS, BEDS, SFX, STINGS and the catalog tables) are not followed from the
core: each name's entry is fingerprinted on its own, and only for the clips that use it.
"""

from __future__ import annotations

import hashlib
import inspect
import types
from pathlib import Path

ENGINE_MODULES = ("dsp", "sounds", "voicefx", "clip", "tts", "voicescript")
_SIMPLE = (int, float, str, bytes, bool, type(None))


def _simple(value) -> bool:
    if isinstance(value, _SIMPLE):
        return True
    if isinstance(value, (tuple, list, frozenset, set)):
        return all(_simple(v) for v in value)
    if isinstance(value, dict):
        return all(_simple(k) and _simple(v) for k, v in value.items())
    return False


def _ours(obj) -> bool:
    return getattr(obj, "__module__", None) in ENGINE_MODULES


def _in_engine_dir(fn: types.FunctionType) -> bool:
    path = Path(fn.__code__.co_filename)
    return path.suffix == ".py" and path.is_file() and path.resolve().parent == Path(__file__).resolve().parent


def _names(code: types.CodeType) -> set[str]:
    names = set(code.co_names) | set(code.co_freevars)
    for const in code.co_consts:
        if isinstance(const, types.CodeType):
            names |= _names(const)
    return names


def _source(obj) -> str:
    try:
        return inspect.getsource(obj)
    except (OSError, TypeError):
        code = getattr(obj, "__code__", None)
        return repr(code.co_code) + repr(code.co_consts) if code else repr(obj)


class Fingerprinter:
    def __init__(self, registries: list) -> None:
        self.skip = {id(r) for r in registries}
        self.modules = {name: __import__(name) for name in ENGINE_MODULES}

    def of(self, *roots, extra=None) -> str:
        """Hash of the roots and everything they reach; `extra` is any JSON-able data to mix in."""
        seen: set[int] = set()
        parts: list[str] = [repr(extra)]
        stack = list(roots)
        while stack:
            obj = stack.pop()
            if id(obj) in seen:
                continue
            seen.add(id(obj))
            parts.append(self._describe(obj, stack))
        return hashlib.sha256("\n\x00".join(sorted(parts)).encode()).hexdigest()

    def _describe(self, obj, stack: list) -> str:
        if isinstance(obj, types.FunctionType):
            return self._function(obj, stack)
        if isinstance(obj, type):
            # Methods written in our files (not the ones @dataclass generates, which follow the
            # class source anyway and whose bytecode changes with every Python release).
            for member in vars(obj).values():
                if isinstance(member, types.FunctionType) and _ours(member) and _in_engine_dir(member):
                    stack.append(member)
            return f"class {obj.__module__}.{obj.__qualname__}\n{_source(obj)}"
        if isinstance(obj, (tuple, list)):
            out = []
            for item in obj:
                if isinstance(item, (types.FunctionType, type)) or hasattr(item, "__dataclass_fields__"):
                    stack.append(item)
                else:
                    out.append(repr(item))
            return f"seq {out}"
        if hasattr(obj, "__dataclass_fields__"):  # e.g. a voicefx Preset: follow its fields
            out = []
            for name in obj.__dataclass_fields__:
                value = getattr(obj, name)
                if _simple(value):
                    out.append(f"{name}={value!r}")
                else:
                    stack.append(value)
                    out.append(f"{name}=<{type(value).__name__}>")
            return f"{type(obj).__qualname__}({', '.join(out)})"
        return repr(obj)

    def _function(self, fn: types.FunctionType, stack: list) -> str:
        lines = [f"def {fn.__module__}.{fn.__qualname__}", _source(fn)]
        if fn.__defaults__:
            lines.append(f"defaults={fn.__defaults__!r}")
        if fn.__kwdefaults__:
            lines.append(f"kwdefaults={sorted(fn.__kwdefaults__.items())!r}")
        for name, cell in zip(fn.__code__.co_freevars, fn.__closure__ or ()):
            try:
                value = cell.cell_contents
            except ValueError:
                continue
            lines.append(self._reference(name, value, stack))
        names = _names(fn.__code__)
        namespaces = [fn.__globals__]
        for value in fn.__globals__.values():
            if isinstance(value, types.ModuleType) and value.__name__ in ENGINE_MODULES and value.__name__ in names:
                namespaces.append(vars(value))
        for name in sorted(names):
            for space in namespaces:
                if name in space:
                    lines.append(self._reference(name, space[name], stack))
        return "\n".join(lines)

    def _reference(self, name: str, value, stack: list) -> str:
        if id(value) in self.skip or isinstance(value, types.ModuleType):
            return f"{name}: <registry or module>"
        if isinstance(value, (types.FunctionType, type)):
            if _ours(value):
                stack.append(value)
                return f"{name}: -> {value.__module__}.{value.__qualname__}"
            return f"{name}: <external {getattr(value, '__module__', '?')}.{getattr(value, '__qualname__', '?')}>"
        if _simple(value):
            return f"{name} = {value!r}"
        if hasattr(value, "__dataclass_fields__") or isinstance(value, (tuple, list)):
            stack.append(value)
            return f"{name}: <data>"
        return f"{name}: <{type(value).__module__}.{type(value).__qualname__}>"


class EngineFingerprints:
    """The core fingerprint plus one per fx, bed, sfx and sting name (computed lazily)."""

    def __init__(self, version: int) -> None:
        import clip
        import sounds
        import voicefx
        import voicescript

        self.clip, self.sounds, self.voicefx, self.voicescript = clip, sounds, voicefx, voicescript
        tables = ("STING_SECONDS", "SFX_SECONDS", "LENGTH_GUIDE", "PART_LENGTH_GUIDE")
        self.fp = Fingerprinter([voicefx.PRESETS, sounds.BEDS, sounds.SFX, sounds.STINGS,
                                 *(getattr(voicescript, t) for t in tables if hasattr(voicescript, t))])
        self.core = self.fp.of(clip.render, clip.init_worker, extra={"version": version})
        self._cache: dict[tuple[str, str], str] = {}

    def component(self, kind: str, name: str) -> str:
        key = (kind, name)
        if key not in self._cache:
            if kind == "fx":
                self._cache[key] = self.fp.of(self.voicefx.PRESETS[name])
            elif kind == "bed":
                fn, target = self.sounds.BEDS[name]
                self._cache[key] = self.fp.of(fn, extra={"lufs": target})
            elif kind == "sfx":
                fn, target = self.sounds.SFX[name]
                self._cache[key] = self.fp.of(fn, extra={"lufs": target})
            elif kind == "sting":
                fn = self.sounds.STINGS[name]
                self._cache[key] = self.fp.of(fn, extra={"seconds": self.voicescript.STING_SECONDS[name]})
            else:
                raise KeyError(kind)
        return self._cache[key]

    def for_clip(self, clip) -> dict[str, str]:
        """{"core": ..., "fx:phone": ..., "bed:rain": ...} for everything this clip uses."""
        from voicescript import Sfx, Speech, Sting

        used = {"core": self.core}
        if clip.bed:
            used[f"bed:{clip.bed}"] = self.component("bed", clip.bed)
        for line in clip.lines:
            if isinstance(line, Speech):
                used[f"fx:{line.fx}"] = self.component("fx", line.fx)
            elif isinstance(line, Sfx):
                used[f"sfx:{line.name}"] = self.component("sfx", line.name)
            elif isinstance(line, Sting):
                used[f"sting:{line.name}"] = self.component("sting", line.name)
        return used

    def all_components(self) -> dict[str, str]:
        """Every fingerprint, for comparing two versions of the engine."""
        out = {"core": self.core}
        for kind, names in (("fx", self.voicefx.PRESETS), ("bed", self.sounds.BEDS), ("sfx", self.sounds.SFX),
                            ("sting", self.sounds.STINGS)):
            for name in names:
                out[f"{kind}:{name}"] = self.component(kind, name)
        return out
