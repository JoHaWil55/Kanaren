import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWA';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0B5D7A] text-white text-xs font-medium hover:bg-[#094C65] active:scale-[0.98] transition whitespace-nowrap shrink-0"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>App installieren</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl border border-[#D9D2C5] bg-white text-[#142634] text-xs font-medium hover:bg-[#EFECE4] transition whitespace-nowrap shrink-0"
      >
        <Smartphone className="w-4 h-4 shrink-0 text-[#0B5D7A]" />
        <span>Als App nutzen</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#E2DDD2]">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold text-[#142634]">
                Auf dem Smartphone installieren
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Schließen"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#526473] hover:bg-[#EFECE4]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2 text-sm text-[#324656] leading-relaxed list-decimal list-inside">
                <li>In Safari unten auf das <strong>Teilen-Symbol</strong> tippen.</li>
                <li>Nach unten scrollen und <strong>Zum Home-Bildschirm</strong> wählen.</li>
                <li>Mit <strong>Hinzufügen</strong> bestätigen.</li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2 text-sm text-[#324656] leading-relaxed list-decimal list-inside">
                <li>Im Android-Browser (Chrome) rechts oben auf das <strong>Menü (⋮)</strong> tippen.</li>
                <li><strong>App installieren</strong> bzw. <strong>Zum Startbildschirm hinzufügen</strong> wählen.</li>
                <li>Danach läuft „Kanaren Entdecker“ wie eine eigenständige App – auch offline an Bord.</li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-[#0B5D7A] text-white text-sm font-medium hover:bg-[#094C65]"
            >
              Verstanden
            </button>
          </div>
        </div>
      )}
    </>
  );
};
