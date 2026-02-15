import {
  FUELS,
  CONSTANTS,
  INPUT_SOURCES,
  DEFAULT_INPUT_SOURCE_ID,
  getOscillatingPower,
  analyzeSplitterComplexity,
} from './constants';

const PART_FACE = {
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
};

const PART_FUNCTION = {
  INPUT: 'INPUT',
  OUTPUT: 'OUTPUT',
  RECYCLE: 'RECYCLE',
};

function createPart(partId, face, partFunction = null) {
  if (partFunction) {
    return { partId, face, function: partFunction };
  }
  return { partId, face };
}

function buildBranchBlueprint(threeWay, twoWay) {
  const totalColumns = 1 + threeWay + twoWay + 1;
  const grid = Array.from({ length: 5 }, () => Array(totalColumns).fill(null));

  // Row 3: Input -> splitters -> thermal bank
  grid[2][0] = createPart('input_source', PART_FACE.RIGHT, PART_FUNCTION.INPUT);
  let col = 1;

  for (let i = 0; i < threeWay; i += 1) {
    grid[2][col] = createPart('splitter', PART_FACE.RIGHT);
    grid[0][col] = createPart('converger', PART_FACE.LEFT);
    grid[4][col] = createPart('converger', PART_FACE.LEFT);
    grid[1][col] = createPart('belt', PART_FACE.UP);
    grid[3][col] = createPart('belt', PART_FACE.DOWN);
    col += 1;
  }

  for (let i = 0; i < twoWay; i += 1) {
    grid[2][col] = createPart('splitter', PART_FACE.RIGHT);
    grid[0][col] = createPart('converger', PART_FACE.LEFT);
    grid[1][col] = createPart('belt', PART_FACE.UP);
    col += 1;
  }

  grid[2][col] = createPart('thermal_bank', PART_FACE.RIGHT, PART_FUNCTION.OUTPUT);

  grid[0][0] = createPart('recycle_source', PART_FACE.RIGHT, PART_FUNCTION.RECYCLE);
  if (grid[4].some((cell) => cell !== null)) {
    grid[4][0] = createPart('recycle_source', PART_FACE.RIGHT, PART_FUNCTION.RECYCLE);
  }

  for (let idx = totalColumns - 1; idx >= 0; idx -= 1) {
    if (grid[0][idx]?.partId === 'converger') {
      grid[0][idx] = createPart('left_turn_belt', PART_FACE.UP);
      break;
    }
  }
  for (let idx = totalColumns - 1; idx >= 0; idx -= 1) {
    if (grid[4][idx]?.partId === 'converger') {
      grid[4][idx] = createPart('right_turn_belt', PART_FACE.DOWN);
      break;
    }
  }

  return grid;
}

function buildSolutionOutput({
  baseConfig,
  primaryFuel,
  targetPower,
  inputInterval,
  inputSourceId,
  batteryCapacity,
  baseFuelPerSec,
  solution,
  oscillatingFuelPerSec,
}) {
  if (!solution) {
    return {
      baseConfig,
      baseFuel: primaryFuel,
      oscillating: null,
      oscillatingFuel: null,
      fuel: primaryFuel,
      isPrimary: true,
      inputInterval,
      inputSourceId,
      avgPower: baseConfig.totalPower,
      waste: baseConfig.totalPower - targetPower,
      variance: 0,
      period: 0,
      minBattery: batteryCapacity,
      minBatteryPercent: 100,
      branchCount: 0,
      totalSplitters: 0,
      batteryLog: [batteryCapacity],
      powerLog: [baseConfig.totalPower],
      burnStateLog: [],
      preciseBatteryLog: [batteryCapacity],
      precisePowerLog: [baseConfig.totalPower],
      preciseBurnStateLog: [],
      fuelConsumption: {
        base: {
          fuel: primaryFuel,
          perSecond: baseFuelPerSec,
          perMinute: baseFuelPerSec * 60,
          perHour: baseFuelPerSec * 3600,
          perDay: baseFuelPerSec * 86400,
        },
        oscillating: {
          fuel: null,
          perSecond: 0,
          perMinute: 0,
          perHour: 0,
          perDay: 0,
        },
      },
    };
  }

  return {
    baseConfig,
    baseFuel: primaryFuel,
    oscillating: solution.branches,
    oscillatingFuel: solution.fuel,
    fuel: solution.fuel,
    isPrimary: solution.isPrimary,
    inputInterval,
    inputSourceId,
    avgPower: solution.avgPower,
    waste: solution.waste,
    variance: solution.variance,
    period: solution.period,
    minBattery: solution.minBattery,
    minBatteryPercent: solution.minBatteryPercent,
    branchCount: solution.branchCount,
    totalSplitters: solution.totalSplitters,
    batteryLog: solution.batteryLog,
    powerLog: solution.powerLog,
    burnStateLog: solution.burnStateLog,
    preciseBatteryLog: solution.preciseBatteryLog,
    precisePowerLog: solution.precisePowerLog,
    preciseBurnStateLog: solution.preciseBurnStateLog,
    fuelConsumption: {
      base: {
        fuel: primaryFuel,
        perSecond: baseFuelPerSec,
        perMinute: baseFuelPerSec * 60,
        perHour: baseFuelPerSec * 3600,
        perDay: baseFuelPerSec * 86400,
      },
      oscillating: {
        fuel: solution.fuel,
        perSecond: oscillatingFuelPerSec,
        perMinute: oscillatingFuelPerSec * 60,
        perHour: oscillatingFuelPerSec * 3600,
        perDay: oscillatingFuelPerSec * 86400,
      },
    },
  };
}

