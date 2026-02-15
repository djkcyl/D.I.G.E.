import { useCallback, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import Icon from './Icon';

const FACE_ARROW = {
  UP: '^',
  DOWN: 'v',
  LEFT: '<',
  RIGHT: '>',
};

function factorDenominator(denominator) {
  let d = denominator;
  const steps = [];
  while (d % 3 === 0) {
    steps.push(3);
    d /= 3;
  }
  while (d % 2 === 0) {
    steps.push(2);
    d /= 2;
  }
  return steps.sort((a, b) => b - a);
}

function BranchLabel({ denominator, power }) {
  return (
    <div className="shrink-0 w-14 text-center self-center">
      <div className="text-xs text-endfield-yellow font-bold">1/{denominator}</div>
      <div className="text-[10px] text-endfield-text">{power.toFixed(0)}w</div>
    </div>
  );
}

function SimpleSplitter({ type, t }) {
  const isTwoWay = type === 2;
  return (
    <div className="flex items-center gap-1 shrink-0">
      <div
        className={`min-w-[46px] sm:min-w-[52px] h-8 sm:h-9 border px-1 flex items-center justify-center ${
          isTwoWay
            ? 'bg-endfield-gray border-endfield-yellow/30 text-endfield-yellow'
            : 'bg-endfield-gray border-endfield-text-light/20 text-endfield-text-light'
        }`}
      >
        <div className="text-xs uppercase font-bold leading-none">
          {isTwoWay ? '2' : '3'}
          {t('waySplit')}
        </div>
      </div>
      <Icon name="arrow_right_alt" className="text-endfield-text/50 shrink-0" />
    </div>
  );
}

function SimpleBranch({ branch, t }) {
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const containerRef = useRef(null);
  const steps = factorDenominator(branch.denominator);

  const handleMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      setDragStart(e.clientX + scrollLeft);
      e.preventDefault();
    },
    [scrollLeft],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging || !containerRef.current) return;
      const next = dragStart - e.clientX;
      containerRef.current.scrollLeft = Math.max(0, next);
      setScrollLeft(Math.max(0, next));
    },
    [isDragging, dragStart],
  );

  const stopDragging = useCallback(() => setIsDragging(false), []);

  const handleTouchStart = useCallback(
    (e) => {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart(touch.clientX + scrollLeft);
    },
    [scrollLeft],
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (!isDragging || !containerRef.current) return;
      const touch = e.touches[0];
      const next = dragStart - touch.clientX;
      containerRef.current.scrollLeft = Math.max(0, next);
      setScrollLeft(Math.max(0, next));
    },
    [isDragging, dragStart],
  );

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 py-1 sm:py-2 px-1 sm:px-2">
      <BranchLabel denominator={branch.denominator} power={branch.power} />

      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-visible scrollbar-hide pb-1 touch-pan-x"
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={stopDragging}
      >
        <div className="inline-flex items-center gap-1 w-max px-1.5 py-1.5 border border-endfield-gray-light bg-endfield-black/30">
          <div className="h-7 sm:h-8 min-w-[44px] px-1.5 bg-endfield-gray border border-endfield-text-light/40 flex items-center justify-center gap-1 text-endfield-text-light shrink-0">
            <Icon name="input" className="text-[14px]" />
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase">In</span>
          </div>
          <Icon name="arrow_right_alt" className="text-endfield-text/50 shrink-0" />

          {steps.map((type, idx) => (
            <SimpleSplitter key={`${type}-${idx}`} type={type} t={t} />
          ))}

          <div className="h-7 sm:h-8 px-2 bg-endfield-yellow/10 border border-endfield-yellow/50 flex items-center gap-1 text-endfield-yellow shrink-0">
            <Icon name="bolt" />
            <span className="text-xs font-bold uppercase">{t('gen')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getPartToken(part) {
  if (!part || !part.partId) return '';
  const arrow = FACE_ARROW[part.face] || '>';
  switch (part.partId) {
    case 'input_source':
      return `I${arrow}`;
    case 'thermal_bank':
      return `T${arrow}`;
    case 'splitter':
      return `S${arrow}`;
    case 'converger':
      return `M${arrow}`;
    case 'recycle_source':
      return `R${arrow}`;
    case 'left_turn_belt':
      return `L${arrow}`;
    case 'right_turn_belt':
      return `R${arrow}`;
    case 'belt':
      return arrow;
    default:
      return '?';
  }
}

function getPartClasses(part) {
  if (!part || !part.partId) {
    return 'border-endfield-gray-light/20 text-transparent bg-endfield-black/10';
  }
  switch (part.partId) {
    case 'input_source':
      return 'border-endfield-text-light/70 text-endfield-text-light bg-endfield-gray/80';
    case 'thermal_bank':
      return 'border-endfield-yellow/60 text-endfield-yellow bg-endfield-yellow/10';
    case 'splitter':
      return 'border-endfield-yellow/50 text-endfield-yellow bg-endfield-gray/80';
    case 'converger':
      return 'border-endfield-text-light/50 text-endfield-text-light bg-endfield-gray/80';
    case 'recycle_source':
      return 'border-endfield-text/60 text-endfield-text bg-endfield-gray/80';
    default:
      return 'border-endfield-gray-light text-endfield-text bg-endfield-black/70';
  }
}

function BlueprintBranch({ branch }) {
  const { denominator, power, blueprint } = branch;
  const hasBlueprint =
    Array.isArray(blueprint) && blueprint.length > 0 && Array.isArray(blueprint[0]);

  return (
    <div className="flex items-center gap-2 sm:gap-3 py-2 sm:py-3 px-1 sm:px-2">
      <BranchLabel denominator={denominator} power={power} />
      <div className="flex-1 overflow-x-auto pb-1">
        {hasBlueprint ? (
          <div className="blueprint-grid inline-block border border-endfield-gray-light p-2">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${blueprint[0].length}, minmax(0, 1fr))` }}
            >
              {blueprint.flatMap((row, rowIndex) =>
                row.map((part, colIndex) => (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className={`w-7 h-7 sm:w-8 sm:h-8 border flex items-center justify-center text-[10px] sm:text-xs font-semibold ${getPartClasses(part)}`}
                  >
                    {getPartToken(part)}
                  </div>
                )),
              )}
            </div>
          </div>
        ) : (
          <div className="h-8 px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 inline-flex items-center text-[10px] font-semibold">
            I&gt; S&gt; M&lt; T&gt; R&gt;
          </div>
        )}
      </div>
    </div>
  );
}

function BlueprintLegend({ t }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-endfield-text-light">
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 min-w-[34px] px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 flex items-center justify-center text-[10px] font-semibold">
          I
        </div>
        <span>{t('legendBlueprintI')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 min-w-[34px] px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 flex items-center justify-center text-[10px] font-semibold">
          S
        </div>
        <span>{t('legendBlueprintS')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 min-w-[34px] px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 flex items-center justify-center text-[10px] font-semibold">
          M
        </div>
        <span>{t('legendBlueprintM')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 min-w-[34px] px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 flex items-center justify-center text-[10px] font-semibold">
          T
        </div>
        <span>{t('legendBlueprintT')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 min-w-[34px] px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 flex items-center justify-center text-[10px] font-semibold">
          R
        </div>
        <span>{t('legendBlueprintR')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 flex items-center text-[10px] font-semibold">
          ^ v &lt; &gt;
        </div>
        <span>{t('legendBlueprintFace')}</span>
      </div>
    </div>
  );
}

function SimpleLegend({ t }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-endfield-text-light">
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="w-6 h-6 bg-endfield-gray border border-endfield-text-light/40 flex items-center justify-center">
          <Icon name="input" className="text-[14px]" />
        </div>
        <span>{t('legendInputSource')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="min-w-[30px] h-6 border border-endfield-yellow/30 text-endfield-yellow bg-endfield-yellow/10 flex items-center justify-center font-bold">
          2{t('waySplit')}
        </div>
        <span>{t('legendSplit2')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="min-w-[30px] h-6 border border-endfield-text-light/30 text-endfield-text-light bg-endfield-gray/80 flex items-center justify-center font-bold">
          3{t('waySplit')}
        </div>
        <span>{t('legendSplit3')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 px-2 border border-endfield-yellow/50 bg-endfield-yellow/10 text-endfield-yellow flex items-center gap-1">
          <Icon name="bolt" className="text-[13px]" />
        </div>
        <span>{t('legendGenerator')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <Icon name="arrow_right_alt" className="text-endfield-text/70" />
        <span>{t('legendFlowDirection')}</span>
      </div>
    </div>
  );
}

export default function SolutionDiagram({ solution }) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState('blueprint');

  if (!solution) {
    return (
      <div className="h-32 flex items-center justify-center text-endfield-text text-sm">
        {t('noSolutionData')}
      </div>
    );
  }

  const getFuelName = (fuel) => {
    if (!fuel) return '-';
    return fuel.name[locale] || fuel.name.en;
  };

  const { baseConfig, baseFuel, oscillating, oscillatingFuel, inputSourceId } = solution;
  const baseFuelData = baseFuel || solution.fuel;
  const oscFuelData = oscillatingFuel || solution.fuel;
  const showPackerWarning = inputSourceId === 'packer';

  return (
    <div className="space-y-2 sm:space-y-3 notranslate" translate="no">
      {showPackerWarning && (
        <div className="p-2.5 bg-red-900/20 border border-red-900/50 text-sm text-red-300 flex items-center gap-2">
          <Icon name="warning" />
          <span>{t('inputWarningPacker')}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 p-3 bg-endfield-gray border border-endfield-gray-light">
        <Icon name="factory" className="text-endfield-yellow" />
        <span className="text-sm text-endfield-text uppercase">{t('basePowerShort')}:</span>
        {baseConfig.generators > 0 ? (
          <>
            <span className="text-sm font-bold text-endfield-text-light">{baseConfig.generators}</span>
            <span className="text-sm text-endfield-text">x {getFuelName(baseFuelData)}</span>
            <span className="text-sm text-endfield-text">=</span>
            <span className="text-sm font-bold text-endfield-yellow">{baseConfig.totalPower}w</span>
            <span className="text-xs text-endfield-text/70">
              (200w + {baseConfig.generators * baseFuelData.power}w)
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-bold text-endfield-yellow">200w</span>
            <span className="text-xs text-endfield-text/70">({t('baseOnlyHint')})</span>
          </>
        )}
      </div>

      {oscillating && oscillating.length > 0 && (
        <div className="border border-endfield-gray-light bg-endfield-gray/30">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-endfield-gray-light bg-endfield-gray/50">
            <Icon name="electric_bolt" className="text-endfield-yellow" />
            <span className="text-sm text-endfield-text uppercase">{t('oscillatingShort')}:</span>
            <span className="text-sm font-bold text-endfield-text-light">{oscillating.length}</span>
            <span className="text-sm text-endfield-text">x {getFuelName(oscFuelData)}</span>
            <span className="text-sm text-endfield-text">=</span>
            <span className="text-sm font-bold text-endfield-yellow">
              {oscillating.reduce((sum, b) => sum + b.power, 0).toFixed(0)}w
            </span>
            <span className="text-xs text-endfield-text/70">
              ({oscillating.map((b) => `${b.power.toFixed(0)}w`).join(' + ')})
            </span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-endfield-text/60">{t('diagramViewMode')}:</span>
              <div className="inline-flex border border-endfield-gray-light bg-endfield-gray/80">
                <button
                  type="button"
                  onClick={() => setMode('blueprint')}
                  className={`px-2 py-1 text-xs transition-colors ${
                    mode === 'blueprint'
                      ? 'text-endfield-yellow bg-endfield-yellow/10'
                      : 'text-endfield-text-light hover:text-endfield-yellow'
                  }`}
                >
                  {t('blueprintMode')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('simple')}
                  className={`px-2 py-1 text-xs border-l border-endfield-gray-light transition-colors ${
                    mode === 'simple'
                      ? 'text-endfield-yellow bg-endfield-yellow/10'
                      : 'text-endfield-text-light hover:text-endfield-yellow'
                  }`}
                >
                  {t('simpleMode')}
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-endfield-gray-light/50">
            {oscillating.map((branch, idx) =>
              mode === 'simple' ? (
                <SimpleBranch key={idx} branch={branch} t={t} />
              ) : (
                <BlueprintBranch key={idx} branch={branch} />
              ),
            )}
          </div>
        </div>
      )}

      {oscillating && oscillating.length > 0 && (
        <div className="border border-endfield-gray-light bg-endfield-gray/20 p-3 sm:p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-endfield-text uppercase tracking-widest">
                {t('diagramLegend')}
              </div>
              <div className="text-[10px] sm:text-xs text-endfield-text/60">
                {mode === 'blueprint' ? t('blueprintMode') : t('simpleMode')}
              </div>
            </div>
            {mode === 'blueprint' ? <BlueprintLegend t={t} /> : <SimpleLegend t={t} />}
          </div>

          <div className="pt-3 border-t border-endfield-gray-light/70">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-endfield-text uppercase tracking-widest">
                {t('diagramTutorial')}
              </div>
              <div className="text-[10px] sm:text-xs text-endfield-text/60">
                {mode === 'blueprint' ? t('blueprintMode') : t('simpleMode')}
              </div>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-xs text-endfield-text/80">
              <li>{t('diagramTutorialStep1')}</li>
              <li>{t('diagramTutorialStep2')}</li>
              <li>{mode === 'blueprint' ? t('diagramTutorialBlueprint') : t('diagramTutorialSimple')}</li>
              <li>{t('diagramTutorialStep4')}</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
