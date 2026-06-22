/**
 * RecoveryPhraseModal — shown ONCE at signup.
 *
 * Displays the 24-word BIP39 recovery phrase in a 4-column grid.
 * User must tick a confirmation checkbox before proceeding.
 * Offers Copy to clipboard and Download as .txt.
 */
import { useState } from 'react';

interface Props {
  phrase: string;
  onConfirmed: () => void;
}

export default function RecoveryPhraseModal({ phrase, onConfirmed }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const words = phrase.split(' ');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select all text
    }
  };

  const handleDownload = () => {
    const text = words.map((w, i) => `${i + 1}. ${w}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dataflow-recovery-phrase.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    // Full-screen backdrop
    <div className="glass-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}>
      <div className="glass-modal w-full max-w-2xl rounded-2xl p-8 shadow-2xl"
           style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }}>
        {/* Header */}
        <h2 className="text-2xl font-semibold mb-1">Your Recovery Phrase</h2>
        <p className="text-sm opacity-70 mb-5">
          Save these 24 words. <span className="text-rose-300 font-semibold">We CANNOT recover them for you.</span>{' '}
          Without them and your password, your encrypted data is permanently lost.
        </p>

        {/* Word grid — 4 columns × 6 rows */}
        <div className="grid grid-cols-4 gap-2 rounded-xl p-4 mb-5"
             style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {words.map((word, i) => (
            <div key={i} className="flex items-baseline gap-1.5 text-sm font-mono">
              <span className="text-[10px] opacity-40 w-5 text-right flex-shrink-0">{i + 1}.</span>
              <span className="text-white/90 font-medium">{word}</span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={handleCopy}
            className="glass-btn flex items-center gap-2 text-sm px-4 py-2"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="glass-btn flex items-center gap-2 text-sm px-4 py-2"
          >
            💾 Download as .txt
          </button>
        </div>

        {/* Confirmation checkbox */}
        <label className="flex items-start gap-3 cursor-pointer mb-6 select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="mt-1 w-4 h-4 rounded accent-indigo-400"
          />
          <span className="text-sm opacity-80">
            I have saved this phrase securely. I understand that if I lose it and forget my
            password, my encrypted data cannot be recovered.
          </span>
        </label>

        {/* Continue */}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!confirmed}
            onClick={onConfirmed}
            className="glass-btn-primary px-6 py-2.5 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}
