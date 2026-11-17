import React, { useEffect, useRef, useState } from 'react';
import {
  Bike,
  ExternalLink,
  Footprints,
  Loader2,
  Send,
  Trash2,
  WifiOff,
} from 'lucide-react';
import {
  AdvisorMessage,
  CruiseStop,
  Excursion,
  PortWeather,
  TransportMode,
} from '../types';
import { fetchPortWeather, sendAdvisorQuestion } from '../services/apiClient';
import { offlineDb } from '../services/offlineDb';

interface AdvisorChatViewProps {
  stops: CruiseStop[];
  selectedStop: CruiseStop;
  onSelectStop: (stop: CruiseStop) => void;
  discussedExcursion: Excursion | null;
  onClearDiscussedExcursion: () => void;
  initialPrompt: string | null;
  onConsumeInitialPrompt: () => void;
  isOnline: boolean;
}

const SUGGESTED_QUESTIONS = [
  'Was können wir heute hier Schönes unternehmen?',
  'Zeige uns drei ruhige Spaziergänge in Hafennähe.',
  'Gibt es eine gemütliche Fahrradtour entlang der Küste?',
  'Wir möchten heute nicht so viel laufen – was passt?',
  'Welche realen Fahrradverleiher gibt es in Hafennähe?',
  'Wie kommen wir sicher und rechtzeitig wieder zum Schiff?',
];

