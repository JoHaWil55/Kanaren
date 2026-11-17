import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map as GoogleMapView,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Anchor,
  Bike,
  Crosshair,
  ExternalLink,
  Footprints,
  Loader2,
  MapPin,
  Navigation,
  WifiOff,
} from 'lucide-react';
import { CruiseStop, Excursion, ExcursionWaypoint, LatLng } from '../types';
import { buildGoogleMapsExcursionUrl, formatDurationGerman } from '../utils/timeSafety';
import { computeLiveRoute } from '../services/apiClient';
import { VerificationLabel } from './VerificationBadge';

interface PortMapViewProps {
  mapsApiKey: string;
  isOnline: boolean;
  stop: CruiseStop;
  excursions: Excursion[];
  selectedExcursion: Excursion | null;
  onSelectExcursion: (excursion: Excursion) => void;
  onExcursionUpdated: (updated: Excursion) => void;
}

function decodeEncodedPolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

interface GoogleMapsPolyline {
  setMap: (map: unknown) => void;
}

interface GoogleMapsLatLngBounds {
  extend: (pt: LatLng) => void;
}

interface GoogleMapsNamespace {
  maps: {
    LatLngBounds: new () => GoogleMapsLatLngBounds;
    Polyline: new (opts: {
      path: LatLng[];
      geodesic: boolean;
      strokeColor: string;
      strokeOpacity: number;
      strokeWeight: number;
      icons?: Array<{
        icon: { path: string; strokeOpacity: number; scale: number };
        offset: string;
        repeat: string;
      }>;
      map: unknown;
    }) => GoogleMapsPolyline;
  };
}

interface RouteOverlayProps {
  stop: CruiseStop;
  excursion: Excursion | null;
  userPosition: LatLng | null;
}

