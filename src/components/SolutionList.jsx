import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { formatTime, CONSTANTS, FUELS } from '../utils/constants';
import SolutionChart from './SolutionChart';
import SolutionDiagram from './SolutionDiagram';
import Icon from './Icon';

export default function SolutionList({ solutions, selectedIndex, onSelectSolution, params }) {
  const { t, locale } = useI18n();
  const [hideHoverDetails, setHideHoverDetails] = useState(false);
  const [preciseValues, setPreciseValues] = useState(false);
  const [showChartDataDesc, setShowChartDataDesc] = useState(true);
  const chartHeaderRef = useRef(null);
  const chartControlsRef = useRef(null);
  const chartDescRef = useRef(null);
  const [collapsedSections, setCollapsedSections] = useState({
    chart: false,
    fuel: false,
    diagram: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHideHoverDetails(window.matchMedia('(max-width: 768px)').matches);
  }, []);

  useEffect(() => {
    const headerEl = chartHeaderRef.current;
    if (!headerEl) return;

    const updateChartHeaderLayout = () => {
      const rowWidth = headerEl.clientWidth;
      const controlsWidth = chartControlsRef.current?.offsetWidth || 0;
      const descWidth = chartDescRef.current?.scrollWidth || 0;
      setShowChartDataDesc(rowWidth >= controlsWidth + descWidth + 24);
    };

    updateChartHeaderLayout();
    const observer = new ResizeObserver(updateChartHeaderLayout);
    observer.observe(headerEl);
    if (chartControlsRef.current) observer.observe(chartControlsRef.current);

    return () => observer.disconnect();
  }, [t, preciseValues, hideHoverDetails]);

  if (!solutions || solutions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-endfield-text">
        <div className="text-center max-w-sm px-4">
          <Icon name="calculate" className="mb-2" />
          <p className="mb-2">{t('clickCalculate')}</p>
          <p className="text-xs text-endfield-text/60">{t('adjustParamsHint')}</p>
        </div>
      </div>
    );
  }

  const selectedSolution = solutions[selectedIndex];

  const getFuelName = (fuel) => {
    if (!fuel) return '-';
    return fuel.name[locale] || fuel.name.en;
  };

  const getOscillatingSavings = () => {
    const oscillatingConsumption = selectedSolution?.fuelConsumption?.oscillating;
    const fuel = oscillatingConsumption?.fuel;
    const oscillatingBranches = selectedSolution?.oscillating || [];

    if (!fuel || oscillatingBranches.length === 0 || !fuel.power || !fuel.burnTime) {
      return null;
    }

    const oscillatingPower = oscillatingBranches.reduce((sum, branch) => sum + branch.power, 0);
    const neededGens = Math.max(1, Math.ceil(oscillatingPower / fuel.power));
    const fullBeltPerDay = neededGens * (1 / fuel.burnTime) * 86400;
    const savedPerDay = fullBeltPerDay - oscillatingConsumption.perDay;

    if (savedPerDay <= 0) {
      return null;
    }

    return {
      savedPerDay,
      savedPercent: fullBeltPerDay > 0 ? (savedPerDay / fullBeltPerDay * 100) : 0,
    };
  };

  const oscillatingSavings = getOscillatingSavings();
  const toggleSection = (key) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden notranslate" translate="no">
      {/* 方案选择 + 数据摘要 - 紧凑横向布局 */}
      <div className="shrink-0 p-2 sm:p-4 border-b border-endfield-gray-light bg-endfield-dark/50">
        {/* 方案标签 */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-sm text-endfield-text uppercase tracking-widest">{t('selectSolution')}:</span>
          <div className="flex gap-1">
            {solutions.map((sol, idx) => (
              <button
                key={idx}
                onClick={() => onSelectSolution(idx)}
                className={`px-3 py-1.5 text-sm transition-colors border ${
                  selectedIndex === idx
                    ? 'text-endfield-yellow border-endfield-yellow bg-endfield-yellow/10'
                    : 'text-endfield-text border-endfield-gray-light hover:border-endfield-text'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* 数据摘要 - 响应式布局 */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4 text-sm">
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-endfield-text">{t('branchesShort')}:</span>
            <span className="text-endfield-text-light">{selectedSolution.branchCount}</span>
            <span className="text-endfield-text">({selectedSolution.isPrimary ? t('primaryOnly') : t('useSecondary')})</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-endfield-text">{t('actualPower')}:</span>
            <span className="text-endfield-text-light">{selectedSolution.avgPower.toFixed(1)}w</span>
            <span className={`${selectedSolution.waste >= 0 ? 'text-endfield-yellow' : 'text-green-400'}`}>
              ({selectedSolution.waste >= 0 ? '+' : ''}{selectedSolution.waste.toFixed(1)})
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-endfield-text">{t('cyclePeriod')}:</span>
            <span className="text-endfield-text-light">
              {selectedSolution.period > 0 ? formatTime(selectedSolution.period) : '--:--'}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-endfield-text">{t('minBatteryShort')}:</span>
            <span className="text-endfield-text-light">{selectedSolution.minBatteryPercent?.toFixed(1) || '100'}%</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-endfield-text">{t('variance')}:</span>
            <span className="text-endfield-text-light">{selectedSolution.variance?.toFixed(2) || '0'}</span>
          </div>
        </div>
      </div>

      {/* 主内容区 - 纵向布局，可滚动 */}
      <div className="flex-1 overflow-auto scrollbar-gutter-stable">
        {/* 图表区 */}
        <div className={`${collapsedSections.chart ? 'px-2 sm:px-4 pt-2 sm:pt-4 pb-2 sm:pb-3' : 'p-2 sm:p-4'} border-b border-endfield-gray-light`}>
          <button
            type="button"
            onClick={() => toggleSection('chart')}
            className="w-full min-h-8 sm:min-h-9 flex items-center gap-2 text-left"
          >
            <Icon name="monitoring" className="text-endfield-yellow leading-none" />
            <span className="text-sm font-bold text-endfield-text uppercase tracking-widest leading-none">{t('cycleChart')}</span>
            <span className="ml-auto text-xs text-endfield-text/70 leading-none">
              {collapsedSections.chart ? t('expandSection') : t('collapseSection')}
            </span>
            <Icon name={collapsedSections.chart ? 'expand_more' : 'expand_less'} className="text-endfield-text leading-none" />
          </button>
          <div
            className={`grid overflow-hidden transition-[grid-template-rows,margin,opacity] duration-300 ease-out ${collapsedSections.chart ? 'grid-rows-[0fr] mt-0 opacity-0' : 'grid-rows-[1fr] mt-3 opacity-100'}`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="bg-endfield-gray border border-endfield-gray-light p-2 sm:p-4">
              <div ref={chartHeaderRef} className="flex items-center justify-between mb-2 gap-2 relative">
                <div
                  ref={chartDescRef}
                  className={`text-[11px] text-endfield-text/70 whitespace-nowrap ${showChartDataDesc ? 'block' : 'invisible absolute pointer-events-none'}`}
                >
                  {t('chartDataDesc')}
                </div>
                <div ref={chartControlsRef} className="flex items-center gap-2 ml-auto">
                  <label className="inline-flex items-center gap-2 px-2 py-1.5 bg-endfield-dark/60 border border-endfield-gray-light hover:border-endfield-yellow/60 transition-colors text-xs text-endfield-text cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={preciseValues}
                      onChange={(e) => setPreciseValues(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      className={`relative inline-flex w-8 h-4 items-center border transition-colors ${
                        preciseValues
                          ? 'bg-endfield-yellow/25 border-endfield-yellow/70'
                          : 'bg-endfield-gray border-endfield-gray-light'
                      }`}
                    >
                      <span
                        className={`absolute left-px top-1/2 w-3 h-3 -translate-y-1/2 bg-endfield-yellow transition-transform duration-200 ${
                          preciseValues ? 'translate-x-[15px]' : 'translate-x-0'
                        }`}
                      />
                    </span>
                    <span>{t('preciseValues')}</span>
                  </label>

                  <label className="inline-flex items-center gap-2 px-2 py-1.5 bg-endfield-dark/60 border border-endfield-gray-light hover:border-endfield-yellow/60 transition-colors text-xs text-endfield-text cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!hideHoverDetails}
                      onChange={(e) => setHideHoverDetails(!e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      className={`relative inline-flex w-8 h-4 items-center border transition-colors ${
                        !hideHoverDetails
                          ? 'bg-endfield-yellow/25 border-endfield-yellow/70'
                          : 'bg-endfield-gray border-endfield-gray-light'
                      }`}
                    >
                      <span
                        className={`absolute left-px top-1/2 w-3 h-3 -translate-y-1/2 bg-endfield-yellow transition-transform duration-200 ${
                          !hideHoverDetails ? 'translate-x-[15px]' : 'translate-x-0'
                        }`}
                      />
                    </span>
                    <span>{t('hoverDetails')}</span>
                  </label>
                </div>
              </div>
              <SolutionChart
                solution={selectedSolution}
                targetPower={params.targetPower}
                batteryCapacity={CONSTANTS.BATTERY_CAPACITY}
                hideHoverDetails={hideHoverDetails}
                preciseValues={preciseValues}
              />
              </div>
            </div>
          </div>
        </div>

        {/* 燃料消耗 */}
        {selectedSolution.fuelConsumption && (
          <div className={`${collapsedSections.fuel ? 'px-2 sm:px-4 pt-2 sm:pt-4 pb-2 sm:pb-3' : 'p-2 sm:p-4'} border-b border-endfield-gray-light`}>
            <button
              type="button"
              onClick={() => toggleSection('fuel')}
              className="w-full min-h-8 sm:min-h-9 flex items-center gap-2 text-left"
            >
              <Icon name="local_fire_department" className="text-endfield-yellow leading-none" />
              <span className="text-sm font-bold text-endfield-text uppercase tracking-widest leading-none">{t('fuelConsumption')}</span>
              <span className="ml-auto text-xs text-endfield-text/70 leading-none">
                {collapsedSections.fuel ? t('expandSection') : t('collapseSection')}
              </span>
              <Icon name={collapsedSections.fuel ? 'expand_more' : 'expand_less'} className="text-endfield-text leading-none" />
            </button>
            <div
              className={`grid overflow-hidden transition-[grid-template-rows,margin,opacity] duration-300 ease-out ${collapsedSections.fuel ? 'grid-rows-[0fr] mt-0 opacity-0' : 'grid-rows-[1fr] mt-3 opacity-100'}`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="bg-endfield-gray border border-endfield-gray-light overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-endfield-gray-light bg-endfield-dark/50">
                      <th className="text-left p-2 text-endfield-text font-normal">{t('fuelType')}</th>
                      <th className="text-right p-2 text-endfield-text font-normal">{t('perMinute')}</th>
                      <th className="text-right p-2 text-endfield-text font-normal">{t('perHour')}</th>
                      <th className="text-right p-2 text-endfield-text font-normal">{t('perDay')}</th>
                      <th className="hidden md:table-cell text-right p-2 text-endfield-text font-normal">{t('savedPerDay')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSolution.fuelConsumption.base.perDay > 0 && (
                      <tr className="border-b border-endfield-gray-light/50">
                        <td className="p-2">
                          <span className="text-endfield-text/70">{t('basePowerShort')}: </span>
                          <span className="text-endfield-text-light font-semibold">{getFuelName(selectedSolution.fuelConsumption.base.fuel)}</span>
                        </td>
                        <td className="p-2 text-right text-endfield-text-light">{selectedSolution.fuelConsumption.base.perMinute.toFixed(2)}</td>
                        <td className="p-2 text-right text-endfield-text-light">{selectedSolution.fuelConsumption.base.perHour.toFixed(1)}</td>
                        <td className="p-2 text-right text-endfield-yellow font-bold">{selectedSolution.fuelConsumption.base.perDay.toFixed(0)}</td>
                        <td className="hidden md:table-cell p-2 text-right text-endfield-text/50">-</td>
                      </tr>
                    )}
                    {selectedSolution.fuelConsumption.oscillating.perDay > 0 && (
                      <tr>
                        <td className="p-2">
                          <span className="text-endfield-text/70">{t('oscillatingShort')}: </span>
                          <span className="text-endfield-text-light font-semibold">{getFuelName(selectedSolution.fuelConsumption.oscillating.fuel)}</span>
                        </td>
                        <td className="p-2 text-right text-endfield-text-light">{selectedSolution.fuelConsumption.oscillating.perMinute.toFixed(2)}</td>
                        <td className="p-2 text-right text-endfield-text-light">{selectedSolution.fuelConsumption.oscillating.perHour.toFixed(1)}</td>
                        <td className="p-2 text-right text-endfield-yellow font-bold">{selectedSolution.fuelConsumption.oscillating.perDay.toFixed(0)}</td>
                        <td className="hidden md:table-cell p-2 text-right">
                          {oscillatingSavings ? (
                            <span className="text-green-400 font-bold">
                              {oscillatingSavings.savedPerDay.toFixed(0)} ({oscillatingSavings.savedPercent.toFixed(1)}%)
                            </span>
                          ) : (
                            <span className="text-endfield-text/50">-</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {selectedSolution.fuelConsumption.oscillating.perDay > 0 && (
                  <div className="md:hidden border-t border-endfield-gray-light px-2 py-2 flex items-center justify-between text-sm">
                    <span className="text-endfield-text">{t('savedPerDay')}:</span>
                    {oscillatingSavings ? (
                      <span className="text-green-400 font-bold">
                        {oscillatingSavings.savedPerDay.toFixed(0)} ({oscillatingSavings.savedPercent.toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-endfield-text/50">-</span>
                    )}
                  </div>
                )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 方案流程图 */}
        <div className={collapsedSections.diagram ? 'px-2 sm:px-4 pt-2 sm:pt-4 pb-2 sm:pb-3' : 'p-2 sm:p-4'}>
          <button
            type="button"
            onClick={() => toggleSection('diagram')}
            className="w-full min-h-8 sm:min-h-9 flex items-center gap-2 text-left"
          >
            <Icon name="account_tree" className="text-endfield-yellow leading-none" />
            <span className="text-sm font-bold text-endfield-text uppercase tracking-widest leading-none">{t('solutionDiagram')}</span>
            <span className="ml-auto text-xs text-endfield-text/70 leading-none">
              {collapsedSections.diagram ? t('expandSection') : t('collapseSection')}
            </span>
            <Icon name={collapsedSections.diagram ? 'expand_more' : 'expand_less'} className="text-endfield-text leading-none" />
          </button>
          <div
            className={`grid overflow-hidden transition-[grid-template-rows,margin,opacity] duration-300 ease-out ${collapsedSections.diagram ? 'grid-rows-[0fr] mt-0 opacity-0' : 'grid-rows-[1fr] mt-3 opacity-100'}`}
          >
            <div className="min-h-0 overflow-hidden">
              <SolutionDiagram solution={selectedSolution} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
