import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import { hasUnreadAnnouncementOrChangelog } from './Announcement';
import { FUEL_OPTIONS, SECONDARY_FUEL_OPTIONS, INPUT_SOURCES, INPUT_SOURCE_OPTIONS, DEFAULT_INPUT_SOURCE_ID } from '../utils/constants';
import { SHARE_LIMITS } from '../utils/shareParams';
import CloseButton from './CloseButton';
import Icon from './Icon';

export default function Sidebar({ params, setParams, collapsed, onClose, onCalculate, onRandomCalculate, onOpenAnnouncement, onOpenPrivacyPolicy }) {
  const { t, locale, changeLocale, languageOptions } = useI18n();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showPrimaryFuelMenu, setShowPrimaryFuelMenu] = useState(false);
  const [showSecondaryFuelMenu, setShowSecondaryFuelMenu] = useState(false);
  const [showInputWarning, setShowInputWarning] = useState(false);
  const [calcButtonVisible, setCalcButtonVisible] = useState(true);
  const [scrollHintMounted, setScrollHintMounted] = useState(false);
  const [scrollHintVisible, setScrollHintVisible] = useState(false);

  const primaryFuelRef = useRef(null);
  const secondaryFuelRef = useRef(null);
  const langMenuRef = useRef(null);
  const calcButtonRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (primaryFuelRef.current && !primaryFuelRef.current.contains(event.target)) {
        setShowPrimaryFuelMenu(false);
      }
      if (secondaryFuelRef.current && !secondaryFuelRef.current.contains(event.target)) {
        setShowSecondaryFuelMenu(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(event.target)) {
        setShowLangMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const clampNumber = (value, min, max) => {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  };

  const handleChange = (key, value) => {
    if (key === 'targetPower') {
      const clamped = clampNumber(value, 0, SHARE_LIMITS.MAX_TARGET_POWER);
      setParams(prev => ({ ...prev, [key]: clamped }));
      return;
    }
    if (key === 'maxWaste') {
      const clamped = clampNumber(value, 0, SHARE_LIMITS.MAX_MAX_WASTE);
      setParams(prev => ({ ...prev, [key]: clamped }));
      return;
    }
    if (key === 'maxBranches') {
      const clamped = clampNumber(value, SHARE_LIMITS.MIN_BRANCHES, SHARE_LIMITS.MAX_BRANCHES);
      setParams(prev => ({ ...prev, [key]: clamped }));
      return;
    }
    if (key === 'minBatteryPercent') {
      const clamped = clampNumber(value, 0, 100);
      setParams(prev => ({ ...prev, [key]: clamped }));
      return;
    }
    setParams(prev => ({ ...prev, [key]: value }));
  };


  const getFuelName = (fuel) => {
    return fuel.name[locale] || fuel.name.en;
  };

  const selectedInputSourceId = params.inputSourceId || DEFAULT_INPUT_SOURCE_ID;
  const inputSource = INPUT_SOURCES[selectedInputSourceId] || INPUT_SOURCES[DEFAULT_INPUT_SOURCE_ID];
  const getInputSourceName = (source) => {
    if (!source) return '';
    return source.name[locale] || source.name.en;
  };

  useEffect(() => {
    if (selectedInputSourceId !== 'packer' && showInputWarning) {
      setShowInputWarning(false);
    }
  }, [selectedInputSourceId, showInputWarning]);

  // 监听桌面端计算按钮是否在可视区域内
  useEffect(() => {
    const button = calcButtonRef.current;
    const container = scrollContainerRef.current;
    if (!button || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => setCalcButtonVisible(entry.isIntersecting),
      { root: container, threshold: 0.5 }
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  // 滚动提示的挂载/卸载动画控制
  const shouldShowHint = !calcButtonVisible && !collapsed;
  useEffect(() => {
    if (shouldShowHint) {
      setScrollHintMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setScrollHintVisible(true)));
    } else {
      setScrollHintVisible(false);
      const timer = setTimeout(() => setScrollHintMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [shouldShowHint]);

  const scrollToCalcButton = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* 移动端背景遮罩 - 使用 CSS 控制显示 */}
      <div 
        className={`fixed inset-0 z-20 md:hidden bg-black/50 transition-opacity duration-300 ${
          collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
        }`}
        onClick={onClose}
      />
      <aside 
        className={`
          w-80 sm:w-96
          bg-endfield-dark/95 md:bg-endfield-dark/80 
          border-r border-endfield-gray-light 
          overflow-hidden flex flex-col shrink-0 
          transition-all duration-300
          fixed md:relative inset-y-0 left-0 z-30 md:z-10
          ${collapsed ? '-translate-x-full md:-ml-96 pointer-events-none' : 'translate-x-0 md:ml-0 pointer-events-auto'}
        `}
        role="complementary"
        aria-label="参数配置面板"
        aria-hidden={collapsed}
      >
        {/* 移动端关闭按钮 */}
        <div className="md:hidden shrink-0 p-3 border-b border-endfield-gray-light flex items-center justify-between">
          <span className="text-sm font-bold text-endfield-text-light">{t('constraints')}</span>
          <CloseButton
            onClick={onClose}
            label={t('close')}
            sizeClass="w-8 h-8"
          />
        </div>
        
        {/* Sidebar Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-gutter-stable p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
      {/* 目标发电量 */}
      <fieldset className="space-y-4 border-none p-0 m-0">
        <legend className="text-sm font-bold text-endfield-text uppercase tracking-widest flex items-center gap-2 p-0">
          <Icon name="target" className="text-endfield-yellow" />
          {t('targetPower')}
        </legend>
        <div className="space-y-2">
          <div className="flex justify-between">
            <label htmlFor="target-power-input" className="text-sm text-endfield-text">{t('power')} (w)</label>
            <span className="text-sm text-endfield-yellow" aria-live="polite">{params.targetPower}</span>
          </div>
          <div className="flex gap-2">
            <input
              id="target-power-input"
              type="number"
              min="0"
              max={SHARE_LIMITS.MAX_TARGET_POWER}
              value={params.targetPower}
              onChange={(e) => handleChange('targetPower', parseInt(e.target.value, 10) || 0)}
              onKeyDown={(e) => e.key === 'Enter' && onCalculate()}
              className="flex-1 bg-endfield-gray border border-endfield-gray-light px-3 py-2 text-sm text-endfield-text-light focus:border-endfield-yellow focus:outline-none"
              aria-describedby="target-power-desc"
            />
            <button
              onClick={onRandomCalculate}
              className="w-10 h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center text-endfield-text-light hover:text-endfield-yellow shrink-0"
              title={t('random')}
              aria-label={t('random')}
            >
              <Icon name="casino" />
            </button>
          </div>
        </div>
      </fieldset>

      <div className="w-full shrink-0 border-t border-endfield-gray-light/90"></div>

      {/* 约束条件 */}
      <fieldset className="space-y-4 border-none p-0 m-0">
        <legend className="text-sm font-bold text-endfield-text uppercase tracking-widest flex items-center gap-2 p-0">
          <Icon name="tune" className="text-endfield-yellow" />
          {t('constraints')}
        </legend>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label htmlFor="min-battery-input" className="text-sm text-endfield-text">{t('minBatteryPercent')}</label>
            <div className="flex items-center">
              <input
                id="min-battery-input"
                type="number"
                min="0"
                max="100"
                value={params.minBatteryPercent}
                onChange={(e) => {
                  const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                  handleChange('minBatteryPercent', val);
                }}
                onKeyDown={(e) => e.key === 'Enter' && onCalculate()}
                className="w-12 bg-transparent border-b border-endfield-gray-light px-1 py-0.5 text-sm text-endfield-text-light text-right focus:border-endfield-yellow focus:outline-none"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={params.minBatteryPercent}
              />
              <span className="text-sm text-endfield-text-light">%</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={params.minBatteryPercent}
            onChange={(e) => handleChange('minBatteryPercent', parseInt(e.target.value))}
            className="w-full cursor-pointer"
            aria-label={t('minBatteryPercent')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={params.minBatteryPercent}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label htmlFor="max-waste-input" className="text-sm text-endfield-text">{t('maxWaste')}</label>
            <span className="text-sm text-endfield-text-light" aria-live="polite">{params.maxWaste} w</span>
          </div>
          <input
            id="max-waste-input"
            type="number"
            min="0"
            max={SHARE_LIMITS.MAX_MAX_WASTE}
            value={params.maxWaste}
            onChange={(e) => handleChange('maxWaste', parseInt(e.target.value, 10) || 0)}
            onKeyDown={(e) => e.key === 'Enter' && onCalculate()}
            className="w-full bg-endfield-gray border border-endfield-gray-light px-3 py-2 text-sm text-endfield-text-light focus:border-endfield-yellow focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label htmlFor="max-branches-input" className="text-sm text-endfield-text">{t('maxBranches')}</label>
            <span className="text-sm text-endfield-text-light" aria-live="polite">{params.maxBranches ?? 3}</span>
          </div>
          <input
            id="max-branches-input"
            type="range"
            min={SHARE_LIMITS.MIN_BRANCHES}
            max={SHARE_LIMITS.MAX_BRANCHES}
            step="1"
            value={params.maxBranches ?? 3}
            onChange={(e) => handleChange('maxBranches', parseInt(e.target.value, 10))}
            className="w-full cursor-pointer"
            aria-label={t('maxBranches')}
            aria-valuemin={SHARE_LIMITS.MIN_BRANCHES}
            aria-valuemax={SHARE_LIMITS.MAX_BRANCHES}
            aria-valuenow={params.maxBranches ?? 3}
          />
          <div className="flex justify-between text-xs text-endfield-text/50 px-0.5">
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
          </div>
        </div>
      </fieldset>

      <div className="w-full shrink-0 border-t border-endfield-gray-light/90"></div>

      {/* 燃料选择 */}
      <fieldset className="space-y-4 border-none p-0 m-0">
        <legend className="text-sm font-bold text-endfield-text uppercase tracking-widest flex items-center gap-2 p-0">
          <Icon name="local_gas_station" className="text-endfield-yellow" />
          {t('fuelConfig')}
        </legend>

        {/* 主燃料 */}
        <div className="space-y-2">
          <label id="primary-fuel-label" className="text-sm text-endfield-text">{t('primaryFuel')}</label>
          <div className="relative" ref={primaryFuelRef}>
            <button
              onClick={() => {
                setShowPrimaryFuelMenu(!showPrimaryFuelMenu);
                setShowSecondaryFuelMenu(false);
              }}
              className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-between px-3 text-sm text-endfield-text-light"
              aria-expanded={showPrimaryFuelMenu}
              aria-haspopup="listbox"
              aria-labelledby="primary-fuel-label"
            >
              <span className="flex items-center gap-2">
                {(() => {
                  const fuel = FUEL_OPTIONS.find(f => f.id === params.primaryFuelId);
                  if (!fuel) return '';
                  return (
                    <>
                      {fuel.image && <img src={fuel.image} alt="" className="w-6 h-6 object-contain" aria-hidden="true" />}
                      <span>{getFuelName(fuel)}</span>
                    </>
                  );
                })()}
              </span>
              <Icon name={showPrimaryFuelMenu ? 'expand_less' : 'expand_more'} />
            </button>

            {showPrimaryFuelMenu && (
              <ul className="absolute left-0 right-0 top-full mt-1 bg-endfield-gray border border-endfield-gray-light z-50 max-h-60 overflow-y-auto list-none p-0 m-0" role="listbox" aria-labelledby="primary-fuel-label">
                {FUEL_OPTIONS.map((fuel) => (
                  <li key={fuel.id} role="option" aria-selected={params.primaryFuelId === fuel.id}>
                    <button
                      onClick={() => {
                        handleChange('primaryFuelId', fuel.id);
                        setShowPrimaryFuelMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-endfield-gray-light transition-colors flex items-center gap-2
                        ${params.primaryFuelId === fuel.id ? 'text-endfield-yellow' : 'text-endfield-text-light'}`}
                    >
                      {fuel.image && <img src={fuel.image} alt="" className="w-6 h-6 object-contain" aria-hidden="true" />}
                      <span>{getFuelName(fuel)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(() => {
            const fuel = FUEL_OPTIONS.find(f => f.id === params.primaryFuelId);
            if (!fuel) return null;
            return (
              <p className="text-sm text-endfield-text/70">
                {fuel.power}w / {fuel.burnTime}s
              </p>
            );
          })()}
        </div>

        {/* 副燃料 */}
        <div className="space-y-2">
          <label id="secondary-fuel-label" className="text-sm text-endfield-text">{t('secondaryFuel')}</label>
          <div className="relative" ref={secondaryFuelRef}>
            <button
              onClick={() => {
                setShowSecondaryFuelMenu(!showSecondaryFuelMenu);
                setShowPrimaryFuelMenu(false);
              }}
              className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-between px-3 text-sm text-endfield-text-light"
              aria-expanded={showSecondaryFuelMenu}
              aria-haspopup="listbox"
              aria-labelledby="secondary-fuel-label"
            >
              <span className="flex items-center gap-2">
                {(() => {
                  const fuel = SECONDARY_FUEL_OPTIONS.find(f => f.id === params.secondaryFuelId);
                  if (!fuel) return '';
                  return (
                    <>
                      {fuel.image && <img src={fuel.image} alt="" className="w-6 h-6 object-contain" aria-hidden="true" />}
                      <span>{getFuelName(fuel)}</span>
                    </>
                  );
                })()}
              </span>
              <Icon name={showSecondaryFuelMenu ? 'expand_less' : 'expand_more'} />
            </button>

            {showSecondaryFuelMenu && (
              <ul className="absolute left-0 right-0 top-full mt-1 bg-endfield-gray border border-endfield-gray-light z-50 max-h-60 overflow-y-auto list-none p-0 m-0" role="listbox" aria-labelledby="secondary-fuel-label">
                {SECONDARY_FUEL_OPTIONS.map((fuel) => (
                  <li key={fuel.id} role="option" aria-selected={params.secondaryFuelId === fuel.id}>
                    <button
                      onClick={() => {
                        handleChange('secondaryFuelId', fuel.id);
                        setShowSecondaryFuelMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-endfield-gray-light transition-colors flex items-center gap-2
                        ${params.secondaryFuelId === fuel.id ? 'text-endfield-yellow' : 'text-endfield-text-light'}`}
                    >
                      {fuel.image && <img src={fuel.image} alt="" className="w-6 h-6 object-contain" aria-hidden="true" />}
                      <span>{getFuelName(fuel)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(() => {
            const fuel = SECONDARY_FUEL_OPTIONS.find(f => f.id === params.secondaryFuelId);
            if (!fuel || fuel.power === 0) {
              return <p className="text-sm text-endfield-text/50">{t('secondaryFuelHint')}</p>;
            }
            return (
              <p className="text-sm text-endfield-text/70">
                {fuel.power}w / {fuel.burnTime}s
              </p>
            );
          })()}
        </div>
      </fieldset>

      <div className="w-full shrink-0 border-t border-endfield-gray-light/90"></div>

      {/* 输入来源 */}
      <fieldset className="space-y-2 border-none p-0 m-0">
        <legend className="text-sm font-bold text-endfield-text uppercase tracking-widest flex items-center gap-2 p-0">
          <Icon name="input" className="text-endfield-yellow" />
          {t('inputSource')}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {INPUT_SOURCE_OPTIONS.map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => handleChange('inputSourceId', source.id)}
              className={`h-10 px-2 border text-xs sm:text-sm transition-colors ${
                selectedInputSourceId === source.id
                  ? 'text-endfield-yellow border-endfield-yellow bg-endfield-yellow/10'
                  : 'text-endfield-text-light border-endfield-gray-light hover:border-endfield-text'
              }`}
            >
              {getInputSourceName(source)}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-sm text-endfield-text/50">
          <span className="leading-normal">
            {t('inputSpeed')}: {inputSource?.speed} {t('itemPerSec')}
            {selectedInputSourceId === 'packer' ? ` (${t('inputHintPacker')})` : ''}
          </span>
          {selectedInputSourceId === 'packer' && (
            <button
              type="button"
              onClick={() => setShowInputWarning(true)}
              className="w-5 h-5 inline-flex items-center justify-center leading-none text-endfield-text/50 hover:text-endfield-yellow transition-colors"
              title={t('inputWarningPacker')}
              aria-label={t('inputWarningPacker')}
              aria-haspopup="dialog"
            >
              <Icon name="info" className="leading-none" />
            </button>
          )}
        </div>
      </fieldset>

      <div className="w-full shrink-0 border-t border-endfield-gray-light/90"></div>

        {/* 系统信息 */}
        <div className="space-y-2 text-sm text-endfield-text/70">
          <div className="flex justify-between">
            <span>{t('basePower')}:</span>
            <span className="text-endfield-text-light">200 w</span>
          </div>
          <div className="flex justify-between">
            <span>{t('inputSource')}:</span>
            <span className="text-endfield-text-light">{getInputSourceName(inputSource)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('inputSpeed')}:</span>
            <span className="text-endfield-text-light">{inputSource?.speed} {t('itemPerSec')}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('batteryCapacity')}:</span>
            <span className="text-endfield-text-light">100,000 J</span>
          </div>
        </div>

        {/* 桌面端计算按钮 */}
        <button
          ref={calcButtonRef}
          onClick={() => onCalculate()}
          className="hidden md:flex w-full mt-4 h-10 bg-endfield-yellow hover:bg-endfield-yellow-glow hover:-translate-y-0.5 text-endfield-black font-bold tracking-wider uppercase transition-all items-center justify-center gap-2 text-sm glow-yellow shrink-0"
        >
          <Icon name="calculate" />
          {t('calculate')}
        </button>

        {/* 移动端：公告、GitHub、语言切换按钮 */}
        <div className="md:hidden mt-4 pt-4 border-t border-endfield-gray-light space-y-3">
          <button
            onClick={() => {
              onOpenPrivacyPolicy();
              onClose();
            }}
            className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-endfield-text-light hover:text-endfield-yellow"
          >
            <Icon name="policy" />
            <span className="text-sm">{t('privacyPolicyDetails')}</span>
          </button>
          {/* 公告按钮 */}
          <button
            onClick={() => {
              onOpenAnnouncement();
              onClose();
            }}
            className="relative w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-endfield-text-light hover:text-endfield-yellow"
          >
            <Icon name="campaign" />
            <span className="text-sm">{t('announcement')}</span>
            {hasUnreadAnnouncementOrChangelog() && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>

          {/* 加入 QQ 群 - 仅中文显示 */}
          {locale === 'zh' && (
            <a
              href="https://qm.qq.com/q/zL6wp3emTQ"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-endfield-text-light hover:text-endfield-yellow"
            >
              <Icon name="group" />
              <span className="text-sm">{t('joinQQGroup')}</span>
            </a>
          )}

          {/* GitHub 链接 */}
          <a
            href="https://github.com/djkcyl/D.I.G.E."
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-endfield-text-light hover:text-endfield-yellow"
          >
            <Icon icon="mdi:github" />
            <span className="text-sm">GitHub</span>
          </a>

          {/* 语言切换 */}
          <div className="relative" ref={langMenuRef}>
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-sm text-endfield-text-light"
            >
              <Icon name="language" />
              <span>{(() => { const l = languageOptions.find(l => l.code === locale); return l ? l.nativeName : ''; })()}</span>
            </button>

            {showLangMenu && (
              <div className="absolute left-0 right-0 bottom-full mb-1 bg-endfield-gray border border-endfield-gray-light z-50">
                {languageOptions.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      changeLocale(lang.code);
                      setShowLangMenu(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-endfield-gray-light transition-colors
                      ${locale === lang.code ? 'text-endfield-yellow' : 'text-endfield-text-light'}`}
                  >
                    {lang.nativeName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

        {/* 桌面端：计算按钮不可见时的底部渐变提示 */}
        {scrollHintMounted && (
          <div className={`hidden md:flex absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-endfield-dark from-40% to-transparent items-end justify-center pb-3 pointer-events-none transition-all duration-300 ease-out ${
            scrollHintVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <button
              onClick={scrollToCalcButton}
              className="pointer-events-auto px-4 py-1.5 bg-endfield-yellow/15 border border-endfield-yellow/40 hover:bg-endfield-yellow/25 transition-colors flex items-center gap-1.5 text-xs text-endfield-yellow tracking-wider"
            >
              <Icon name="keyboard_double_arrow_down" />
              {t('scrollToCalculate')}
            </button>
          </div>
        )}
    </aside>

    {showInputWarning && (
      <div
        className="fixed inset-0 bg-endfield-black/95 backdrop-blur z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        onClick={() => setShowInputWarning(false)}
      >
        <div
          className="bg-endfield-gray border border-red-900/50 p-6 max-w-lg w-full relative flex flex-col gap-4 corner-mark"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 pb-3 border-b border-red-900/50">
            <Icon name="warning" className="text-red-300" />
            <h2 className="text-base font-bold text-endfield-text-light uppercase tracking-wider">
              {t('importantNote')}
            </h2>
          </div>
          <p className="text-sm text-red-200 leading-relaxed">
            {t('inputWarningPacker')}
          </p>
          <button
            onClick={() => setShowInputWarning(false)}
            className="w-full h-10 bg-red-600/90 hover:bg-red-500 text-white font-bold tracking-wider transition-all flex items-center justify-center gap-2 text-sm"
          >
            {t('close')}
          </button>
        </div>
      </div>
    )}
    </>
  );
}
