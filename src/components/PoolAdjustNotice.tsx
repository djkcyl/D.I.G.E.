/**
 * PoolAdjustNotice —— 方案摘要区的「求解器自动调整」提示条。
 * 只消费 props 注入的调整结果（不依赖求解器内部）：
 * - wasteRelax：冗余上限被放宽，可「套用到参数」
 * - direction=down：自定义池投料被降低（降到 0 视为不再使用该池），可「套用到参数」
 * - direction=up：投料被加高，仅用警告色提示前提条件，不提供套用按钮
 * direction=none 且没有 wasteRelax 时不渲染。
 */
import { useI18n } from "../i18n";
import Button from "./ui/Button";
import Icon from "./ui/Icon";

export interface WasteRelaxInfo {
  /** 用户原始冗余上限（W） */
  base: number;
  /** 求解器实际放宽到的冗余上限（W） */
  used: number;
}

export type PoolAdjustDirection = "none" | "down" | "up";

export interface PoolAdjustInfo {
  direction: PoolAdjustDirection;
  fromPerMin: number;
  toPerMin: number;
  /** direction=up 时成立所需的实际产出（/分）；缺省取 toPerMin */
  requiredActualRatePerMin?: number;
}

export interface PoolAdjustNoticeProps {
  wasteRelax?: WasteRelaxInfo;
  poolAdjust?: PoolAdjustInfo;
  /** 自定义池熄火期需要的最低富余（W）；缺省时文案省略括号说明 */
  requiredSurplusW?: number;
  /** 套用放宽后的冗余上限；不传则不显示按钮 */
  onApplyMaxWaste?: (used: number) => void;
  /** 套用降低后的投料速率；不传则不显示按钮 */
  onApplyPoolRate?: (toPerMin: number) => void;
  className?: string;
}

export const formatPoolAdjustWatt = (value: number): string =>
  String(Math.round(value));

export const formatPoolAdjustRate = (value: number): string =>
  String(Math.round(value * 100) / 100);

const INFO_BAR_CLASS =
  "flex flex-col sm:flex-row sm:items-center gap-2 border-l-2 border-endfield-yellow bg-endfield-yellow/10 px-3 py-2 text-sm text-endfield-text-light";
const WARNING_BAR_CLASS =
  "flex flex-col sm:flex-row sm:items-center gap-2 border-l-2 border-red-500 bg-red-900/20 px-3 py-2 text-sm text-red-200";

export default function PoolAdjustNotice({
  wasteRelax,
  poolAdjust,
  requiredSurplusW,
  onApplyMaxWaste,
  onApplyPoolRate,
  className = "",
}: PoolAdjustNoticeProps) {
  const { t } = useI18n();

  const direction = poolAdjust?.direction ?? "none";
  if (!wasteRelax && direction === "none") return null;

  const wasteText = wasteRelax
    ? requiredSurplusW != null
      ? t("poolAdjustWasteRelaxed", {
          from: formatPoolAdjustWatt(wasteRelax.base),
          to: formatPoolAdjustWatt(wasteRelax.used),
          need: formatPoolAdjustWatt(requiredSurplusW),
        })
      : t("poolAdjustWasteRelaxedShort", {
          from: formatPoolAdjustWatt(wasteRelax.base),
          to: formatPoolAdjustWatt(wasteRelax.used),
        })
    : null;

  const isDropped = direction === "down" && (poolAdjust?.toPerMin ?? 0) <= 0;

  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      {wasteRelax && wasteText ? (
        // biome-ignore lint/a11y/useSemanticElements: 提示条内含块级 div 与按钮，<output> 只允许短语内容
        <div className={INFO_BAR_CLASS} role="status">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Icon name="info" className="!w-5 !h-5 text-endfield-yellow" />
            <span className="leading-relaxed">{wasteText}</span>
          </div>
          {onApplyMaxWaste ? (
            <Button
              variant="primary"
              size="sm"
              className="self-end sm:self-auto shrink-0"
              onClick={() => onApplyMaxWaste(wasteRelax.used)}
            >
              {t("poolAdjustApply")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {poolAdjust && direction === "down" ? (
        // biome-ignore lint/a11y/useSemanticElements: 提示条内含块级 div 与按钮，<output> 只允许短语内容
        <div className={INFO_BAR_CLASS} role="status">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Icon name="info" className="!w-5 !h-5 text-endfield-yellow" />
            <span className="leading-relaxed">
              {isDropped
                ? t("poolAdjustPoolDropped")
                : t("poolAdjustRateDown", {
                    from: formatPoolAdjustRate(poolAdjust.fromPerMin),
                    to: formatPoolAdjustRate(poolAdjust.toPerMin),
                  })}
            </span>
          </div>
          {onApplyPoolRate ? (
            <Button
              variant="primary"
              size="sm"
              className="self-end sm:self-auto shrink-0"
              onClick={() => onApplyPoolRate(Math.max(0, poolAdjust.toPerMin))}
            >
              {t("poolAdjustApply")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {poolAdjust && direction === "up" ? (
        <div className={WARNING_BAR_CLASS} role="alert">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Icon name="warning" className="!w-5 !h-5 text-red-300" />
            <span className="leading-relaxed">
              {t("poolAdjustRateUp", {
                to: formatPoolAdjustRate(poolAdjust.toPerMin),
                rate: formatPoolAdjustRate(
                  poolAdjust.requiredActualRatePerMin ?? poolAdjust.toPerMin,
                ),
              })}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
