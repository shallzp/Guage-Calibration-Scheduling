import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

function FilterSelect({ value, onChange, options, leadingIcon, ariaLabel, compact = false, triggerClassName = '', menuClassName = '' }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const selected = useMemo(
    () => options.find((option) => option.value === value) || options[0] || { label: '' },
    [options, value],
  )

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 border border-slate-300 bg-white/95 text-slate-700 shadow-sm transition hover:border-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-200 focus:outline-none ${
          compact ? 'h-9 rounded-lg px-2.5 text-xs font-semibold' : 'h-11 rounded-xl px-3 text-sm font-medium'
        } ${triggerClassName}`}
      >
        {leadingIcon ? <span className="text-teal-700/80">{leadingIcon}</span> : null}
        <span className="truncate">{selected.label}</span>
        <span className="ml-auto">
          <ChevronDown className={`h-4 w-4 text-slate-500 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className={`absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-[0_14px_30px_rgba(15,23,42,0.15)] ${menuClassName}`}
        >
          {options.map((option) => {
            const isSelected = option.value === value
            return (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    isSelected
                      ? 'bg-teal-50 text-teal-900'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  <span className="ml-auto">{isSelected ? <Check className="h-4 w-4 text-teal-700" aria-hidden="true" /> : null}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default FilterSelect
