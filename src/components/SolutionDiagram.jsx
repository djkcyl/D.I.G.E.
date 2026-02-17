import { useCallback, useEffect, useRef, useState } from 'react';
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

const BLUEPRINT_IMG = {
  belt: '/svg/icon_belt_grid.png',
  left_turn_belt: '/svg/icon_belt_corner_1.png',
  right_turn_belt: '/svg/icon_belt_corner_1.png',
  conveyor_bridge: '/svg/bg_logistic_log_connector.png',
  splitter: '/svg/bg_logistic_log_splitter.png',
  converger: '/svg/bg_logistic_log_converger.png',
};

/**
 * 根据 face 和 PNG 原始方向计算旋转角度（度）
 * 原始方向：icon_belt_grid 左进右出，icon_belt_corner_1 上进右出，
 * bg_logistic_log_connector 上→下，bg_logistic_log_splitter 上侧进/右下左侧出，
 * bg_logistic_log_converger 下侧出/左上右侧进
 */
function getImgRotation(part) {
  if (!part?.partId) return 0;
  const face = part.face || 'RIGHT';

  switch (part.partId) {
    case 'belt':
      // icon_belt_grid: 左进右出，face 为传送带流向
      switch (face) {
        case 'LEFT': return 0;
        case 'RIGHT': return 180;
        case 'UP': return -90;
        case 'DOWN': return 90;
        default: return 0;
      }
    case 'left_turn_belt':
      // icon_belt_corner_1 上进右出，left_turn 需 下→左
      return 180;
    case 'right_turn_belt':
      // icon_belt_corner_1 上进右出，right_turn 需 上→左（镜像即可）
      return 0;
    case 'conveyor_bridge':
      // bg_logistic_log_connector: 上→下
      switch (face) {
        case 'DOWN': return 0;
        case 'UP': return 180;
        case 'LEFT': return 90;
        case 'RIGHT': return -90;
        default: return 0;
      }
    case 'splitter':
      // bg_logistic_log_splitter: 上侧进，右下左侧出
      switch (face) {
        case 'RIGHT': return -90;
        case 'LEFT': return 90;
        case 'UP': return 180;
        case 'DOWN': return 0;
        default: return -90;
      }
    case 'converger':
      // bg_logistic_log_converger: 下侧出，左上右侧进
      switch (face) {
        case 'DOWN': return 0;
        case 'UP': return 180;
        case 'LEFT': return 90;
        case 'RIGHT': return -90;
        default: return 0;
      }
    default:
      return 0;
  }
}

/** right_turn_belt 上→左 需镜像（PNG 上进右出，镜像后上进左出） */
function getImgMirror(part) {
  return part?.partId === 'right_turn_belt';
}

function BlueprintCell({ part, rowIndex, colIndex }) {
  const imgSrc = part?.partId ? BLUEPRINT_IMG[part.partId] : null;
  const rotation = getImgRotation(part);
  const mirror = getImgMirror(part);

  if (imgSrc) {
    return (
      <div
        key={`${rowIndex}-${colIndex}`}
        className="w-9 h-9 sm:w-10 sm:h-10 border border-endfield-gray-light flex items-center justify-center overflow-hidden bg-endfield-black/30"
      >
        <img
          src={imgSrc}
          alt=""
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="w-full h-full object-contain pointer-events-none"
          style={{ transform: `rotate(${rotation}deg)${mirror ? ' scaleX(-1)' : ''}` }}
        />
      </div>
    );
  }

  const arrow = FACE_ARROW[part?.face] || '>';
  let token = '?';
  if (part?.partId) {
    switch (part.partId) {
      case 'input_source':
        token = 'I';
        break;
      case 'thermal_bank':
        token = 'T';
        break;
      case 'recycle_source':
        token = 'R';
        break;
      default:
        token = arrow;
    }
  }

  const getPartClasses = (p) => {
    if (!p || !p.partId) return 'border-endfield-gray-light/20 text-transparent bg-endfield-black/10';
    switch (p.partId) {
      case 'input_source':
        return 'border-endfield-text-light/70 text-endfield-text-light bg-endfield-gray/80';
      case 'thermal_bank':
        return 'border-endfield-yellow/60 text-endfield-yellow bg-endfield-yellow/10';
      case 'recycle_source':
        return 'border-endfield-text/60 text-endfield-text bg-endfield-gray/80';
      default:
        return 'border-endfield-gray-light text-endfield-text bg-endfield-black/70';
    }
  };

  return (
    <div
      key={`${rowIndex}-${colIndex}`}
      className={`w-9 h-9 sm:w-10 sm:h-10 border flex items-center justify-center text-[10px] sm:text-xs font-semibold ${getPartClasses(part)}`}
    >
      {token}
    </div>
  );
}