export const AdvisorChatView: React.FC<AdvisorChatViewProps> = ({
  stops,
  selectedStop,
  onSelectStop,
  discussedExcursion,
  onClearDiscussedExcursion,
  initialPrompt,
  onConsumeInitialPrompt,
  isOnline,
}) => {
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const [input, setInput] = useState('');
  const [preferredMode, setPreferredMode] = useState<'BOTH' | TransportMode>('BOTH');
  const [weather, setWeather] = useState<PortWeather | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void offlineDb.getAdvisorMessages().then((msgs) => {
      setMessages(msgs);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void offlineDb.getWeather(selectedStop.id).then(async (cached) => {
      if (cached && !cancelled) setWeather(cached);
      if (isOnline && !selectedStop.isSeaDay) {
        try {
          const fresh = await fetchPortWeather(selectedStop);
          if (!cancelled) {
            setWeather(fresh);
            void offlineDb.saveWeather(fresh);
          }
        } catch {
          // keep cached weather if fetch fails
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedStop, isOnline]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const submitQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || isSending) return;

    const userMsg: AdvisorMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
      portId: selectedStop.id,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    await offlineDb.saveAdvisorMessage(userMsg);

    if (!isOnline) {
      const offlineReply: AdvisorMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: 'Du bist aktuell offline. Live-Recherchen und neue Ausflugsempfehlungen mit „Mein Kanaren-Reiseberater“ benötigen eine Internetverbindung. Bereits gespeicherte Ausflüge findest du jederzeit in deiner Merkliste.',
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, offlineReply]);
      await offlineDb.saveAdvisorMessage(offlineReply);
      return;
    }

    setIsSending(true);
    try {
      const response = await sendAdvisorQuestion({
        message: trimmed,
        history: nextHistory,
        stop: selectedStop,
        weather,
        preferredMode,
        excursionTitle: discussedExcursion?.title,
      });

      const assistantMsg: AdvisorMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: response.text,
        timestamp: new Date().toISOString(),
        portId: selectedStop.id,
        sources: response.sources,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      await offlineDb.saveAdvisorMessage(assistantMsg);
    } catch (err) {
      const errMsg: AdvisorMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        text:
          err instanceof Error
            ? err.message
            : 'Der KI-Reiseberater ist derzeit leider nicht erreichbar. Bitte versuche es in einem Moment erneut.',
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (initialPrompt) {
      const p = initialPrompt;
      onConsumeInitialPrompt();
      void submitQuestion(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const handleClearChat = async () => {
    await offlineDb.clearAdvisorMessages();
    setMessages([]);
  };

  return (
    <div className="space-y-4 pb-4 flex flex-col">
      {/* Context Header */}
      <div className="rounded-2xl border border-[#E2DDD2] bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-[#142634]">Mein Kanaren-Reiseberater</h1>
            <p className="text-xs text-[#526473]">
              Persönliche KI-Beratung mit Echtzeit-Webrecherche · Max. 3 Std. · 90 Min. Schiffsreserve
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => void handleClearChat()}
              className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium text-[#526473] hover:bg-[#EFECE4] inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Verlauf leeren</span>
            </button>
          )}
        </div>

        {/* Port & Transport Mode Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#EFECE4]">
          <select
            aria-label="Hafen für die Beratung wählen"
            value={selectedStop.id}
            onChange={(e) => {
              const found = stops.find((s) => s.id === e.target.value);
              if (found) onSelectStop(found);
            }}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-[#D9D2C5] bg-[#F7F6F2] text-sm font-medium text-[#142634]"
          >
            {stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.dateDisplay.slice(0, 5)} · {s.island} ({s.portName})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-[#EFECE4] rounded-xl">
            <button
              type="button"
              onClick={() => setPreferredMode('BOTH')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                preferredMode === 'BOTH' ? 'bg-white text-[#142634] shadow-xs' : 'text-[#526473]'
              }`}
            >
              Fuß &amp; Rad
            </button>
            <button
              type="button"
              onClick={() => setPreferredMode('WALK')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition ${
                preferredMode === 'WALK' ? 'bg-white text-[#142634] shadow-xs' : 'text-[#526473]'
              }`}
            >
              <Footprints className="w-3.5 h-3.5" />
              <span>Nur zu Fuß</span>
            </button>
            <button
              type="button"
              onClick={() => setPreferredMode('BICYCLE')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 transition ${
                preferredMode === 'BICYCLE' ? 'bg-white text-[#142634] shadow-xs' : 'text-[#526473]'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              <span>Leihfahrrad</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#526473] tabular-nums">
          <span>
            Liegezeit: {selectedStop.arrivalTime || '–'} bis {selectedStop.departureTime || '–'} Uhr
          </span>
          {weather && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Wetter: {weather.currentTempC} °C, {weather.weatherLabel}, Wind {weather.windSpeedKmh} km/h
              </span>
            </>
          )}
        </div>

        {discussedExcursion && (
          <div className="rounded-xl bg-[#0B5D7A]/8 border border-[#0B5D7A]/20 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
            <span className="text-[#142634]">
              Aktuelles Thema: <strong>{discussedExcursion.title}</strong>
            </span>
            <button
              type="button"
              onClick={onClearDiscussedExcursion}
              className="text-[#0B5D7A] font-medium hover:underline shrink-0"
            >
              Lösen
            </button>
          </div>
        )}
      </div>

      {!isOnline && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Offline-Modus: Frühere Antworten sind sichtbar; neue KI-Recherchen benötigen Internet.</span>
        </div>
      )}

      {/* Quick Prompt Suggestions */}
      {messages.length === 0 && (
        <div className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-3">
          <p className="text-sm font-medium text-[#142634]">
            Frag „Mein Kanaren-Reiseberater“ nach passenden Ideen für {selectedStop.island}:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void submitQuestion(q)}
                className="min-h-[44px] text-left px-3.5 py-2.5 rounded-xl border border-[#E2DDD2] bg-[#F7F6F2] text-xs font-medium text-[#142634] hover:border-[#0B5D7A] hover:bg-white transition"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-2xl p-4 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#0B5D7A] text-white ml-6 sm:ml-16'
                : msg.isError
                ? 'bg-amber-50 border border-amber-200 text-amber-950 mr-4 sm:mr-12'
                : 'bg-white border border-[#E2DDD2] text-[#142634] mr-4 sm:mr-12'
            }`}
          >
            <div className="whitespace-pre-wrap">{msg.text}</div>
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-[#EFECE4] space-y-1">
                <p className="text-xs font-semibold text-[#526473]">Quellen aus der Recherche:</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {msg.sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#0B5D7A] hover:underline inline-flex items-center gap-1"
                    >
                      <span>{src.title}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="rounded-2xl bg-white border border-[#E2DDD2] p-4 mr-12 flex items-center gap-2.5 text-sm text-[#526473]">
            <Loader2 className="w-4 h-4 animate-spin text-[#0B5D7A]" />
            <span>Recherchiere aktuelle Wege, Zeiten &amp; Hinweise für {selectedStop.island}…</span>
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitQuestion(input);
        }}
        className="sticky bottom-16 md:bottom-4 bg-[#F7F6F2] pt-2"
      >
        <div className="flex items-center gap-2 rounded-2xl border border-[#D9D2C5] bg-white p-1.5 shadow-sm">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Frage zu ${selectedStop.island} stellen…`}
            className="flex-1 min-h-[44px] px-3 bg-transparent text-sm text-[#142634] placeholder:text-[#7A8A97] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            aria-label="Frage senden"
            className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-[#0B5D7A] text-white text-sm font-medium hover:bg-[#094C65] disabled:opacity-40 inline-flex items-center justify-center gap-1.5 transition"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Fragen</span>
          </button>
        </div>
      </form>
    </div>
  );
};
