import { useUi } from '../ui/store';
import { CloseIcon } from './Icons';
import { Sheet } from './Sheet';

const close = () => useUi.setState({ helpOpen: false });

const SHORTCUTS: [string[], string][] = [
  [['Space'], 'Power on · play · pause'],
  [['←', '→'], 'Previous / next station'],
  [['S'], 'Scan the multiverse (random station)'],
  [['N'], 'Skip to the next segment'],
  [['M'], 'Mute'],
  [['−', '+'], 'Volume down / up'],
  [['C'], 'Captions on / off'],
  [['G'], 'Channel guide'],
  [['F'], 'Leave it on (ambient mode)'],
  [['?'], 'This manual'],
];

const TROUBLESHOOTING: [string, string][] = [
  ['The radio is talking to me.', 'That is the main feature. You may talk back. It will not hear you, but it appreciates the effort.'],
  ['Reception is fuzzy.', 'Wiggle the antenna. If that fails, a firm but loving smack on the marked spot.'],
  ['I tuned away and the show kept going without me.', 'Every station is live, all the time, whether or not anyone is listening. Especially if no one is listening.'],
  ['I heard something on 107.1.', 'There is no 107.1. Please stop listening to 107.1.'],
  ['My cat is staring at the radio.', 'Your cat can hear Numbers Station Ω on every frequency. This is normal. Do not let it reply.'],
];

/** The owner's manual (abridged, slightly water-damaged). */
export function HelpDialog() {
  const open = useUi((s) => s.helpOpen);
  return (
    <Sheet open={open} onClose={close} labelledBy="help-title" className="manual">
      <div className="manual-page">
        <header className="manual-header">
          <div>
            <p className="guide-kicker">Yondertone YT-22 · Owner's manual · Abridged</p>
            <h2 id="help-title" className="guide-title">
              How to work it
            </h2>
          </div>
          <button type="button" className="guide-close" onClick={close} aria-label="Close the manual" data-autofocus="true">
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="manual-columns">
          <section aria-labelledby="manual-keys">
            <h3 id="manual-keys" className="manual-h3">
              Keyboard
            </h3>
            <dl className="manual-keys">
              {SHORTCUTS.map(([keys, what]) => (
                <div key={what}>
                  <dt>
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
            <p className="manual-note">
              Drag the big knob or the needle to tune. Drag, scroll or arrow-key the volume knob. Media keys work too.
            </p>
          </section>

          <section aria-labelledby="manual-trouble">
            <h3 id="manual-trouble" className="manual-h3">
              Troubleshooting
            </h3>
            <dl className="manual-faq">
              {TROUBLESHOOTING.map(([q, a]) => (
                <div key={q}>
                  <dt>{q}</dt>
                  <dd>{a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <p className="manual-small">
          Gloaming &amp; Daughters Wireless Co. accepts no responsibility for anything heard, overheard or understood.
          Do not immerse in water, time or other dimensions. Contains no user-serviceable parts, and several that are
          merely user-tolerable.
        </p>
      </div>
    </Sheet>
  );
}