const BLUEPRINT_ZOOM_MIN = 1;
const BLUEPRINT_ZOOM_MAX = 3;

function BlueprintBranch({ branch, zoom = 1, onWheelZoom, onTouchStart: onPinchStart, onTouchMove: onPinchMove, onTouchEnd: onPinchEnd }) {
  const { denominator, power, blueprint } = branch;
  const hasBlueprint =
    Array.isArray(blueprint) && blueprint.length > 0 && Array.isArray(blueprint[0]);
  const scrollRef = useRef(null);
  const [isPanning, setIsPanning] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const isPanningRef = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setCanScroll(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [branch, zoom]);

  const handlePanStart = useCallback((clientX, clientY) => {
    const el = scrollRef.current;
    if (!el || (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)) return;
    isPanningRef.current = true;
    setIsPanning(true);
    panStartRef.current = {
      x: clientX,
      y: clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
  }, []);

  const handlePanMove = useCallback((clientX, clientY) => {
    if (!isPanningRef.current || !scrollRef.current) return;
    const el = scrollRef.current;
    const { x, y, scrollLeft, scrollTop } = panStartRef.current;
    const z = zoomRef.current;
    const dx = (clientX - x) / z;
    const dy = (clientY - y) / z;
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollLeft = Math.max(0, Math.min(maxScrollLeft, scrollLeft - dx));
    el.scrollTop = Math.max(0, Math.min(maxScrollTop, scrollTop - dy));
  }, []);

  const handlePanEnd = useCallback(() => {
    isPanningRef.current = false;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e) => handlePanMove(e.clientX, e.clientY);
    const onUp = () => handlePanEnd();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isPanning, handlePanMove, handlePanEnd]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e) => {
      if (e.touches.length === 2) {
        onPinchMove?.(e);
      } else if (e.touches.length === 1 && isPanningRef.current) {
        e.preventDefault();
      }
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, [onPinchMove]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onWheelZoom) return;
    const handler = (e) => {
      onWheelZoom(e);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [onWheelZoom]);

  const onMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      handlePanStart(e.clientX, e.clientY);
      e.preventDefault();
    },
    [handlePanStart],
  );

  const onMouseMove = useCallback(
    (e) => {
      handlePanMove(e.clientX, e.clientY);
    },
    [handlePanMove],
  );

  const onTouchStart = useCallback(
    (e) => {
      if (e.touches.length === 1) handlePanStart(e.touches[0].clientX, e.touches[0].clientY);
      if (e.touches.length >= 2) handlePanEnd();
    },
    [handlePanStart, handlePanEnd],
  );

  const onTouchMove = useCallback(
    (e) => {
      if (e.touches.length >= 2) {
        handlePanEnd();
        return;
      }
      if (e.touches.length === 1) handlePanMove(e.touches[0].clientX, e.touches[0].clientY);
    },
    [handlePanMove, handlePanEnd],
  );

  return (
    <div className="flex flex-col gap-1.5 py-2 sm:py-3 px-1 sm:px-2">
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-auto pb-1 select-none min-h-0 min-w-0"
        style={{ cursor: canScroll ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
        onMouseDown={onMouseDown}
        onMouseUp={handlePanEnd}
        onMouseLeave={handlePanEnd}
        onTouchStart={(e) => {
          onPinchStart?.(e);
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            handlePanStart(touch.clientX, touch.clientY);
          }
          if (e.touches.length >= 2) handlePanEnd();
        }}
        onTouchMove={(e) => {
          if (e.touches.length >= 2) handlePanEnd();
          else if (e.touches.length === 1) handlePanMove(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchEnd={(e) => {
          onPinchEnd?.();
          handlePanEnd();
        }}
      >
        <div className="w-max mx-auto">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <span className="text-xs text-endfield-yellow font-bold">1/{denominator}</span>
            <span className="text-[10px] text-endfield-text">{power.toFixed(0)}w</span>
          </div>
          {hasBlueprint ? (
          <div className="blueprint-grid inline-block border border-endfield-gray-light p-2 select-none w-max">
            <div
              className="grid gap-0 select-none w-max"
              style={{ gridTemplateColumns: `repeat(${blueprint[0].length}, minmax(2.5rem, 1fr))` }}
            >
              {blueprint.flatMap((row, rowIndex) =>
                row.map((part, colIndex) => (
                  <BlueprintCell key={`${rowIndex}-${colIndex}`} part={part} rowIndex={rowIndex} colIndex={colIndex} />
                )),
              )}
            </div>
          </div>
          ) : (
          <div className="h-8 px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 inline-flex items-center text-[10px] font-semibold">
            I S M T R
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BlueprintLegend({ t }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-endfield-text-light">
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 w-6 border border-endfield-gray-light bg-endfield-black/50 flex items-center justify-center overflow-hidden shrink-0">
          <img src="/svg/bg_logistic_log_splitter.png" alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" style={{ transform: 'rotate(-90deg)' }} />
        </div>
        <span>{t('legendBlueprintS')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 w-6 border border-endfield-gray-light bg-endfield-black/50 flex items-center justify-center overflow-hidden shrink-0">
          <img src="/svg/bg_logistic_log_converger.png" alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" style={{ transform: 'rotate(-90deg)' }} />
        </div>
        <span>{t('legendBlueprintM')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 min-w-[34px] px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 flex items-center justify-center text-[10px] font-semibold">
          I
        </div>
        <span>{t('legendBlueprintI')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 min-w-[34px] px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 flex items-center justify-center text-[10px] font-semibold">
          R
        </div>
        <span>{t('legendBlueprintR')}</span>
      </div>
      <div className="flex items-center gap-2 border border-endfield-gray-light bg-endfield-gray/60 px-2 py-1.5">
        <div className="h-6 min-w-[34px] px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 flex items-center justify-center text-[10px] font-semibold">
          T
        </div>
        <span>{t('legendBlueprintT')}</span>
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
  const [blueprintZoom, setBlueprintZoom] = useState(1);
  const pinchRef = useRef({ initialDistance: 0, initialZoom: 1 });
  const blueprintContainerRef = useRef(null);

  const clampZoom = useCallback((z) => Math.max(BLUEPRINT_ZOOM_MIN, Math.min(BLUEPRINT_ZOOM_MAX, z)), []);

  const handleBlueprintWheel = useCallback(
    (e) => {
      if (mode !== 'blueprint') return;
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      setBlueprintZoom((z) => clampZoom(z + delta));
    },
    [mode, clampZoom],
  );

  const handleBlueprintTouchStart = useCallback(
    (e) => {
      if (mode !== 'blueprint' || e.touches.length !== 2) return;
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY,
      );
      pinchRef.current = { initialDistance: dist, initialZoom: blueprintZoom };
    },
    [mode, blueprintZoom],
  );

  const handleBlueprintTouchMove = useCallback(
    (e) => {
      if (e.touches.length !== 2 || !pinchRef.current.initialDistance) return;
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY,
      );
      const { initialDistance, initialZoom } = pinchRef.current;
      const scale = dist / initialDistance;
      setBlueprintZoom(clampZoom(initialZoom * scale));
    },
    [clampZoom],
  );

  const handleBlueprintTouchEnd = useCallback(() => {
    pinchRef.current = { initialDistance: 0, initialZoom: 1 };
  }, []);

  useEffect(() => {
    if (mode !== 'blueprint') setBlueprintZoom(1);
  }, [mode]);



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

  const { baseConfig, baseFuel, oscillating, oscillatingFuel, inputSourceId, exclude_belt } = solution;
  const baseFuelData = baseFuel || solution.fuel;
  const oscFuelData = oscillatingFuel || solution.fuel;
  const showPackerWarning = inputSourceId === 'packer';
  const showExcludeBeltWarning = exclude_belt === false;

  return (
    <div className="space-y-2 sm:space-y-3 notranslate" translate="no">
      {showPackerWarning && (
        <div className="p-2.5 bg-red-900/20 border border-red-900/50 text-sm text-red-300 flex items-center gap-2">
          <Icon name="warning" />
          <span>{t('inputWarningPacker')}</span>
        </div>
      )}

      {showExcludeBeltWarning && (
        <div className="p-2.5 bg-red-900/20 border border-red-900/50 text-sm text-red-300 flex items-center gap-2">
          <Icon name="warning" />
          <span>{t('excludeBeltWarning')}</span>
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

          <div
            ref={blueprintContainerRef}
            className={`flex gap-3 p-2 sm:p-3 ${mode === 'simple' ? 'flex-col' : 'flex-wrap justify-center'}`}
          >
            {oscillating.map((branch, idx) => (
              <div
                key={idx}
                className={mode === 'simple' ? 'w-full' : 'min-w-[min(100%,360px)]'}
                style={mode === 'blueprint' ? { zoom: blueprintZoom } : undefined}
              >
                {mode === 'simple' ? (
                  <SimpleBranch branch={branch} t={t} />
                ) : (
                  <BlueprintBranch
                    branch={branch}
                    zoom={blueprintZoom}
                    onWheelZoom={handleBlueprintWheel}
                    onTouchStart={handleBlueprintTouchStart}
                    onTouchMove={handleBlueprintTouchMove}
                    onTouchEnd={handleBlueprintTouchEnd}
                  />
                )}
              </div>
            ))}
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
