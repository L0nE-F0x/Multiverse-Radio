import { useMemo, type ReactNode } from 'react';
import { dimensionWeather } from '../content';
import { useRotatingSeed } from '../hooks/useRotatingSeed';
import { useStation, useStatus } from '../ui/select';
import { PinIcon } from './Icons';

/** Dimension weather on a little almanac card, with an icon guessed from the forecast. */
export function Weather() {
  const station = useStation();
  const status = useStatus();
  const seed = useRotatingSeed(`weather:${station.id}`, 3 * 60_000, status === 'playing');
  const forecast = useMemo(() => dimensionWeather(station, seed), [station, seed]);

  return (
    <section className="paper almanac" aria-labelledby="weather-heading">
      <span className="tape-corner" aria-hidden />
      <div className="almanac-head">
        <WeatherGlyph text={forecast} />
        <div className="min-w-0">
          <h2 id="weather-heading" className="paper-title">
            Dimension weather
          </h2>
          <p className="almanac-where">
            <PinIcon className="h-3 w-3 flex-none" />
            <span>{station.origin}</span>
          </p>
        </div>
      </div>
      <p className="almanac-text">{forecast}</p>
    </section>
  );
}

const GLYPHS: [RegExp, ReactNode][] = [
  [
    /rain|drizzle|wet|damp|shower|puddle/i,
    <g key="rain">
      <path d="M8 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5 3.3 3.3 0 0 1-.5 6.5Z" />
      <path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" />
    </g>,
  ],
  [
    /snow|frost|ice|freez|cold/i,
    <g key="snow">
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2" />
    </g>,
  ],
  [
    /fog|mist|haze|murk|cloud/i,
    <g key="fog">
      <path d="M4 9h13M7 13h13M4 17h11" />
    </g>,
  ],
  [
    /wind|gust|breez|gale|storm/i,
    <g key="wind">
      <path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8" />
    </g>,
  ],
  [
    /sun|clear|bright|warm|hot|heat/i,
    <g key="sun">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </g>,
  ],
];

function WeatherGlyph({ text }: { text: string }) {
  const glyph = GLYPHS.find(([pattern]) => pattern.test(text))?.[1] ?? (
    <g key="thermo">
      <path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z" />
      <path d="M12 9v7" />
    </g>
  );
  return (
    <svg viewBox="0 0 24 24" className="almanac-glyph" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {glyph}
    </svg>
  );
}