class PowerCycleSimulator {
  constructor({ targetPower, minBatteryPercent, batteryCapacity, inputInterval }) {
    this.targetPower = targetPower;
    this.minBatteryPercent = minBatteryPercent;
    this.batteryCapacity = batteryCapacity;
    this.inputInterval = inputInterval;
  }

  _gcd(a, b) {
    return b === 0 ? a : this._gcd(b, a % b);
  }

  _lcm(a, b) {
    if (a === 0 || b === 0) {
      return 0;
    }
    return Math.abs(a * b) / this._gcd(a, b);
  }

  _getCyclePeriod(denominators) {
    if (denominators.length === 0) {
      return this.inputInterval;
    }

    const intervals = denominators.map((d) => this.inputInterval * d);
    let period = this.inputInterval;
    for (const interval of intervals) {
      period = this._lcm(period, interval);
    }
    return period;
  }

  simulateCycle(baseConfig, oscillatingBranches, fuel) {
    const period = this._getCyclePeriod(oscillatingBranches.map((b) => b.denominator));
    if (period > 100000) {
      return { success: false, reason: 'period_too_long' };
    }

    const numCycles = 3;
    const totalDuration = period * numCycles;
    const timelineSize = Math.ceil(totalDuration);

    const powerTimeline = new Array(timelineSize).fill(0);
    const branchBurnTimeline = oscillatingBranches.map(() => new Array(timelineSize).fill(0));

    for (const [branchIndex, branch] of oscillatingBranches.entries()) {
      const inputInterval = this.inputInterval * branch.denominator;
      let lastBurnEnd = 0;

      for (let t = 0; t < totalDuration; t += inputInterval) {
        const burnStart = Math.max(t, lastBurnEnd);
        const burnEnd = burnStart + fuel.burnTime;
        lastBurnEnd = burnEnd;

        const start = Math.floor(burnStart);
        const end = Math.min(Math.ceil(burnEnd), totalDuration);
        for (let i = start; i < end; i += 1) {
          powerTimeline[i] += fuel.power;
          branchBurnTimeline[branchIndex][i] = 1;
        }
      }
    }

    const checkStart = Math.floor(totalDuration - period);
    const cyclePower = powerTimeline.slice(checkStart, totalDuration);

    const minBatteryRequired = (this.batteryCapacity * this.minBatteryPercent) / 100;
    let battery = this.batteryCapacity;
    let minBattery = battery;
    const batteryLog = [];
    const powerLog = [];
    const burnStateLog = oscillatingBranches.map(() => []);
    const preciseBatteryLog = [];
    const precisePowerLog = [];
    const preciseBurnStateLog = oscillatingBranches.map(() => []);

    for (let t = 0; t < checkStart; t += 1) {
      const supply = baseConfig.totalPower + powerTimeline[t];
      battery += supply - this.targetPower;
      if (battery > this.batteryCapacity) {
        battery = this.batteryCapacity;
      }
      if (battery < 0) {
        return { success: false, reason: 'battery_depleted_preheat' };
      }
    }

    const sampleStep = period >= 2000 ? Math.ceil(period / 500) : 1;
    for (let t = checkStart; t < totalDuration; t += 1) {
      const supply = baseConfig.totalPower + powerTimeline[t];
      battery += supply - this.targetPower;

      if (battery > this.batteryCapacity) {
        battery = this.batteryCapacity;
      }
      if (battery < minBattery) {
        minBattery = battery;
      }

      if (period < 2000 || (t - checkStart) % sampleStep === 0) {
        batteryLog.push(battery);
        powerLog.push(supply);
        for (let i = 0; i < burnStateLog.length; i += 1) {
          burnStateLog[i].push(branchBurnTimeline[i][t]);
        }
      }

      preciseBatteryLog.push(battery);
      precisePowerLog.push(supply);
      for (let i = 0; i < preciseBurnStateLog.length; i += 1) {
        preciseBurnStateLog[i].push(branchBurnTimeline[i][t]);
      }

      if (battery < minBatteryRequired) {
        return {
          success: false,
          reason: 'battery_below_min',
          minBattery,
        };
      }
    }

    const avgPower =
      cyclePower.reduce((sum, p) => sum + p, 0) / cyclePower.length + baseConfig.totalPower;
    const variance =
      cyclePower.reduce(
        (sum, p) => sum + Math.pow(p - (avgPower - baseConfig.totalPower), 2),
        0,
      ) / cyclePower.length;
    const waste = avgPower - this.targetPower;

    return {
      success: true,
      period,
      avgPower,
      waste,
      variance,
      minBattery,
      minBatteryPercent: (minBattery / this.batteryCapacity) * 100,
      batteryLog,
      powerLog,
      burnStateLog,
      preciseBatteryLog,
      precisePowerLog,
      preciseBurnStateLog,
    };
  }
}

