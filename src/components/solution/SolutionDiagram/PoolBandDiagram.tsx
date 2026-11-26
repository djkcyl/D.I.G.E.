import { useI18n } from "../../../i18n";

/**
 * 满速带示意图（三分器串联的十字形布线）：
 *
 *        发电          发电
 *         ↑             ↑
 *   燃料输入 → 3分 → 3分 → 发电
 *         ↓             ↓
 *        发电          发电
 *
 * 每个三分器喂 上/下/前 三个方向；头节与中节的前方被下一节占用，
 * 只有尾节的前方直接接一台热能池，所以 n 个分流器最多带 2n+1 台。
 */
export interface PoolBandDiagramProps {
  ports: number;
  splitters: number;
  generators: number;
  watt: number;
  perMinute: number;
}

const BOX =
  "flex w-full h-6 items-center justify-center whitespace-nowrap border border-endfield-yellow/30 bg-endfield-gray text-endfield-yellow text-[10px] leading-none px-1";

const ARROW = "text-endfield-text/50 text-[10px] leading-none text-center";

const INPUT_COL = "4.4rem";
const CELL_COL = "2.6rem";

export default function PoolBandDiagram({
  ports,
  splitters,
  generators,
  watt,
  perMinute,
}: PoolBandDiagramProps) {
  const { t } = useI18n();
  if (generators <= 0) return null;

  const portCount = Math.max(1, ports);
  const perPort = Math.ceil(generators / portCount);
  const n = Math.max(0, Math.min(splitters, Math.ceil((perPort - 1) / 2)));
  const tailCol = n + 2;

  // 把 perPort 台热能池按 上/下/尾 的顺序分配
  const up: boolean[] = Array(n).fill(false);
  const down: boolean[] = Array(n).fill(false);
  let remaining = perPort;
  for (let i = 0; i < n && remaining > 0; i += 1) {
    up[i] = true;
    remaining -= 1;
    if (remaining > 0) {
      down[i] = true;
      remaining -= 1;
    }
  }
  const tail = remaining > 0;

  const cells: React.ReactNode[] = [];

  // 第 1 列：燃料输入（跨中行，单独宽列）
  cells.push(
    <div key="input" style={{ gridColumn: 1, gridRow: 3 }} className={BOX}>
      {t("legendInput")}
    </div>,
  );

  for (let i = 0; i < n; i += 1) {
    const col = i + 2;
    if (up[i]) {
      cells.push(
        <div
          key={`up-${i}`}
          style={{ gridColumn: col, gridRow: 1 }}
          className={BOX}
        >
          {t("diagramGeneratorShort")}
        </div>,
        <div
          key={`upArrow-${i}`}
          style={{ gridColumn: col, gridRow: 2 }}
          className={ARROW}
        >
          ↑
        </div>,
      );
    }
    cells.push(
      <div
        key={`split-${i}`}
        style={{ gridColumn: col, gridRow: 3 }}
        className={BOX}
      >
        3{t("waySplit")}
      </div>,
    );
    if (down[i]) {
      cells.push(
        <div
          key={`downArrow-${i}`}
          style={{ gridColumn: col, gridRow: 4 }}
          className={ARROW}
        >
          ↓
        </div>,
        <div
          key={`down-${i}`}
          style={{ gridColumn: col, gridRow: 5 }}
          className={BOX}
        >
          {t("diagramGeneratorShort")}
        </div>,
      );
    }
  }

  if (tail) {
    cells.push(
      <div
        key="tail"
        style={{ gridColumn: tailCol, gridRow: 3 }}
        className={BOX}
      >
        {t("diagramGeneratorShort")}
      </div>,
    );
  }

  return (
    <div className="p-2 space-y-1">
      {Array.from({ length: portCount }, (_, index) => `port-${index + 1}`).map(
        (portKey) => (
          <div
            key={portKey}
            className="grid items-center gap-x-1 gap-y-0.5"
            style={{
              gridTemplateColumns: `${INPUT_COL} repeat(${n}, ${CELL_COL}) ${CELL_COL}`,
              gridTemplateRows: "1.5rem 0.9rem 1.5rem 0.9rem 1.5rem",
            }}
          >
            {cells}
          </div>
        ),
      )}
      <div className="text-[10px] text-endfield-text/60">
        {perMinute.toFixed(2)}
        {t("itemPerMin")} · {watt.toFixed(0)}w · {generators}{" "}
        {t("oscPoolGenerators")}
      </div>
    </div>
  );
}
