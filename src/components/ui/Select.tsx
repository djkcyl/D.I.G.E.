import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

export interface SelectOption<T = string> {
  value: T;
  label: React.ReactNode;
  [key: string]: unknown;
}

export interface SelectProps<T = string> {
  value?: T;
  options?: SelectOption<T>[];
  onChange?: (option: SelectOption<T>) => void;
  renderOption?: (option: SelectOption<T>) => React.ReactNode;
  id?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  className?: string;
  buttonClassName?: string;
}

export default function Select<T = string>({
  value,
  options = [],
  onChange,
  renderOption,
  id,
  ariaLabel,
  ariaLabelledby,
  className = "",
  buttonClassName = "",
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const listboxId = id ? `${id}-listbox` : undefined;
  const getOptionId = (index: number) =>
    id ? `${id}-option-${index}` : undefined;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.children[highlightedIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, open]);

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const selectedOption =
    selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const displayLabel = selectedOption
    ? renderOption
      ? renderOption(selectedOption)
      : selectedOption.label
    : "";

  const openList = () => {
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const closeList = () => {
    setOpen(false);
  };

  const selectHighlighted = () => {
    if (highlightedIndex >= 0 && highlightedIndex < options.length) {
      onChange?.(options[highlightedIndex]);
      closeList();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          openList();
        } else {
          setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1));
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) {
          openList();
        } else {
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) {
          openList();
        } else {
          selectHighlighted();
        }
        break;
      case "Escape":
        event.preventDefault();
        closeList();
        break;
      case "Home":
        event.preventDefault();
        if (open) setHighlightedIndex(0);
        break;
      case "End":
        event.preventDefault();
        if (open) setHighlightedIndex(options.length - 1);
        break;
    }
  };

  const activeDescendant =
    open && highlightedIndex >= 0 ? getOptionId(highlightedIndex) : undefined;

  return (
    <div className={`relative ${className}`.trim()} ref={containerRef}>
      <button
        type="button"
        id={id}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={handleKeyDown}
        className={`w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-between px-3 text-sm text-endfield-text-light ${buttonClassName}`.trim()}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={ariaLabelledby}
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-activedescendant={activeDescendant}
      >
        <span className="flex items-center gap-2">{displayLabel}</span>
        <Icon name={open ? "expand_less" : "expand_more"} />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 bg-endfield-gray border border-endfield-gray-light z-50 max-h-60 overflow-y-auto p-0 m-0"
          aria-labelledby={ariaLabelledby}
        >
          {options.map((opt, index) => (
            <div
              key={String(opt.value)}
              id={getOptionId(index)}
              role="option"
              aria-selected={value === opt.value}
              tabIndex={-1}
              onClick={() => {
                onChange?.(opt);
                closeList();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange?.(opt);
                  closeList();
                }
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 cursor-pointer ${
                index === highlightedIndex
                  ? "bg-endfield-gray-light"
                  : "hover:bg-endfield-gray-light"
              } ${value === opt.value ? "text-endfield-yellow" : "text-endfield-text-light"}`}
            >
              {renderOption ? renderOption(opt) : opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
