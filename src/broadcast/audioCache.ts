// Decoded voice clips, bounded by memory. Decoded PCM is big (a minute of mono audio at
// 48 kHz is ~11 MB), so this is an LRU over estimated bytes, not entry count.

export type Decoder = (url: string) => Promise<AudioBuffer>;

/** Minimal shape needed for size accounting (lets tests use fakes). */
type Sized = Pick<AudioBuffer, 'length' | 'numberOfChannels'>;

export function bufferBytes(buffer: Sized): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

/** A failed URL is retried after this long. */
const RETRY_AFTER_MS = 30_000;

export type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

export class AudioBufferCache {
  private readonly entries = new Map<string, AudioBuffer>();
  private readonly inflight = new Map<string, Promise<AudioBuffer | null>>();
  private readonly failures = new Map<string, number>();
  private total = 0;

  constructor(
    private readonly decode: Decoder,
    readonly maxBytes = 40 * 1024 * 1024,
  ) {}

  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.entries.size;
  }

  /** The decoded buffer, if ready (marks it recently used). */
  get(url: string): AudioBuffer | undefined {
    const buffer = this.entries.get(url);
    if (buffer) {
      this.entries.delete(url);
      this.entries.set(url, buffer);
    }
    return buffer;
  }

  state(url: string): LoadState {
    if (this.entries.has(url)) return 'ready';
    if (this.inflight.has(url)) return 'loading';
    const failedAt = this.failures.get(url);
    if (failedAt !== undefined && Date.now() - failedAt < RETRY_AFTER_MS) return 'failed';
    return 'idle';
  }

  /** Fetches and decodes once; concurrent callers share the work. Resolves null on failure. */
  load(url: string): Promise<AudioBuffer | null> {
    const ready = this.get(url);
    if (ready) return Promise.resolve(ready);
    const pending = this.inflight.get(url);
    if (pending) return pending;
    if (this.state(url) === 'failed') return Promise.resolve(null);
    const promise = this.decode(url).then(
      (buffer) => {
        this.inflight.delete(url);
        this.failures.delete(url);
        this.put(url, buffer);
        return buffer;
      },
      (error: unknown) => {
        this.inflight.delete(url);
        this.failures.set(url, Date.now());
        console.warn(`[broadcast] Could not load ${url}:`, error);
        return null;
      },
    );
    this.inflight.set(url, promise);
    return promise;
  }

  private put(url: string, buffer: AudioBuffer): void {
    const old = this.entries.get(url);
    if (old) this.total -= bufferBytes(old);
    this.entries.delete(url);
    this.entries.set(url, buffer);
    this.total += bufferBytes(buffer);
    // Evict least recently used, but always keep the newest entry.
    for (const [key, value] of this.entries) {
      if (this.total <= this.maxBytes || key === url) break;
      this.entries.delete(key);
      this.total -= bufferBytes(value);
    }
  }

  clear(): void {
    this.entries.clear();
    this.total = 0;
  }
}

/** fetch + decodeAudioData against a context. */
export function contextDecoder(ctx: BaseAudioContext, fetcher: (url: string) => Promise<Response> = (u) => fetch(u)): Decoder {
  return async (url) => {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return ctx.decodeAudioData(await response.arrayBuffer());
  };
}