const RouteOverlay: React.FC<RouteOverlayProps> = ({ stop, excursion, userPosition }) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylineRef = useRef<GoogleMapsPolyline | null>(null);
  const returnPolylineRef = useRef<GoogleMapsPolyline | null>(null);
  const [activeWaypoint, setActiveWaypoint] = useState<ExcursionWaypoint | null>(null);
  const [terminalInfoOpen, setTerminalInfoOpen] = useState(false);

  // Recenter camera when port or selected excursion changes
  useEffect(() => {
    const g = (window as unknown as { google?: GoogleMapsNamespace }).google;
    if (!map || !g?.maps) return;

    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    if (returnPolylineRef.current) {
      returnPolylineRef.current.setMap(null);
      returnPolylineRef.current = null;
    }

    if (!excursion) {
      map.panTo(stop.terminalCoords);
      map.setZoom(14);
      return;
    }

    const bounds = new g.maps.LatLngBounds();
    bounds.extend(stop.terminalCoords);
    for (const wp of excursion.waypoints) {
      bounds.extend(wp.coords);
    }
    if (userPosition) {
      bounds.extend(userPosition);
    }

    let pathPoints: LatLng[] = [];
    if (excursion.encodedPolyline) {
      pathPoints = decodeEncodedPolyline(excursion.encodedPolyline);
      for (const pt of pathPoints) bounds.extend(pt);
    } else {
      pathPoints = excursion.waypoints.map((w) => w.coords);
      if (excursion.isRoundTrip && excursion.waypoints.length > 1) {
        pathPoints.push(excursion.waypoints[0].coords);
      }
    }

    if (pathPoints.length >= 2) {
      const mainLine = new g.maps.Polyline({
        path: pathPoints,
        geodesic: true,
        strokeColor: excursion.mode === 'BICYCLE' ? '#1E7A6D' : '#0B5D7A',
        strokeOpacity: excursion.encodedPolyline ? 0.95 : 0.72,
        strokeWeight: excursion.encodedPolyline ? 5 : 4,
        map,
      });
      polylineRef.current = mainLine;

      // Highlight final return segment back to the terminal
      if (excursion.isRoundTrip && excursion.waypoints.length >= 2) {
        const lastWp = excursion.waypoints[excursion.waypoints.length - 1].coords;
        const returnLine = new g.maps.Polyline({
          path: [lastWp, stop.terminalCoords],
          geodesic: true,
          strokeColor: '#B45309',
          strokeOpacity: 0.85,
          strokeWeight: 3,
          icons: [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
              offset: '0',
              repeat: '14px',
            },
          ],
          map,
        });
        returnPolylineRef.current = returnLine;
      }
    }

    map.fitBounds(bounds as unknown as Parameters<typeof map.fitBounds>[0], 48);

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
      if (returnPolylineRef.current) {
        returnPolylineRef.current.setMap(null);
        returnPolylineRef.current = null;
      }
    };
  }, [map, routesLib, stop, excursion, userPosition]);

  return (
    <>
      {/* Cruise Terminal Pin */}
      <AdvancedMarker
        position={stop.terminalCoords}
        title={stop.terminalName}
        onClick={() => {
          setActiveWaypoint(null);
          setTerminalInfoOpen(true);
        }}
      >
        <Pin background="#0B5D7A" borderColor="#083B52" glyphColor="#FFFFFF" scale={1.15}>
          <Anchor className="w-4 h-4 text-white" />
        </Pin>
      </AdvancedMarker>

      {terminalInfoOpen && (
        <InfoWindow
          position={stop.terminalCoords}
          onCloseClick={() => setTerminalInfoOpen(false)}
        >
          <div className="p-1 max-w-[220px]">
            <p className="font-semibold text-sm text-[#142634]">{stop.terminalName}</p>
            <p className="text-xs text-[#526473] mt-1">
              Start- &amp; Endpunkt am Schiff ({stop.island})
            </p>
          </div>
        </InfoWindow>
      )}

      {/* Excursion Waypoint Markers */}
      {excursion?.waypoints.map((wp, idx) => (
        <AdvancedMarker
          key={wp.id}
          position={wp.coords}
          title={`${idx + 1}. ${wp.name}`}
          onClick={() => {
            setTerminalInfoOpen(false);
            setActiveWaypoint(wp);
          }}
        >
          <div className="w-7 h-7 rounded-full bg-white border-2 border-[#0B5D7A] text-[#0B5D7A] font-semibold text-xs flex items-center justify-center shadow-md tabular-nums">
            {idx + 1}
          </div>
        </AdvancedMarker>
      ))}

      {activeWaypoint && (
        <InfoWindow
          position={activeWaypoint.coords}
          onCloseClick={() => setActiveWaypoint(null)}
        >
          <div className="p-1 max-w-[230px]">
            <p className="font-semibold text-sm text-[#142634]">{activeWaypoint.name}</p>
            <p className="text-xs text-[#526473] mt-1">{activeWaypoint.description}</p>
            <p className="text-xs text-[#0B5D7A] mt-1.5 font-medium tabular-nums">
              Aufenthalt: ca. {activeWaypoint.stayMinutes} Min.
            </p>
          </div>
        </InfoWindow>
      )}

      {/* Optional User GPS Marker */}
      {userPosition && (
        <AdvancedMarker position={userPosition} title="Dein aktueller Standort">
          <div className="w-4 h-4 rounded-full bg-[#0B5D7A] border-2 border-white shadow-md ring-4 ring-[#0B5D7A]/25" />
        </AdvancedMarker>
      )}
    </>
  );
};

