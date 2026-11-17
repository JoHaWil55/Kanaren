import React from 'react';
import {
  Bike,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  Footprints,
  Map as MapIcon,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { CruiseStop, Excursion } from '../types';
import {
  buildGoogleMapsExcursionUrl,
  calculateSafetySchedule,
  formatDurationGerman,
} from '../utils/timeSafety';

interface SavedListViewProps {
  stops: CruiseStop[];
  savedExcursions: Excursion[];
  isOnline: boolean;
  onSelectExcursion: (excursion: Excursion) => void;
  onOpenOnMap: (excursion: Excursion) => void;
  onRemoveSaved: (excursionId: string) => void;
}

export const SavedListView: React.FC<SavedListViewProps> = ({
  stops,
  savedExcursions,
  isOnline,
  onSelectExcursion,
  onOpenOnMap,
  onRemoveSaved,
}) => {
  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-[#142634]">Merkliste &amp; Offline-Speicher</h1>
        <p className="text-sm text-[#526473] mt-1">
          Alle hier gespeicherten Ausflüge, Wegpunkte, Adressen und Liegezeiten bleiben auf deinem Smartphone auch ohne Internet verfügbar.
        </p>
      </div>

      {/* Transparent Offline Availability Overview */}
      <div className="rounded-2xl border border-[#E2DDD2] bg-white p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="space-y-1.5">
          <p className="font-semibold text-sm text-[#1E7A6D] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Offline auf dem Gerät verfügbar</span>
          </p>
          <ul className="space-y-1 text-[#324656] list-disc list-inside">
            <li>Gesamte AIDAblu-Reiseroute &amp; angepasste Liegezeiten</li>
            <li>Alle gespeicherten Ausflüge inkl. Beschreibungen &amp; Rückkehrzeiten</li>
            <li>Komplette Wegpunktlisten mit Koordinaten &amp; Adressen</li>
            <li>Bereits abgerufene Wetter-, Verleih- &amp; KI-Recherchen</li>
          </ul>
        </div>
        <div className="space-y-1.5">
          <p className="font-semibold text-sm text-[#526473] flex items-center gap-1.5">
            <WifiOff className="w-4 h-4" />
            <span>Nur mit Internetverbindung ({isOnline ? 'aktuell online' : 'aktuell offline'})</span>
          </p>
          <ul className="space-y-1 text-[#526473] list-disc list-inside">
            <li>Live-Anfragen an „Mein Kanaren-Reiseberater“</li>
            <li>Neue Google-Maps-Kartenkacheln &amp; Live-Routenberechnung</li>
            <li>Aktuelle Wettervorhersage &amp; Live-Suche nach Fahrradverleihern</li>
          </ul>
        </div>
      </div>

      {savedExcursions.length === 0 ? (
        <div className="rounded-2xl border border-[#E2DDD2] bg-white p-8 text-center space-y-2">
          <div className="w-11 h-11 rounded-full bg-[#EFECE4] text-[#0B5D7A] mx-auto flex items-center justify-center">
            <Bookmark className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-[#142634]">Noch keine Ausflüge gespeichert</h2>
          <p className="text-sm text-[#526473] max-w-md mx-auto">
            Öffne einen Hafen oder einen Ausflugsvorschlag und tippe auf „Ausflug speichern“, um ihn für die Offline-Nutzung an Bord abzulegen.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {savedExcursions.map((exc) => {
            const stop = stops.find((s) => s.id === exc.portId);
            const safety = stop ? calculateSafetySchedule(stop, exc) : null;
            const mapsUrl = buildGoogleMapsExcursionUrl(exc);

            return (
              <div
                key={exc.id}
                className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#526473] tabular-nums">
                      <span>{stop ? `${stop.dateDisplay} · ${stop.island}` : exc.portId}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        {exc.mode === 'BICYCLE' ? (
                          <Bike className="w-3.5 h-3.5 text-[#0B5D7A]" />
                        ) : (
                          <Footprints className="w-3.5 h-3.5 text-[#0B5D7A]" />
                        )}
                        {exc.mode === 'BICYCLE' ? 'Leihfahrrad' : 'Zu Fuß'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{exc.distanceKm.toFixed(1).replace('.', ',')} km</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDurationGerman(exc.totalDurationMinutes)}</span>
                    </div>
                    <h2 className="text-lg font-semibold text-[#142634] mt-1">{exc.title}</h2>
                    {safety && stop && (
                      <p className="text-xs text-[#324656] mt-1 tabular-nums">
                        Empfohlener Start: {safety.plannedStartTime} Uhr · Rückkehr ca.{' '}
                        {safety.estimatedReturnTime} Uhr (Abfahrt Schiff: {stop.departureTime || '–'} Uhr)
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveSaved(exc.id)}
                    aria-label={`${exc.title} entfernen`}
                    className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-[#526473] hover:bg-[#EFECE4] hover:text-red-700 inline-flex items-center gap-1.5 self-start transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Entfernen</span>
                  </button>
                </div>

                {/* Offline Waypoint Summary */}
                <div className="rounded-xl bg-[#F7F6F2] p-3.5 text-xs text-[#324656]">
                  <p className="font-semibold text-[#142634] mb-1.5">
                    Gespeicherte Wegpunkte ({exc.waypoints.length})
                  </p>
                  <p className="leading-relaxed">
                    {exc.waypoints.map((w, i) => `${i + 1}. ${w.name}`).join(' → ')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onSelectExcursion(exc)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0B5D7A] text-white text-xs font-medium hover:bg-[#094C65] transition"
                  >
                    Details &amp; Zeitplan öffnen
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenOnMap(exc)}
                    className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D9D2C5] bg-white text-[#142634] text-xs font-medium hover:bg-[#EFECE4] inline-flex items-center gap-1.5 transition"
                  >
                    <MapIcon className="w-3.5 h-3.5 text-[#0B5D7A]" />
                    <span>Auf Karte zeigen</span>
                  </button>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D9D2C5] bg-white text-[#142634] text-xs font-medium hover:bg-[#EFECE4] inline-flex items-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#0B5D7A]" />
                    <span>Google Maps</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