/**
 * 工厂设计器 - 计算最优发电方案
 */
export class FactoryDesigner {
  constructor(params) {
    this.targetPower = params.targetPower;
    this.minBatteryPercent = params.minBatteryPercent;
    this.maxWaste = params.maxWaste;
    this.primaryFuel = FUELS[params.primaryFuelId];
    this.secondaryFuel = params.secondaryFuelId !== 'none' ? FUELS[params.secondaryFuelId] : null;

    const inputSourceId = params.inputSourceId || DEFAULT_INPUT_SOURCE_ID;
    this.inputSource = INPUT_SOURCES[inputSourceId] || INPUT_SOURCES[DEFAULT_INPUT_SOURCE_ID];
    this.inputInterval = this.inputSource.interval;
    this.batteryCapacity = CONSTANTS.BATTERY_CAPACITY;
    this.maxBranches =
      Number.isInteger(params.maxBranches) && params.maxBranches > 0 ? params.maxBranches : 3;

    this.validDenominators = this._generateValidDenominators();
    this.simulator = new PowerCycleSimulator({
      targetPower: this.targetPower,
      minBatteryPercent: this.minBatteryPercent,
      batteryCapacity: this.batteryCapacity,
      inputInterval: this.inputInterval,
    });
  }

  _generateValidDenominators() {
    const denominators = [];
    for (let x = 0; x < 10; x += 1) {
      for (let y = 0; y < 7; y += 1) {
        const value = Math.pow(2, x) * Math.pow(3, y);
        if (value > 1 && value <= 512) {
          denominators.push(value);
        }
      }
    }
    return denominators.sort((a, b) => a - b);
  }

  calculateBasePower() {
    const inputSpeed = this.inputInterval > 0 ? 1 / this.inputInterval : 0;
    const gensPerBelt = inputSpeed * this.primaryFuel.burnTime;
    const needed = this.targetPower - CONSTANTS.BASE_POWER;

    if (needed <= 0) {
      return { generators: 0, totalPower: CONSTANTS.BASE_POWER, belts: 0 };
    }

    const generators = Math.floor(needed / this.primaryFuel.power);
    const totalPower = CONSTANTS.BASE_POWER + generators * this.primaryFuel.power;
    const belts = gensPerBelt > 0 ? Math.ceil(generators / gensPerBelt) : 0;

    return { generators, totalPower, belts };
  }

  _getCombinations(arr, length) {
    if (length === 1) {
      return arr.map((x) => [x]);
    }

    const combinations = [];
    arr.forEach((v, i) => {
      const subs = this._getCombinations(arr.slice(i), length - 1);
      subs.forEach((sub) => combinations.push([v, ...sub]));
    });
    return combinations;
  }

