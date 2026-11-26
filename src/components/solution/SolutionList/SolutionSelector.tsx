import { useI18n } from "../../../i18n";
import type { SolutionResult } from "../../../types/calc";

export interface SolutionSelectorProps {
  solutions: SolutionResult[];
  selectedIndex: number;
  onSelectSolution: (index: number) => void;
}

export default function SolutionSelector({
  solutions,
  selectedIndex,
  onSelectSolution,
}: SolutionSelectorProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <span className="text-sm text-endfield-text uppercase tracking-widest">
        {t("selectSolution")}:
      </span>
      <div className="flex gap-1">
        {solutions.map((solution, idx) => (
          <button
            type="button"
            key={`${solution.oscillating?.[0]?.denominator ?? ""}-${solution.oscillating?.[0]?.power ?? ""}-${idx}`}
            onClick={() => onSelectSolution(idx)}
            className={`px-3 py-1.5 text-sm transition-colors border ${
              selectedIndex === idx
                ? "text-endfield-yellow border-endfield-yellow bg-endfield-yellow/10"
                : "text-endfield-text border-endfield-gray-light hover:border-endfield-text"
            }`}
          >
            {idx + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
