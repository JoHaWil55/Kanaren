import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MAPS_SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

function getMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.MAPS_API_KEY ||
    ''
  ).trim();
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseDurationSeconds(durationStr?: string): number {
  if (!durationStr) return 0;
  const match = durationStr.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.round(Number(match[1])) : 0;
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
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
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function weatherCodeToGerman(code: number): string {
  if (code === 0) return 'Klarer Himmel';
  if (code === 1) return 'Überwiegend sonnig';
  if (code === 2) return 'Leicht bewölkt';
  if (code === 3) return 'Bedeckt';
  if (code === 45 || code === 48) return 'Nebel / Diesig';
  if (code >= 51 && code <= 57) return 'Nieselregen';
  if (code >= 61 && code <= 67) return 'Regen';
  if (code >= 71 && code <= 77) return 'Graupel / Schnee';
  if (code >= 80 && code <= 82) return 'Regenschauer';
  if (code >= 95) return 'Gewitter';
  return 'Wechselhaft';
}

function extractGroundingSources(response: unknown): Array<{ title: string; url: string }> {
  const r = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
          maps?: { uri?: string; title?: string };
        }>;
      };
    }>;
  };
  const chunks = r?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set<string>();
  const sources: Array<{ title: string; url: string }> = [];

  for (const chunk of chunks) {
    const uri = chunk.web?.uri || chunk.maps?.uri;
    const title = chunk.web?.title || chunk.maps?.title || uri;
    if (uri && title && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title, url: uri });
    }
  }
  return sources;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // 1. Safe runtime Maps config (never embeds key in static source bundle)
  app.get('/api/config/maps', (_req, res) => {
    const apiKey = getMapsApiKey();
    res.json({
      configured: Boolean(apiKey),
      apiKey,
    });
  });

  // 2. Real Google Maps Routes API v2 + Elevation API proxy
  app.post('/api/routes/compute', async (req, res) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      return res.status(503).json({
        error: 'Google Maps API ist aktuell nicht konfiguriert.',
        code: 'MAPS_NOT_CONFIGURED',
      });
    }

    try {
      const body = req.body as {
        origin?: { lat: number; lng: number };
        destination?: { lat: number; lng: number };
        intermediates?: Array<{ lat: number; lng: number }>;
        travelMode?: 'WALK' | 'BICYCLE';
      };

      if (!body.origin || !body.destination) {
        return res.status(400).json({ error: 'Start- und Zielkoordinaten fehlen.' });
      }

      const travelMode = body.travelMode === 'BICYCLE' ? 'BICYCLE' : 'WALK';

      const routePayload: Record<string, unknown> = {
        origin: {
          location: {
            latLng: { latitude: body.origin.lat, longitude: body.origin.lng },
          },
        },
        destination: {
          location: {
            latLng: { latitude: body.destination.lat, longitude: body.destination.lng },
          },
        },
        travelMode,
        languageCode: 'de',
        units: 'METRIC',
      };

      if (Array.isArray(body.intermediates) && body.intermediates.length > 0) {
        routePayload.intermediates = body.intermediates.map((pt) => ({
          location: {
            latLng: { latitude: pt.lat, longitude: pt.lng },
          },
        }));
      }

      const fieldMask = [
        'routes.distanceMeters',
        'routes.duration',
        'routes.polyline.encodedPolyline',
        'routes.viewport',
        'routes.legs.distanceMeters',
        'routes.legs.duration',
        'routes.legs.steps.distanceMeters',
        'routes.legs.steps.staticDuration',
        'routes.legs.steps.navigationInstruction',
      ].join(',');

      const routesResp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
          'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
        },
        body: JSON.stringify(routePayload),
      });

      const routesJson = (await routesResp.json()) as {
        routes?: Array<{
          distanceMeters?: number;
          duration?: string;
          polyline?: { encodedPolyline?: string };
          viewport?: {
            low?: { latitude: number; longitude: number };
            high?: { latitude: number; longitude: number };
          };
          legs?: Array<{
            steps?: Array<{
              distanceMeters?: number;
              staticDuration?: string;
              navigationInstruction?: { instructions?: string; maneuver?: string };
            }>;
          }>;
        }>;
        error?: { code?: number; message?: string; status?: string };
      };

      if (!routesResp.ok) {
        const status = routesResp.status === 429 ? 429 : routesResp.status;
        return res.status(status).json({
          error: routesJson.error?.message || 'Routenberechnung über Google Routes API fehlgeschlagen.',
          status: routesJson.error?.status || 'ROUTE_ERROR',
        });
      }

      const primary = routesJson.routes?.[0];
      if (!primary) {
        return res.status(404).json({
          error: 'Für die ausgewählte Fortbewegungsart wurde keine begeh- bzw. befahrbare Route gefunden.',
        });
      }

      const encodedPolyline = primary.polyline?.encodedPolyline || '';
      const distanceMeters = primary.distanceMeters || 0;
      const durationSeconds = parseDurationSeconds(primary.duration);

      const steps: Array<{ instruction: string; distanceMeters: number; durationSeconds: number }> = [];
      for (const leg of primary.legs || []) {
        for (const step of leg.steps || []) {
          const instruction = step.navigationInstruction?.instructions;
          if (instruction) {
            steps.push({
              instruction,
              distanceMeters: step.distanceMeters || 0,
              durationSeconds: parseDurationSeconds(step.staticDuration),
            });
          }
        }
      }

      // Query Elevation API along decoded path (up to 32 sampled points)
      let elevationSummary: {
        minMeters: number;
        maxMeters: number;
        totalAscentMeters: number;
        totalDescentMeters: number;
        samples: Array<{ distanceRatio: number; elevation: number }>;
      } | null = null;

      if (encodedPolyline) {
        try {
          const decoded = decodePolyline(encodedPolyline);
          const stepSample = Math.max(1, Math.floor(decoded.length / 24));
          const sampledVertices = decoded.filter((_, i) => i % stepSample === 0).slice(0, 24);
          if (sampledVertices.length >= 2) {
            const pathParam = sampledVertices.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
            const elevParams = new URLSearchParams({
              path: pathParam,
              samples: '20',
              key: apiKey,
              solution_id: MAPS_SOLUTION_ID,
            });
            const elevResp = await fetch(
              `https://maps.googleapis.com/maps/api/elevation/json?${elevParams.toString()}`,
              {
                headers: { 'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID },
              }
            );
            const elevData = (await elevResp.json()) as {
              status?: string;
              results?: Array<{ elevation: number }>;
            };
            if (elevData.status === 'OK' && Array.isArray(elevData.results) && elevData.results.length > 0) {
              const elevations = elevData.results.map((r) => r.elevation);
              let ascent = 0;
              let descent = 0;
              for (let i = 1; i < elevations.length; i++) {
                const diff = elevations[i] - elevations[i - 1];
                if (diff > 0) ascent += diff;
                else descent += Math.abs(diff);
              }
              elevationSummary = {
                minMeters: Math.round(Math.min(...elevations)),
                maxMeters: Math.round(Math.max(...elevations)),
                totalAscentMeters: Math.round(ascent),
                totalDescentMeters: Math.round(descent),
                samples: elevations.map((el, idx) => ({
                  distanceRatio: elevations.length > 1 ? idx / (elevations.length - 1) : 0,
                  elevation: Math.round(el),
                })),
              };
            }
          }
        } catch {
          // Elevation is an enrichment; route still succeeds without it.
        }
      }

      return res.json({
        distanceMeters,
        durationSeconds,
        encodedPolyline,
        viewport: primary.viewport || null,
        steps,
        elevationSummary,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler bei der Routenberechnung.';
      return res.status(500).json({ error: msg });
    }
  });

  // 3. Google Places API (New) proxy for real bike rentals & local POIs
  app.post('/api/places/search', async (req, res) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      return res.status(503).json({
        error: 'Google Places API ist aktuell nicht konfiguriert.',
        code: 'MAPS_NOT_CONFIGURED',
      });
    }

    try {
      const body = req.body as {
        textQuery?: string;
        lat?: number;
        lng?: number;
        radiusMeters?: number;
        pageSize?: number;
      };

      if (!body.textQuery) {
        return res.status(400).json({ error: 'Suchbegriff fehlt.' });
      }

      const requestPayload: Record<string, unknown> = {
        textQuery: body.textQuery,
        languageCode: 'de',
        pageSize: Math.min(Math.max(body.pageSize || 6, 1), 10),
      };

      if (typeof body.lat === 'number' && typeof body.lng === 'number') {
        requestPayload.locationBias = {
          circle: {
            center: { latitude: body.lat, longitude: body.lng },
            radius: Math.min(body.radiusMeters || 6000, 30000),
          },
        };
      }

      const fieldMask = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.rating',
        'places.userRatingCount',
        'places.currentOpeningHours',
        'places.regularOpeningHours',
        'places.nationalPhoneNumber',
        'places.internationalPhoneNumber',
        'places.websiteUri',
        'places.googleMapsUri',
        'places.businessStatus',
      ].join(',');

      const placesResp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
          'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
        },
        body: JSON.stringify(requestPayload),
      });

      const data = (await placesResp.json()) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude: number; longitude: number };
          rating?: number;
          userRatingCount?: number;
          regularOpeningHours?: { weekdayDescriptions?: string[] };
          currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
          nationalPhoneNumber?: string;
          internationalPhoneNumber?: string;
          websiteUri?: string;
          googleMapsUri?: string;
          businessStatus?: string;
        }>;
        error?: { message?: string; status?: string };
      };

      if (!placesResp.ok) {
        return res.status(placesResp.status === 429 ? 429 : placesResp.status).json({
          error: data.error?.message || 'Ortesuche über Google Places API fehlgeschlagen.',
          status: data.error?.status || 'PLACES_ERROR',
        });
      }

      return res.json({ places: data.places || [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler bei der Ortssuche.';
      return res.status(500).json({ error: msg });
    }
  });

  // 4. Weather proxy via Open-Meteo (real meteorological data without burning Maps quota)
  app.get('/api/weather', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const targetDate = typeof req.query.date === 'string' ? req.query.date : '';
    const portId = typeof req.query.portId === 'string' ? req.query.portId : 'unknown';

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Ungültige Hafen-Koordinaten für Wetterabfrage.' });
    }

    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', lat.toFixed(4));
      url.searchParams.set('longitude', lng.toFixed(4));
      url.searchParams.set(
        'hourly',
        'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m'
      );
      url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m');
      url.searchParams.set('timezone', 'Atlantic/Canary');
      url.searchParams.set('forecast_days', '14');

      const weatherResp = await fetch(url.toString());
      if (!weatherResp.ok) {
        return res.status(502).json({ error: 'Wetterdienst Open-Meteo derzeit nicht erreichbar.' });
      }

      const data = (await weatherResp.json()) as {
        current?: {
          temperature_2m?: number;
          weather_code?: number;
          wind_speed_10m?: number;
          wind_gusts_10m?: number;
        };
        hourly?: {
          time: string[];
          temperature_2m: number[];
          precipitation_probability: number[];
          weather_code: number[];
          wind_speed_10m: number[];
          wind_gusts_10m: number[];
        };
      };

      const times = data.hourly?.time || [];
      const availableDates = Array.from(new Set(times.map((t) => t.slice(0, 10))));
      const isForecastForCruiseDate = Boolean(targetDate && availableDates.includes(targetDate));
      const selectedDate = isForecastForCruiseDate ? targetDate : availableDates[0] || '';

      const hourlyWindow: Array<{
        timeISO: string;
        hourLabel: string;
        tempC: number;
        precipProb: number;
        windKmh: number;
        weatherCode: number;
        weatherLabel: string;
      }> = [];

      for (let i = 0; i < times.length; i++) {
        const t = times[i];
        if (!t.startsWith(selectedDate)) continue;
        const hour = Number(t.slice(11, 13));
        if (hour >= 8 && hour <= 18) {
          const code = data.hourly?.weather_code?.[i] ?? 0;
          hourlyWindow.push({
            timeISO: t,
            hourLabel: `${String(hour).padStart(2, '0')}:00`,
            tempC: Math.round(data.hourly?.temperature_2m?.[i] ?? 22),
            precipProb: Math.round(data.hourly?.precipitation_probability?.[i] ?? 0),
            windKmh: Math.round(data.hourly?.wind_speed_10m?.[i] ?? 12),
            weatherCode: code,
            weatherLabel: weatherCodeToGerman(code),
          });
        }
      }

      const daytimeRef = hourlyWindow.find((h) => h.hourLabel === '12:00') || hourlyWindow[0];
      const currentTempC = isForecastForCruiseDate
        ? daytimeRef?.tempC ?? Math.round(data.current?.temperature_2m ?? 22)
        : Math.round(data.current?.temperature_2m ?? 22);
      const weatherCode = isForecastForCruiseDate
        ? daytimeRef?.weatherCode ?? (data.current?.weather_code ?? 1)
        : data.current?.weather_code ?? 1;
      const windSpeedKmh = isForecastForCruiseDate
        ? Math.max(...hourlyWindow.map((h) => h.windKmh), 0)
        : Math.round(data.current?.wind_speed_10m ?? 15);
      const windGustsKmh = Math.round(data.current?.wind_gusts_10m ?? windSpeedKmh + 8);
      const precipProbMax = hourlyWindow.length > 0 ? Math.max(...hourlyWindow.map((h) => h.precipProb)) : 10;

      let cyclingLevel: 'gut' | 'eingeschraenkt' | 'abgeraten' = 'gut';
      let cyclingMessage = 'Gute Bedingungen für eine gemütliche Küsten-Radtour.';
      if (windSpeedKmh >= 35 || precipProbMax >= 65) {
        cyclingLevel = 'abgeraten';
        cyclingMessage = `Starker Wind (${windSpeedKmh} km/h) oder hohe Regenwahrscheinlichkeit (${precipProbMax} %). Statt Fahrrad lieber einen geschützten Stadtspaziergang wählen.`;
      } else if (windSpeedKmh >= 24 || precipProbMax >= 35) {
        cyclingLevel = 'eingeschraenkt';
        cyclingMessage = `Spürbarer Wind bis ${windSpeedKmh} km/h oder Schauerrisiko (${precipProbMax} %). E-Bike oder kurzer Spaziergang empfehlenswert.`;
      }

      const walkingAdvice =
        precipProbMax >= 60
          ? {
              suitable: false,
              message: `Erhöhte Regenwahrscheinlichkeit (${precipProbMax} %). Überdachte Markthallen, Museen und kurze Altstadtwege bevorzugen.`,
            }
          : {
              suitable: true,
              message: 'Sehr gute Bedingungen für entspannte Spaziergänge ab Terminal.',
            };

      const [yr, mo, dy] = selectedDate.split('-');
      const forecastDateLabel = yr && mo && dy ? `${dy}.${mo}.${yr}` : selectedDate;

      return res.json({
        portId,
        fetchedAt: new Date().toISOString(),
        currentTempC,
        weatherLabel: weatherCodeToGerman(weatherCode),
        weatherCode,
        precipProbMax,
        windSpeedKmh,
        windGustsKmh,
        isForecastForCruiseDate,
        forecastDateLabel,
        hourlyWindow,
        cyclingAdvice: {
          suitable: cyclingLevel !== 'abgeraten',
          level: cyclingLevel,
          message: cyclingMessage,
        },
        walkingAdvice,
        sourceName: 'Open-Meteo (Wettermodell Atlantic/Canary)',
        sourceUrl: 'https://open-meteo.com/',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Wetterdaten konnten nicht geladen werden.';
      return res.status(500).json({ error: msg });
    }
  });

  // 5. Gemini AI Travel Advisor ("Mein Kanaren-Reiseberater") with Google Search Grounding
  app.post('/api/advisor/chat', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Der KI-Reiseberater konnte nicht gestartet werden, da kein Gemini API-Schlüssel konfiguriert ist.',
      });
    }

    try {
      const body = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        portContext?: {
          island: string;
          portName: string;
          dateDisplay: string;
          arrivalTime: string | null;
          departureTime: string | null;
          terminalName: string;
          weatherSummary?: string;
          preferredMode?: 'BOTH' | 'WALK' | 'BICYCLE';
          excursionTitle?: string;
        };
      };

      if (!body.message || !body.message.trim()) {
        return res.status(400).json({ error: 'Bitte gib eine Frage für den Reiseberater ein.' });
      }

      const ctx = body.portContext;
      const systemInstruction = `Du bist „Mein Kanaren-Reiseberater“, ein persönlicher, ruhiger und präziser Reisebegleiter für zwei Erwachsene auf einer Kreuzfahrt mit der AIDAblu (29.11.2026 bis 06.12.2026, Las Palmas hin und zurück).

VERBINDLICHE AUSFLUGSREGELN (niemals brechen):
- Fortbewegung AUSSCHLIESSLICH zu Fuß oder mit einem Leihfahrrad.
- KEINE Mietwagen, KEINE Busse, KEINE Taxis, KEINE organisierten Gruppenausflüge.
- KEINE anspruchsvollen Wanderungen und KEINE sportlich anstrengenden Fahrradtouren.
- KEINE gefährlichen oder stark befahrenen Straßen, wenn eine ruhige Promenade oder Fußgängerzone existiert.
- Bevorzugte Ausflugsdauer: 1 bis 2 Stunden. Maximale Gesamtdauer: 3 Stunden (inklusive Hin- und Rückweg vom Kreuzfahrtterminal).
- Bevorzugt Rundwege direkt ab/bis Kreuzfahrtterminal.
- SICHERHEITSREGEL: Mindestens 90 Minuten Rückkehrreserve vor Schiffsabfahrt einplanen!

AKTUELLER HAFENKONTEXT:
- Insel & Hafen: ${ctx ? `${ctx.island} (${ctx.portName})` : 'Kanarische Inseln'}
- Datum: ${ctx?.dateDisplay || 'Während der Kreuzfahrt 29.11.–06.12.2026'}
- Schiffsliegezeit: Ankunft ${ctx?.arrivalTime || 'unbekannt'}, Abfahrt ${ctx?.departureTime || 'unbekannt'}
- Terminal: ${ctx?.terminalName || 'Kreuzfahrtterminal'}
- Wetterlage: ${ctx?.weatherSummary || 'Noch nicht geladen'}
- Gewünschte Fortbewegung: ${ctx?.preferredMode === 'WALK' ? 'Nur zu Fuß' : ctx?.preferredMode === 'BICYCLE' ? 'Gerne mit Leihfahrrad (falls sicher/windarm)' : 'Zu Fuß oder gemütliches Leihfahrrad'}
${ctx?.excursionTitle ? `- Besprochener Ausflug: ${ctx.excursionTitle}` : ''}

QUALITÄTS- & RECHERCHEPFLICHT:
1. Nutze Google Search Grounding für reale Sehenswürdigkeiten, Öffnungszeiten, Eintrittspreise, Fahrradverleiher, Straßenverhältnisse oder Hinweise.
2. Erfinde NIEMALS fiktive Fahrradverleiher, Telefonnummern, Adressen, Öffnungszeiten oder Preise. Wenn etwas nicht sicher prüfbar ist, kennzeichne es explizit als **[Geschätzt]** oder **[Nicht verfügbar / vor Ort prüfen]** und bestätigte Fakten als **[Verifiziert]**.
3. Wenn nach Ausflugsideen gefragt wird, liefere nach Möglichkeit **3 konkrete Vorschläge** mit:
   - Geschätzter Entfernung (echte Wegstrecke, keine Luftlinie) & Gesamtdauer (max. 3h)
   - Körperlicher Belastung & Steigungen (besonders bei Fahrrad)
   - Rückkehrzeit-Empfehlung (inkl. 90-Min-Reserve)
   - Vor- und Nachteilen jedes Vorschlags
   - Einer klaren persönlichen Empfehlung am Ende.
4. Wenn bei starkem Wind oder Regen Radfahren ungeeignet ist, warne aktiv davor und empfiehl stattdessen einen geschützten Spaziergang.
5. Antworte auf klarem, freundlichem Deutsch, gut strukturiert für das Smartphone (kurze Absätze, klare Aufzählungen).`;

      const contents = [
        ...(body.history || []).slice(-8).map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.text }],
        })),
        {
          role: 'user',
          parts: [{ text: body.message.trim() }],
        },
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text?.trim();
      if (!text) {
        return res.status(502).json({
          error: 'Der KI-Reiseberater hat keine Antwort zurückgegeben. Bitte versuche es erneut.',
        });
      }

      const sources = extractGroundingSources(response);
      return res.json({ text, sources });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'KI-Dienst derzeit nicht erreichbar.';
      return res.status(502).json({
        error: `Der KI-Reiseberater ist vorübergehend nicht erreichbar (${msg}).`,
      });
    }
  });

  // 6. Live Port Research via Gemini + Google Search Grounding
  app.post('/api/advisor/research-port', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Live-Recherche nicht verfügbar (Gemini API-Schlüssel fehlt).',
      });
    }

    try {
      const body = req.body as {
        portId?: string;
        island?: string;
        portName?: string;
        dateDisplay?: string;
      };

      if (!body.island || !body.portName) {
        return res.status(400).json({ error: 'Hafenangaben fehlen.' });
      }

      const prompt = `Recherchiere aktuelle, reale Besucherinformationen für Kreuzfahrtgäste (zu Fuß oder mit gemütlichem Leihfahrrad, maximal 3 Stunden Gesamtdauer) für den Hafen ${body.portName} auf ${body.island} (Reisedatum: ${body.dateDisplay || 'Ende November / Anfang Dezember 2026'}).

Prüfe über Google Search:
1. 4 gut zu Fuß erreichbare Sehenswürdigkeiten / Promenaden / Gärten nahe dem Kreuzfahrthafen mit aktuellen Öffnungszeiten und Eintrittspreisen (oder "kostenlos", falls öffentlich zugänglich; falls nicht verifizierbar, schreibe "Nicht verifiziert").
2. Ob es real existierende Fahrradverleiher in Hafennähe gibt (nur echte Namen nennen; wenn nicht sicher verifizierbar, offen mitteilen).
3. Aktuelle Hinweise zu Wegeverhältnissen, Steigungen oder bekannten Baustellen/Sperrungen in Hafennähe.

Antworte ausschließlich als valides JSON-Objekt mit genau diesem Schema:
{
  "summary": "Kurze deutsche Zusammenfassung (2-3 Sätze)",
  "highlights": [
    {
      "name": "Name des Ortes",
      "detail": "Kurze Beschreibung & Geh-/Rad-Eignung",
      "openingHours": "Verifizierte Öffnungszeiten oder 'Nicht verifiziert'",
      "entryFee": "Verifizierter Preis oder 'Kostenlos' oder 'Nicht verifiziert'",
      "status": "verifiziert" | "geschaetzt" | "nicht_verfuegbar"
    }
  ],
  "bikeRentalNote": "Ehrlicher Hinweis zu realen Verleihern vor Ort",
  "pathAndConstructionNote": "Hinweise zu Promenaden, Steigungen oder Baustellen"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawText = response.text || '';
      const parsed = extractJsonObject(rawText);
      const sources = extractGroundingSources(response);

      if (!parsed) {
        return res.json({
          portId: body.portId || '',
          fetchedAt: new Date().toISOString(),
          summary: rawText.slice(0, 800),
          highlights: [],
          bikeRentalNote: 'Siehe Zusammenfassung.',
          pathAndConstructionNote: 'Keine strukturierten Baustellendaten gefunden.',
          sources,
        });
      }

      return res.json({
        portId: body.portId || '',
        fetchedAt: new Date().toISOString(),
        summary: String(parsed.summary || ''),
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        bikeRentalNote: String(parsed.bikeRentalNote || ''),
        pathAndConstructionNote: String(parsed.pathAndConstructionNote || ''),
        sources,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Live-Recherche fehlgeschlagen.';
      return res.status(502).json({ error: msg });
    }
  });

  // Vite dev middleware vs static production build
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'dist', 'index.html'));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kanaren Entdecker Server läuft auf http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Serverstart fehlgeschlagen:', err);
  process.exit(1);
});