  calculateOscillatingPlans(fuel, baseConfig, isPrimary) {
    const gap = this.targetPower - baseConfig.totalPower;
    if (gap <= 0) {
      return [];
    }

    const solutions = [];
    for (let r = 1; r <= this.maxBranches; r += 1) {
      const combinations = this._getCombinations(this.validDenominators, r);

      for (const combo of combinations) {
        const theoryPower = combo.reduce(
          (sum, d) => sum + getOscillatingPower(fuel, d, this.inputInterval),
          0,
        );
        const theoryTotal = baseConfig.totalPower + theoryPower;
        const theoryWaste = theoryTotal - this.targetPower;
        if (theoryWaste < 0 || theoryWaste > this.maxWaste + 10) {
          continue;
        }

        const branches = combo.map((d) => ({ denominator: d, fuel }));
        const result = this.simulator.simulateCycle(baseConfig, branches, fuel);

        if (result.success && result.waste != null && result.waste >= 0 && result.waste <= this.maxWaste) {
          const complexity = combo.map((d) => analyzeSplitterComplexity(d));
          const totalSplitters = complexity.reduce((sum, c) => sum + c.total, 0);

          solutions.push({
            fuel,
            isPrimary,
            branches: combo.map((d, i) => ({
              denominator: d,
              power: getOscillatingPower(fuel, d, this.inputInterval),
              complexity: complexity[i],
              blueprint: buildBranchBlueprint(complexity[i].threeWay, complexity[i].twoWay),
            })),
            branchCount: combo.length,
            totalSplitters,
            period: result.period ?? 0,
            avgPower: result.avgPower ?? 0,
            waste: result.waste ?? 0,
            variance: result.variance ?? 0,
            minBattery: result.minBattery ?? 0,
            minBatteryPercent: result.minBatteryPercent ?? 0,
            batteryLog: result.batteryLog ?? [],
            powerLog: result.powerLog ?? [],
            burnStateLog: result.burnStateLog ?? [],
            preciseBatteryLog: result.preciseBatteryLog ?? [],
            precisePowerLog: result.precisePowerLog ?? [],
            preciseBurnStateLog: result.preciseBurnStateLog ?? [],
          });
        }
      }
    }

    return solutions;
  }

  solve() {
    const baseConfig = this.calculateBasePower();

    if (baseConfig.totalPower >= this.targetPower) {
      const waste = baseConfig.totalPower - this.targetPower;
      if (waste <= this.maxWaste) {
        const baseFuelPerSec =
          baseConfig.generators > 0 ? baseConfig.generators / this.primaryFuel.burnTime : 0;
        return [
          buildSolutionOutput({
            baseConfig,
            primaryFuel: this.primaryFuel,
            targetPower: this.targetPower,
            inputInterval: this.inputInterval,
            inputSourceId: this.inputSource.id,
            batteryCapacity: this.batteryCapacity,
            baseFuelPerSec,
            solution: null,
            oscillatingFuelPerSec: 0,
          }),
        ];
      }
    }

    const allSolutions = [];
    allSolutions.push(...this.calculateOscillatingPlans(this.primaryFuel, baseConfig, true));
    if (this.secondaryFuel) {
      allSolutions.push(...this.calculateOscillatingPlans(this.secondaryFuel, baseConfig, false));
    }

    allSolutions.sort((a, b) => {
      const keyA = [
        a.branchCount,
        Math.round(a.variance * 10) / 10,
        Math.round(a.waste * 10) / 10,
        a.isPrimary ? 0 : 1,
      ];
      const keyB = [
        b.branchCount,
        Math.round(b.variance * 10) / 10,
        Math.round(b.waste * 10) / 10,
        b.isPrimary ? 0 : 1,
      ];
      for (let i = 0; i < keyA.length; i += 1) {
        if (keyA[i] !== keyB[i]) {
          return keyA[i] - keyB[i];
        }
      }
      return 0;
    });

    const outputs = [];
    for (const solution of allSolutions.slice(0, 5)) {
      const baseFuelPerSec =
        baseConfig.generators > 0 ? baseConfig.generators / this.primaryFuel.burnTime : 0;
      const oscillatingFuelPerSec = solution.branches
        ? solution.branches.reduce(
          (sum, branch) => sum + 1 / (this.inputInterval * branch.denominator),
          0,
        )
        : 0;

      outputs.push(
        buildSolutionOutput({
          baseConfig,
          primaryFuel: this.primaryFuel,
          targetPower: this.targetPower,
          inputInterval: this.inputInterval,
          inputSourceId: this.inputSource.id,
          batteryCapacity: this.batteryCapacity,
          baseFuelPerSec,
          solution,
          oscillatingFuelPerSec,
        }),
      );
    }

    return outputs;
  }
}
