import { useI18n } from "../../../i18n";

const FACE_ARROW: Record<string, string> = {
  UP: "^",
  DOWN: "v",
  LEFT: "<",
  RIGHT: ">",
};

const BLUEPRINT_IMG: Record<string, string> = {
  belt: "/svg/icon_belt_grid.png",
  left_turn_belt: "/svg/icon_belt_corner_1.png",
  right_turn_belt: "/svg/icon_belt_corner_1.png",
  conveyor_bridge: "/svg/bg_logistic_log_connector.png",
  splitter: "/svg/bg_logistic_log_splitter.png",
  converger: "/svg/bg_logistic_log_converger.png",
};

function getImgRotation(part: Record<string, unknown> | null): number {
  if (!part?.partId) return 0;
  const face = (part.face as string) || "RIGHT";

  switch (part.partId) {
    case "belt":
      switch (face) {
        case "LEFT":
          return 0;
        case "RIGHT":
          return 180;
        case "UP":
          return -90;
        case "DOWN":
          return 90;
        default:
          return 0;
      }
    case "left_turn_belt":
      return 180;
    case "right_turn_belt":
      return 0;
    case "conveyor_bridge":
      switch (face) {
        case "DOWN":
          return 0;
        case "UP":
          return 180;
        case "LEFT":
          return 90;
        case "RIGHT":
          return -90;
        default:
          return 0;
      }
    case "splitter":
      switch (face) {
        case "RIGHT":
          return -90;
        case "LEFT":
          return 90;
        case "UP":
          return 180;
        case "DOWN":
          return 0;
        default:
          return -90;
      }
    case "converger":
      switch (face) {
        case "DOWN":
          return 0;
        case "UP":
          return 180;
        case "LEFT":
          return 90;
        case "RIGHT":
          return -90;
        default:
          return 0;
      }
    default:
      return 0;
  }
}

function getImgMirror(part: Record<string, unknown> | null): boolean {
  return part?.partId === "right_turn_belt";
}

function getPartClasses(p: Record<string, unknown> | null): string {
  if (!p || !p.partId)
    return "border-endfield-gray-light/20 text-transparent bg-endfield-black/10";
  switch (p.partId) {
    case "input_source":
      return "border-endfield-text-light/70 text-endfield-text-light bg-endfield-gray/80";
    case "thermal_bank":
      return "border-endfield-yellow/60 text-endfield-yellow bg-endfield-yellow/10";
    case "recycle_source":
      return "border-endfield-text/60 text-endfield-text bg-endfield-gray/80";
    default:
      return "border-endfield-gray-light text-endfield-text bg-endfield-black/70";
  }
}

export interface BlueprintCellProps {
  part: Record<string, unknown> | null;
  rowIndex: number;
  colIndex: number;
}

export default function BlueprintCell({
  part,
  rowIndex: _rowIndex,
  colIndex: _colIndex,
}: BlueprintCellProps) {
  const { t } = useI18n();
  const imgSrc = part?.partId ? BLUEPRINT_IMG[part.partId as string] : null;
  const rotation = getImgRotation(part);
  const mirror = getImgMirror(part);

  if (imgSrc) {
    return (
      <fieldset
        aria-label={t("blueprintCell")}
        className="w-9 h-9 sm:w-10 sm:h-10 border border-endfield-gray-light flex items-center justify-center overflow-hidden bg-endfield-black/30 p-0 m-0"
        onDragStart={(e) => e.preventDefault()}
      >
        <img
          src={imgSrc}
          alt=""
          draggable={false}
          className="w-full h-full object-contain pointer-events-none"
          style={{
            transform: `rotate(${rotation}deg)${mirror ? " scaleX(-1)" : ""}`,
          }}
        />
      </fieldset>
    );
  }

  const arrow = FACE_ARROW[part?.face as string] || ">";
  let token = "?";
  if (part?.partId) {
    switch (part.partId) {
      case "input_source":
        token = "I";
        break;
      case "thermal_bank":
        token = "T";
        break;
      case "recycle_source":
        token = "R";
        break;
      default:
        token = arrow;
    }
  }

  return (
    <div
      className={`w-9 h-9 sm:w-10 sm:h-10 border flex items-center justify-center text-[10px] sm:text-xs font-semibold ${getPartClasses(part)}`}
    >
      {token}
    </div>
  );
}