export const PortMapView: React.FC<PortMapViewProps> = ({
  mapsApiKey,
  isOnline,
  stop,
  excursions,
  selectedExcursion,
  onSelectExcursion,
  onExcursionUpdated,
}) => {
  const [userPosition, setUserPosition] = useState<LatLng | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeSteps, setRouteSteps] = useState<
    Array<{ instruction: string; distanceMeters: number; durationSeconds: number }>
  >([]);

  const activeExcursion = useMemo(
    () => selectedExcursion || excursions[0] || null,
    [selectedExcursion, excursions]
  );

  const handleRequestLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Standortbestimmung wird von diesem Gerät nicht unterstützt.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setGeoError('Standortzugriff nicht erlaubt oder derzeit nicht verfügbar.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleComputeLiveRoute = async () => {
    if (!activeExcursion) return;
    if (!isOnline) {
      setRouteError('Keine Internetverbindung. Für die Live-Routenberechnung wird Internet benötigt.');
      return;
    }
    setIsComputing(true);
    setRouteError(null);
    try {
      const result = await computeLiveRoute(activeExcursion);
      const km = Math.round((result.distanceMeters / 1000) * 10) / 10;
      const movingMin = Math.max(5, Math.round(result.durationSeconds / 60));
      const staySum = activeExcursion.waypoints.reduce((acc, w) => acc + w.stayMinutes, 0);
      const totalMin = Math.min(movingMin + staySum, 180);

      const updated: Excursion = {
        ...activeExcursion,
        distanceKm: km,
        distanceStatus: 'verifiziert',
        movingMinutes: movingMin,
        totalDurationMinutes: totalMin,
        encodedPolyline: result.encodedPolyline,
        elevation: result.elevationSummary
          ? {
              ...result.elevationSummary,
              status: 'verifiziert',
            }
          : activeExcursion.elevation,
        lastVerifiedAt: new Date().toISOString(),
        isLiveComputed: true,
      };
      setRouteSteps(result.steps || []);
      onExcursionUpdated(updated);
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : 'Routenberechnung fehlgeschlagen.');
    } finally {
      setIsComputing(false);
    }
  };

  const googleMapsAppUrl = activeExcursion
    ? buildGoogleMapsExcursionUrl(activeExcursion)
    : `https://www.google.com/maps/search/?api=1&query=${stop.terminalCoords.lat},${stop.terminalCoords.lng}`;

  return (
    <div className="space-y-4">
      {/* Excursion Switcher for this port */}
      {excursions.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {excursions.map((exc) => {
            const isActive = activeExcursion?.id === exc.id;
            return (
              <button
                key={exc.id}
                type="button"
                onClick={() => {
                  setRouteSteps([]);
                  setRouteError(null);
                  onSelectExcursion(exc);
                }}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium transition whitespace-nowrap shrink-0 flex items-center gap-2 border ${
                  isActive
                    ? 'bg-[#0B5D7A] text-white border-[#0B5D7A]'
                    : 'bg-white text-[#142634] border-[#E2DDD2] hover:bg-[#EFECE4]'
                }`}
              >
                {exc.mode === 'BICYCLE' ? (
                  <Bike className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Footprints className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="truncate max-w-[200px]">{exc.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Map Canvas or Offline / No-Key Fallback */}
      {isOnline && mapsApiKey ? (
        <div className="relative rounded-2xl overflow-hidden border border-[#E2DDD2] bg-[#EFECE4]">
          <div className="w-full h-[380px] sm:h-[460px]">
            <APIProvider
              apiKey={mapsApiKey}
              language="de"
              region="ES"
              libraries={['marker', 'routes', 'geometry']}
            >
              <GoogleMapView
                mapId="DEMO_MAP_ID"
                defaultCenter={stop.terminalCoords}
                defaultZoom={14}
                gestureHandling="greedy"
                disableDefaultUI={false}
                streetViewControl={false}
                mapTypeControl={false}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                className="w-full h-full"
              >
                <RouteOverlay
                  stop={stop}
                  excursion={activeExcursion}
                  userPosition={userPosition}
                />
              </GoogleMapView>
            </APIProvider>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E2DDD2] bg-white p-6 text-center space-y-3">
          <div className="w-11 h-11 rounded-full bg-[#EFECE4] text-[#0B5D7A] mx-auto flex items-center justify-center">
            <WifiOff className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-[#142634]">
            {!isOnline
              ? 'Offline-Modus aktiv – gespeicherte Wegpunktliste'
              : 'Kartenansicht wird vorbereitet'}
          </h3>
          <p className="text-sm text-[#526473] max-w-md mx-auto">
            {!isOnline
              ? 'Google-Maps-Kartenkacheln werden offline gemäß Nutzungsbedingungen nicht zwischengespeichert. Alle Wegpunkte, Koordinaten und Entfernungen bleiben unten vollständig verfügbar.'
              : 'Google Maps API ist aktuell nicht aktiv. Du kannst die vollständige Route trotzdem direkt in der Google Maps App auf deinem Smartphone öffnen.'}
          </p>
        </div>
      )}

      {/* Action Bar under Map */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => void handleComputeLiveRoute()}
          disabled={isComputing || !activeExcursion || !isOnline}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0B5D7A] text-white text-sm font-medium hover:bg-[#094C65] disabled:opacity-50 inline-flex items-center gap-2 transition"
        >
          {isComputing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Navigation className="w-4 h-4" />
          )}
          <span>
            {activeExcursion?.isLiveComputed
              ? 'Route & Höhenprofil aktualisieren'
              : 'Route & Höhenprofil live berechnen'}
          </span>
        </button>

        <button
          type="button"
          onClick={handleRequestLocation}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#D9D2C5] bg-white text-[#142634] text-sm font-medium hover:bg-[#EFECE4] inline-flex items-center gap-2 transition"
        >
          <Crosshair className="w-4 h-4 text-[#0B5D7A]" />
          <span>{userPosition ? 'Standort aktualisieren' : 'Meinen Standort zeigen'}</span>
        </button>

        <a
          href={googleMapsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#D9D2C5] bg-white text-[#142634] text-sm font-medium hover:bg-[#EFECE4] inline-flex items-center gap-2 transition"
        >
          <ExternalLink className="w-4 h-4 text-[#0B5D7A]" />
          <span>In Google Maps öffnen</span>
        </a>
      </div>

      {(routeError || geoError) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {routeError || geoError}
        </div>
      )}

      {/* Active Route Metrics & Offline-Ready Waypoint List */}
      {activeExcursion && (
        <div className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#142634]">{activeExcursion.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#526473] tabular-nums">
                <span>
                  {activeExcursion.mode === 'BICYCLE' ? 'Leihfahrrad' : 'Zu Fuß'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeExcursion.distanceKm.toFixed(1).replace('.', ',')} km Strecke</span>
                <span aria-hidden="true">·</span>
                <span>Reine Geh-/Fahrzeit ca. {formatDurationGerman(activeExcursion.movingMinutes)}</span>
                <span aria-hidden="true">·</span>
                <span>Höhenmeter +{activeExcursion.elevation.totalAscentMeters} m</span>
              </div>
            </div>
            <VerificationLabel status={activeExcursion.distanceStatus} />
          </div>

          <div className="border-t border-[#EFECE4] pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#526473] mb-2.5">
              Wegpunkte &amp; Rückweg zum Schiff ({stop.terminalName})
            </h4>
            <ol className="space-y-2.5">
              {activeExcursion.waypoints.map((wp, index) => (
                <li key={wp.id} className="flex items-start gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-[#EFECE4] text-[#0B5D7A] font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[#142634]">{wp.name}</p>
                    <p className="text-xs text-[#526473]">
                      {wp.description} · Koordinaten:{' '}
                      <span className="font-mono tabular-nums">
                        {wp.coords.lat.toFixed(4)}, {wp.coords.lng.toFixed(4)}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
              {activeExcursion.isRoundTrip && (
                <li className="flex items-start gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-[#B45309]/15 text-[#B45309] font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <p className="font-medium text-[#142634]">
                      Rückroute zum Kreuzfahrtterminal ({stop.terminalName})
                    </p>
                    <p className="text-xs text-[#526473]">
                      Rundweg endet wieder direkt am Schiffsanleger.
                    </p>
                  </div>
                </li>
              )}
            </ol>
          </div>

          {routeSteps.length > 0 && (
            <div className="border-t border-[#EFECE4] pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#526473] mb-2">
                Berechnete Wegbeschreibungen (Google Routes API)
              </h4>
              <ol className="space-y-1.5 max-h-56 overflow-y-auto pr-1 text-xs text-[#324656]">
                {routeSteps.map((step, i) => (
                  <li key={i} className="flex justify-between gap-3 py-1 border-b border-[#F7F6F2]">
                    <span>{step.instruction}</span>
                    <span className="text-[#526473] shrink-0 tabular-nums">
                      {step.distanceMeters} m
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
