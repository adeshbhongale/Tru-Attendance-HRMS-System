import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, Check } from 'lucide-react';

const SearchableDropdown = ({
  options = [],
  value,
  onChange,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search...',
  allOption = { label: 'All', value: 'ALL' },
  className = '',
  icon: Icon = null,
  disabled = false,
  searchable = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0, width: 240, openUpward: false });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize options to [{ value, label, sublabel }]
  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return {
        value: opt.value !== undefined ? opt.value : (opt.name ?? opt.fullName ?? opt.city ?? opt.id ?? opt._id),
        label: opt.label ?? opt.name ?? opt.fullName ?? opt.city ?? String(opt.value || ''),
        sublabel: opt.sublabel ?? (opt.employeeIdCode ? `(${opt.employeeIdCode})` : opt.code ? `(${opt.code})` : opt.cityClass ? `(Class ${opt.cityClass})` : ''),
      };
    });
  }, [options]);

  // Compute fixed position for floating portal dropdown
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    const width = Math.max(rect.width, 240);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 12);
    }

    setMenuCoords({
      top: openUpward ? undefined : rect.bottom + 6,
      bottom: openUpward ? window.innerHeight - rect.top + 6 : undefined,
      left,
      width,
      openUpward,
    });
  }, []);

  // Listen to outside click, scroll, and resize
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleClickOutside = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    if (searchable) {
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, searchable, updatePosition]);

  // Filter options by search term
  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm.trim()) return normalizedOptions;
    const q = searchTerm.trim().toLowerCase();
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
        (opt.value && String(opt.value).toLowerCase().includes(q))
    );
  }, [normalizedOptions, searchTerm, searchable]);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    if (value === undefined || value === null || (allOption && String(value) === String(allOption.value))) return null;
    return normalizedOptions.find((opt) => String(opt.value) === String(value));
  }, [normalizedOptions, value, allOption]);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(allOption ? allOption.value : '');
    setSearchTerm('');
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            updatePosition();
            setIsOpen((prev) => !prev);
          }
        }}
        className={`w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 border rounded-xl font-bold text-xs flex items-center justify-between gap-2 transition-all cursor-pointer text-left outline-none ${
          isOpen ? 'border-indigo-500 bg-white ring-2 ring-indigo-500/20' : 'border-slate-200 text-slate-800'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          {Icon && <Icon size={14} className="text-slate-400 shrink-0" />}
          <span className={`truncate ${selectedOption ? 'text-slate-900 font-extrabold' : 'text-slate-600 font-semibold'}`}>
            {selectedOption ? (
              <span>
                {selectedOption.label}{' '}
                {selectedOption.sublabel && (
                  <span className="text-[11px] text-slate-400 font-semibold">{selectedOption.sublabel}</span>
                )}
              </span>
            ) : (
              allOption ? allOption.label : placeholder
            )}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedOption && (
            <span
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`}
          />
        </div>
      </button>

      {/* Portal Dropdown Menu: Attached directly to document.body so it NEVER clips or gets cut off */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuCoords.top !== undefined ? `${menuCoords.top}px` : 'auto',
              bottom: menuCoords.bottom !== undefined ? `${menuCoords.bottom}px` : 'auto',
              left: `${menuCoords.left}px`,
              width: `${menuCoords.width}px`,
              zIndex: 999999,
            }}
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100 flex flex-col max-h-72"
          >
            {/* Search Box if enabled */}
            {searchable && (
              <div className="p-2 border-b border-slate-100 bg-slate-50/90 sticky top-0 z-10">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 transition-all"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options List */}
            <div className="overflow-y-auto p-1.5 space-y-0.5 text-xs flex-1">
              {allOption && !searchTerm && (
                <button
                  type="button"
                  onClick={() => handleSelect(allOption.value)}
                  className={`w-full px-2.5 py-2 rounded-xl text-left font-bold flex items-center justify-between transition-colors cursor-pointer ${
                    !value || String(value) === String(allOption.value)
                      ? 'bg-indigo-50 text-indigo-700 font-extrabold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{allOption.label}</span>
                  {(!value || String(value) === String(allOption.value)) && (
                    <Check size={14} className="text-indigo-600" />
                  )}
                </button>
              )}

              {filteredOptions.length === 0 ? (
                <div className="py-4 text-center text-slate-400 text-xs font-medium">
                  {normalizedOptions.length === 0 ? 'No options available' : 'No matching results'}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = String(value) === String(opt.value);
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full px-2.5 py-2 rounded-xl text-left font-bold flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-700 font-extrabold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <span className="block truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="text-[10px] text-slate-400 font-semibold block">{opt.sublabel}</span>
                        )}
                      </div>
                      {isSelected && <Check size={14} className="text-indigo-600 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SearchableDropdown;
