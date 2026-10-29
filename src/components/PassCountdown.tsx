import { splitCountdown } from '@/lib/boarding';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ value }: { value: number }) {
  return (
    <span className="cd-digit">
      <span className="cd-reel" style={{ transform: `translateY(${-value * 10}%)` }}>
        {DIGITS.map((digit) => (
          <span key={digit}>{digit}</span>
        ))}
      </span>
    </span>
  );
}

function Group({ value, unit }: { value: number; unit: string }) {
  const text = String(value).padStart(2, '0');
  return (
    <span className="cd-group">
      <span className="cd-digits">
        {text.split('').map((char, index) => (
          <Digit key={text.length - index} value={Number(char)} />
        ))}
      </span>
      <span className="cd-unit">{unit}</span>
    </span>
  );
}

export function PassCountdown({ remainingMs, ready }: { remainingMs: number; ready: boolean }) {
  const { days, hours, minutes, seconds } = splitCountdown(ready ? remainingMs : 0);
  return (
    <span className="countdown" aria-hidden="true">
      {days > 0 && (
        <>
          <Group value={days} unit="days" />
          <span className="cd-sep" />
        </>
      )}
      <Group value={hours} unit="hrs" />
      <span className="cd-sep">:</span>
      <Group value={minutes} unit="min" />
      <span className="cd-sep">:</span>
      <Group value={seconds} unit="sec" />
    </span>
  );
}
