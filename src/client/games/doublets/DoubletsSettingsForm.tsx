import {
  MAX_WORD_LENGTH,
  MIN_WORD_LENGTH,
  type DoubletsSettings,
  type GameMode,
} from "../../../shared/games/doublets/types";
import type { SettingsFormProps } from "../types";

const WORD_LENGTHS = Array.from({ length: MAX_WORD_LENGTH - MIN_WORD_LENGTH + 1 }, (_, i) => MIN_WORD_LENGTH + i);
const TURN_SECONDS = [15, 30, 45, 60, 90, 120, 180];

const MODES: { value: GameMode; label: string; hint: string }[] = [
  { value: "timed", label: "Timed", hint: "Run out of time and you're out." },
  { value: "unlimited", label: "Unlimited", hint: "No timer. You're out only when you surrender." },
];

export function DoubletsSettingsForm({ settings, editable, onChange }: SettingsFormProps) {
  const s = settings as DoubletsSettings;
  const set = (patch: Partial<DoubletsSettings>) => onChange({ ...s, ...patch });
  const turnOptions = TURN_SECONDS.includes(s.turnSeconds) ? TURN_SECONDS : [...TURN_SECONDS, s.turnSeconds].sort((a, b) => a - b);

  return (
    <fieldset className="settings" disabled={!editable}>
      <label className="field">
        <span>Word length</span>
        <select value={s.wordLength} onChange={(e) => set({ wordLength: Number(e.target.value) })}>
          {WORD_LENGTHS.map((n) => (
            <option key={n} value={n}>
              {n} letters
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>Mode</span>
        <div className="choices">
          {MODES.map((m) => (
            <label key={m.value} className={`choice${s.mode === m.value ? " selected" : ""}`}>
              <input
                type="radio"
                name="mode"
                value={m.value}
                checked={s.mode === m.value}
                onChange={() => set({ mode: m.value })}
              />
              <strong>{m.label}</strong>
              <span className="muted">{m.hint}</span>
            </label>
          ))}
        </div>
      </div>

      {s.mode === "timed" && (
        <label className="field">
          <span>Time per turn</span>
          <select value={s.turnSeconds} onChange={(e) => set({ turnSeconds: Number(e.target.value) })}>
            {turnOptions.map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  );
}
