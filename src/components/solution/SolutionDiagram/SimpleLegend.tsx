import Icon from "../../ui/Icon";
import LegendItem from "./LegendItem";

export interface SimpleLegendProps {
  t: (key: string) => string;
}

export default function SimpleLegend({ t }: SimpleLegendProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-endfield-text-light">
      <LegendItem
        marker={
          <div className="w-6 h-6 bg-endfield-gray border border-endfield-text-light/40 flex items-center justify-center">
            <Icon name="input" className="text-[14px]" />
          </div>
        }
        label={t("legendInputSource")}
      />
      <LegendItem
        marker={
          <div className="min-w-[30px] h-6 border border-endfield-yellow/30 text-endfield-yellow bg-endfield-yellow/10 flex items-center justify-center font-bold">
            2{t("waySplit")}
          </div>
        }
        label={t("legendSplit2")}
      />
      <LegendItem
        marker={
          <div className="min-w-[30px] h-6 border border-endfield-text-light/30 text-endfield-text-light bg-endfield-gray/80 flex items-center justify-center font-bold">
            3{t("waySplit")}
          </div>
        }
        label={t("legendSplit3")}
      />
      <LegendItem
        marker={
          <div className="h-6 px-2 border border-endfield-yellow/50 bg-endfield-yellow/10 text-endfield-yellow flex items-center gap-1">
            <Icon name="bolt" className="text-[13px]" />
          </div>
        }
        label={t("legendGenerator")}
      />
      <LegendItem
        marker={
          <Icon name="arrow_right_alt" className="text-endfield-text/70" />
        }
        label={t("legendFlowDirection")}
      />
    </div>
  );
}
