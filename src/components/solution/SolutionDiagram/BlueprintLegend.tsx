import LegendItem from "./LegendItem";

function BlueprintSpriteMarker({ src }: { src: string }) {
  return (
    <div className="h-6 w-6 border border-endfield-gray-light bg-endfield-black/50 flex items-center justify-center overflow-hidden shrink-0">
      <img
        src={src}
        alt=""
        draggable={false}
        className="w-full h-full object-contain pointer-events-none"
        style={{ transform: "rotate(-90deg)" }}
      />
    </div>
  );
}

function BlueprintLetterMarker({ value }: { value: string }) {
  return (
    <div className="h-6 min-w-[34px] px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 flex items-center justify-center text-[10px] font-semibold">
      {value}
    </div>
  );
}

export interface BlueprintLegendProps {
  t: (key: string) => string;
}

export default function BlueprintLegend({ t }: BlueprintLegendProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-endfield-text-light">
      <LegendItem
        marker={
          <BlueprintSpriteMarker src="/svg/bg_logistic_log_splitter.png" />
        }
        label={t("legendBlueprintS")}
      />
      <LegendItem
        marker={
          <BlueprintSpriteMarker src="/svg/bg_logistic_log_converger.png" />
        }
        label={t("legendBlueprintM")}
      />
      <LegendItem
        marker={<BlueprintLetterMarker value="I" />}
        label={t("legendBlueprintI")}
      />
      <LegendItem
        marker={<BlueprintLetterMarker value="R" />}
        label={t("legendBlueprintR")}
      />
      <LegendItem
        marker={<BlueprintLetterMarker value="T" />}
        label={t("legendBlueprintT")}
      />
    </div>
  );
}
