import { useI18n } from "../../../i18n";
import type { SolutionResult } from "../../../types/calc";
import type {
  DecisionMatrixGrid,
  MatrixSelection,
} from "../../../types/matrix";
import { WASTE_COLUMNS } from "../../../types/matrix";

export interface DecisionMatrixCardProps {
  matrix: DecisionMatrixGrid | null;
  selection: MatrixSelection | null;
  preferred: SolutionResult | null;
  compact?: boolean;
  onSelectCell: (row: number, col: number, solution: SolutionResult) => void;
}

function formatPower(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const EMPTY_GRID: DecisionMatrixGrid = [
  [null, null, null],
  [null, null, null],
  [null, null, null],
];

export default function DecisionMatrixCard({
  matrix,
  selection,
  preferred,
  compact = false,
  onSelectCell,
}: DecisionMatrixCardProps) {
  const { t } = useI18n();
  const rows = matrix ?? EMPTY_GRID;
  const cellH = compact ? "h-14" : "h-12 sm:h-[3.35rem]";

  return (
    <div className="w-full">
      <table className="w-full table-fixed border-collapse text-center">
        <thead>
          <tr>
            <th className="w-[3.6rem] border border-endfield-gray-light p-0 text-[9px] text-endfield-text/80 leading-none">
              <div className="relative h-10 sm:h-11 overflow-hidden">
                <svg
                  className="absolute inset-0 w-full h-full text-endfield-gray-light"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <line
                    x1="6"
                    y1="6"
                    x2="94"
                    y2="94"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                </svg>
                <span className="absolute top-0.5 right-0.5 max-w-[58%] text-right font-bold text-endfield-text">
                  {t("decisionMatrixWaste")}
                </span>
                <span className="absolute bottom-0.5 left-0.5 max-w-[58%] text-left font-bold text-endfield-text">
                  {t("decisionMatrixPorts")}
                </span>
              </div>
            </th>
            {WASTE_COLUMNS.map((col) => (
              <th
                key={col.id}
                className="border border-endfield-gray-light px-0.5 py-1 text-[10px] text-endfield-text-light"
              >
                <div className="font-bold text-endfield-text">
                  {t(`wasteCol${col.id}`)}
                </div>
                <div className="opacity-60 leading-tight">
                  {t(`wasteColSub${col.id}`)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              <th className="border border-endfield-gray-light px-0.5 py-1 text-xs text-endfield-text-light whitespace-nowrap">
                {t("branchCountShort", { count: r + 1 })}
              </th>
              {row.map((cell, c) => {
                const selected = selection?.row === r && selection?.col === c;
                const isPreferred = Boolean(
                  cell && preferred && cell === preferred
                );
                const dead = !cell;
                return (
                  <td
                    key={c}
                    className={`border border-endfield-gray-light p-0 relative ${
                      dead ? "bg-endfield-black/40" : "bg-endfield-dark/40"
                    }`}
                  >
                    {dead ? (
                      <div
                        className={`${cellH} w-full relative cursor-not-allowed opacity-55`}
                        title={t("noSolutionCell")}
                        aria-label={t("noSolutionCell")}
                      >
                        <svg
                          className="absolute inset-0 w-full h-full"
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <line
                            x1="8"
                            y1="8"
                            x2="92"
                            y2="92"
                            stroke="var(--ef-slash)"
                            strokeWidth="6"
                          />
                        </svg>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectCell(r, c, cell)}
                        className={`w-full ${cellH} px-0.5 py-0.5 text-[11px] leading-tight transition-shadow ${
                          selected
                            ? "decision-cell-selected text-endfield-yellow ring-1 ring-endfield-yellow bg-endfield-yellow/10"
                            : "text-endfield-text-light hover:bg-endfield-yellow/5"
                        }`}
                      >
                        <div className="font-bold tabular-nums">
                          {formatPower(cell.avgPower)}w
                        </div>
                        <div className="opacity-80 tabular-nums">
                          (+{formatPower(cell.waste)}w)
                        </div>
                        {isPreferred ? (
                          <div className="inline-block text-[9px] font-bold px-1.5 py-0.5 bg-endfield-yellow-bg text-endfield-ink">
                            {t("preferredBadge")}
                          </div>
                        ) : null}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
