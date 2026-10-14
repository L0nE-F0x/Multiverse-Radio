import { SHIP } from '../stations/ship';
import { Panel } from './Panel';

const KEYS: [string[], string][] = [
  [['Space'], 'Power on · play · pause'],
  [['←', '→'], 'Fine-tune 0.05 MHz'],
  [['⇧ ←', '⇧ →'], 'Previous / next station (also ↓ ↑)'],
  [['S'], 'Scan for a station'],
  [['N'], 'Skip to the next segment'],
  [['M'], 'Mute'],
  [['−', '+'], 'Volume down / up'],
  [['G'], 'Station guide'],
  [['L'], "Ship's log"],
  [['O'], 'Offline: prepare for dead space'],
  [['C'], 'Captions on / off'],
  [['H'], 'Hide the HUD (tap or H to restore)'],
  [['?'], 'This manual'],
];

const TOUCH: [string, string][] = [
  ['Tap the scene', 'Hide or show the console'],
  ['Swipe the strip', 'Fine-tune; flick it for the next station'],
  ['Drag the handle up', 'The full console: dial, readouts, every key'],
  ['Drag it down', 'Back to the view (or tap above it)'],
  ['Lock screen', 'Play, pause, next and previous station'],
];

const NOTES: [string, string][] = [
  ['The dial', 'Drag, flick or scroll the scale under the needle. Shift-scroll moves ten steps. The listed stations sit between 87.5 and 118 MHz.'],
  ['The Outer Band', 'Since the heading correction, 108 to 118 MHz has come into range. The stations there are listed, if not entirely accounted for. At least one of them moves.'],
  ['The deep band', 'The dial continues from 76 to 160 MHz. Beyond the main and outer bands, signals are unlicensed, intermittent or unexplained. Log what you find.'],
  ['Reception', 'Signal is strongest at a station’s exact frequency and falls away to either side. A weak signal is still a signal.'],
  ['Leave it on', 'With the receiver on air, the HUD dims and withdraws after a few quiet seconds. Any input brings it back.'],
  [SHIP.computer.name, 'The Nightjar’s computer keeps the log and makes the occasional announcement. It is calm, precise and polite. Report any change in this to no one in particular.'],
];

/** The operator's manual: keys, a few notes, the maker's small print. */
export default function Manual() {
  return (
    <Panel id="help" kicker={`${SHIP.maker} · Intercept console Mk VII`} title="Operator's manual">
      <div className="manual">
        <section className="manual-touch" aria-labelledby="manual-touch">
          <h3 id="manual-touch" className="dir-heading">
            Touch
          </h3>
          <dl className="manual-keys">
            {TOUCH.map(([gesture, what]) => (
              <div key={gesture}>
                <dt>{gesture}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="manual-keyboard" aria-labelledby="manual-keys">
          <h3 id="manual-keys" className="dir-heading">
            Keyboard
          </h3>
          <dl className="manual-keys">
            {KEYS.map(([keys, what]) => (
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
        </section>
        <section aria-labelledby="manual-notes">
          <h3 id="manual-notes" className="dir-heading">
            Operating notes
          </h3>
          <dl className="manual-notes">
            {NOTES.map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <p className="manual-small" data-autofocus="false">
        {SHIP.maker}, instrument makers. This console contains no user-serviceable parts. It is not responsible for anything
        heard, overheard or understood on any frequency, in any dimension, during any shift.
      </p>
    </Panel>
  );
}
