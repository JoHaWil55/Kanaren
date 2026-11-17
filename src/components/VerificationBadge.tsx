import React from 'react';
import { CheckCircle2, HelpCircle, Info } from 'lucide-react';
import { VerificationStatus } from '../types';

interface VerificationLabelProps {
  status: VerificationStatus;
  className?: string;
}

/**
 * Unboxed, typographic verification indicator (Zero-Pill discipline).
 * Always pairs semantic color with explicit icon + German text label.
 */
export const VerificationLabel: React.FC<VerificationLabelProps> = ({ status, className = '' }) => {
  if (status === 'verifiziert') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium text-[#1E7A6D] ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Verifiziert</span>
      </span>
    );
  }

  if (status === 'geschaetzt') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium text-[#B45309] ${className}`}>
        <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Geschätzt</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium text-[#526473] ${className}`}>
      <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Nicht verfügbar</span>
    </span>
  );
};
