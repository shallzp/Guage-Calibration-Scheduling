import { Search, MapPin, Timer, Activity, AlertTriangle } from 'lucide-react'

import FilterSelect from '../../components/FilterSelect'

const FILTER_FIELD_CONFIG = {
  location: { key: 'location', ariaLabel: 'Filter by location', icon: MapPin },
  frequency: { key: 'frequency', ariaLabel: 'Filter by frequency', icon: Timer },
  currentStatus: { key: 'currentStatus', ariaLabel: 'Filter by current status', icon: Activity },
  recommendedAction: { key: 'recommendedAction', ariaLabel: 'Filter by recommended action', icon: Activity },
  riskLevel: { key: 'riskLevel', ariaLabel: 'Filter by risk level', icon: AlertTriangle },
}

const DEFAULT_FILTER_FIELD_KEYS = ['location', 'frequency', 'currentStatus', 'riskLevel']


export function GaugeFiltersSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[color:var(--card)]e p-4 shadow-sm md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="h-4 w-24 rounded-full bg-slate-200/70 animate-pulse" />
        <div className="h-9 w-28 rounded-lg bg-slate-200/60 animate-pulse" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={`filter-skeleton-${index}`} className="h-11 rounded-xl bg-slate-200/70 animate-pulse" />
        ))}
      </div>
    </div>
  )
}

function GaugeDataFilter({ filters, onFilterChange, onClearFilters, isFilterActive, options, fieldKeys = DEFAULT_FILTER_FIELD_KEYS }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="display-font text-base font-semibold text-slate-900">Filters</p>
        <button
          type="button"
          onClick={onClearFilters}
          disabled={!isFilterActive}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear Filters
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-4 xl:col-span-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            type="text"
            value={filters.query}
            onChange={(event) => onFilterChange('query', event.target.value)}
            placeholder="Search by location, gauge ID, gauge name, due date..."
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition shadow-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-200"
          />
        </div>

        {fieldKeys.map((fieldKey) => {
          const field = FILTER_FIELD_CONFIG[fieldKey]
          if (!field) return null
          return (
            <FilterSelect
              key={field.key}
              value={filters[field.key]}
              onChange={(value) => onFilterChange(field.key, value)}
              options={options[field.key] || []}
              ariaLabel={field.ariaLabel}
              leadingIcon={field.icon ? <field.icon className="h-4 w-4" aria-hidden="true" /> : null}
            />
          )
        })}
      </div>
    </div>
  )
}

export default GaugeDataFilter
