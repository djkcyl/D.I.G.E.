import { DEFAULT_PARAMS } from "../src/utils/defaultParams.ts";
import { FactoryDesigner } from "../src/utils/FactoryDesigner.ts";

const params = {
  ...DEFAULT_PARAMS,
  targetPower: 7665,
  factoryRegion: "wuling",
  primaryFuelId: "wulingMid",
  autoPlanBasePools: true,
};

const t0 = Date.now();
const r = new FactoryDesigner(params).solve();
const dt = Date.now() - t0;
const filled = r.matrix.flat().filter(Boolean).length;
const def = r.defaultSelection;
const cell = def ? r.matrix[def.row][def.col] : null;
const topRight = r.matrix[0][2];

const grid = r.matrix.map((row) =>
  row.map((c) =>
    c
      ? `${c.avgPower.toFixed(1)}/+${c.waste.toFixed(1)}/b${c.branchCount}`
      : "X",
  ),
);

const topRightOk =
  topRight &&
  Math.abs(topRight.avgPower - 9800) < 0.2 &&
  Math.abs(topRight.waste - 2135) < 0.2 &&
  topRight.branchCount === 0 &&
  (topRight.oscillating == null || topRight.oscillating.length === 0) &&
  (topRight.baseDetails?.autoBaseCount ?? 0) === 3 &&
  (topRight.totalSplitters ?? 0) === 0;

console.log(
  JSON.stringify(
    {
      ms: dt,
      solutions: r.solutions.length,
      filled,
      defaultSelection: def,
      default: cell && {
        avgPower: cell.avgPower,
        waste: cell.waste,
        branchCount: cell.branchCount,
        autoBase: cell.baseDetails?.autoBaseCount,
        minBat: cell.minBatteryPercent,
      },
      topRight: topRight && {
        avgPower: topRight.avgPower,
        waste: topRight.waste,
        branchCount: topRight.branchCount,
        autoBase: topRight.baseDetails?.autoBaseCount,
        osc: topRight.oscillating?.length ?? 0,
        splitters: topRight.totalSplitters,
        fuel: topRight.baseDetails?.autoBaseFuel?.id,
      },
      topRightOk,
      grid,
    },
    null,
    2,
  ),
);

if (!topRightOk) {
  console.error("FAIL: cell (0,2) must be 9800W (+2135W) 3× pure mid base");
  process.exit(1);
}
