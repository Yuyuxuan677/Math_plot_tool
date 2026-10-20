import { useEffect, useState } from 'react';

export interface NumberFieldProps {
  value: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
  step?: number;
}

function displayText(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1000) return String(value);
  return String(Number(value.toFixed(4)));
}

export function NumberField({ value, onCommit, ariaLabel, step = 0.1 }: NumberFieldProps) {
  const [text, setText] = useState(() => displayText(value));

  useEffect(() => {
    setText(displayText(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(text);
    if (text.trim() !== '' && Number.isFinite(parsed)) {
      onCommit(parsed);
      setText(displayText(parsed));
    } else {
      setText(displayText(value));
    }
  };

  return (
    <input
      className="number-field"
      type="number"
      inputMode="decimal"
      step={step}
      value={text}
      aria-label={ariaLabel}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}
