// Proves the Content-Security-Policy in netlify.toml allows everything a Web Audio app
// needs, and still blocks what it should. The page under test is the real build, served
// with the real headers; the probes don't depend on the app's markup or code.

import { expect, test } from '@playwright/test';
import { cspViolations, deploy, installServiceWorker, watchPage } from './helpers';

/** 0.2 s of 16-bit mono silence as a WAV file. */
function wav(seconds = 0.2, rate = 8000): Buffer {
  const samples = Math.floor(seconds * rate);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

test('CSP allows audio, workers, blobs and the service worker, and blocks eval and inline scripts', async ({
  page,
}) => {
  const site = await deploy();
  try {
    site.write('voice/csp-probe/clip.mp3', wav()); // WAV bytes; browsers sniff the format
    const problems = await watchPage(page);
    await page.goto(`${site.url}/`);
    await installServiceWorker(page); // worker-src 'self'

    const results = await page.evaluate(async (wavBase64) => {
      const out: Record<string, string> = {};
      const probe = async (name: string, run: () => unknown) => {
        try {
          out[name] = String(await run());
        } catch (error) {
          out[name] = `blocked: ${(error as Error).name}`;
        }
      };
      const bytes = Uint8Array.from(atob(wavBase64), (c) => c.charCodeAt(0));
      const blobUrl = (parts: BlobPart[], type: string) => URL.createObjectURL(new Blob(parts, { type }));
      const ctx = new AudioContext();

      await probe('audio context', async () => {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        await ctx.resume();
        return ctx.state;
      });
      await probe('audio worklet from blob:', async () => {
        const source = "registerProcessor('probe', class extends AudioWorkletProcessor { process() { return true; } });";
        await ctx.audioWorklet.addModule(blobUrl([source], 'text/javascript'));
        new AudioWorkletNode(ctx, 'probe').connect(ctx.destination);
        return 'ok';
      });
      await probe('web worker from blob:', () => {
        const worker = new Worker(blobUrl(['onmessage = (e) => postMessage(e.data * 2)'], 'text/javascript'));
        return new Promise((resolve, reject) => {
          worker.onmessage = (event) => resolve(event.data);
          worker.onerror = (event) => reject(new Error(event.message));
          worker.postMessage(21);
        });
      });
      await probe('fetch + decode same-origin voice clip', async () => {
        const response = await fetch('/voice/csp-probe/clip.mp3');
        const audio = await ctx.decodeAudioData(await response.arrayBuffer());
        const source = ctx.createBufferSource();
        source.buffer = audio;
        source.connect(ctx.destination);
        source.start();
        return audio.duration > 0 ? 'ok' : 'empty';
      });
      const playElement = async (src: string, throughWebAudio = false) => {
        const audio = new Audio();
        audio.src = src;
        if (throughWebAudio) ctx.createMediaElementSource(audio).connect(ctx.destination);
        else audio.muted = true;
        await audio.play();
        audio.pause();
        return 'ok';
      };
      await probe('<audio> same-origin via Web Audio', () => playElement('/voice/csp-probe/clip.mp3', true));
      await probe('<audio> blob:', () => playElement(blobUrl([bytes], 'audio/wav')));
      await probe('<audio> data:', () => playElement(`data:audio/wav;base64,${wavBase64}`));
      await probe('fetch blob:', async () => (await fetch(blobUrl(['hi'], 'text/plain'))).text());
      await probe('fetch data:', async () => (await fetch('data:text/plain,hi')).text());
      await probe('img blob: from canvas', async () => {
        const canvas = document.createElement('canvas');
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
        const img = new Image();
        img.src = URL.createObjectURL(blob!);
        await img.decode();
        return 'ok';
      });
      await probe('inline style attribute', () => {
        const el = document.createElement('div');
        el.setAttribute('style', 'color: rgb(1, 2, 3)');
        document.body.append(el);
        const color = getComputedStyle(el).color;
        el.remove();
        return color;
      });

      // These must be blocked.
      await probe('eval', () => eval('1 + 1'));
      await probe('inline script', () => {
        const script = document.createElement('script');
        script.textContent = 'window.__inlineRan = true';
        document.body.append(script);
        return (window as unknown as { __inlineRan?: boolean }).__inlineRan ? 'ran' : 'blocked';
      });
      await probe('cross-origin fetch', async () => (await fetch('https://example.com/')).status);
      await ctx.close();
      return out;
    }, wav().toString('base64'));

    expect(results).toEqual({
      'audio context': 'running',
      'audio worklet from blob:': 'ok',
      'web worker from blob:': '42',
      'fetch + decode same-origin voice clip': 'ok',
      '<audio> same-origin via Web Audio': 'ok',
      '<audio> blob:': 'ok',
      '<audio> data:': 'ok',
      'fetch blob:': 'hi',
      'fetch data:': 'hi',
      'img blob: from canvas': 'ok',
      'inline style attribute': 'rgb(1, 2, 3)',
      eval: 'blocked: EvalError',
      'inline script': 'blocked',
      'cross-origin fetch': 'blocked: TypeError',
    });

    const violations = (await cspViolations(page)).map((v) => v.split(' ')[0]).sort();
    expect(violations).toEqual(['connect-src', 'script-src', 'script-src-elem']);
    // Only the three deliberate violations may show up in the console.
    expect(problems.filter((p) => !/Content Security Policy|Content-Security-Policy|Failed to fetch/i.test(p))).toEqual([]);
  } finally {
    await site.close();
  }
});
