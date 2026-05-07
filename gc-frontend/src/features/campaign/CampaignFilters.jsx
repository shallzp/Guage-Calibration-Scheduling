import FilterSelect from '../../components/FilterSelect'
import { CircleCheck, MapPin, Building2, Building, Factory, Megaphone, FileText, Hash, CalendarDays, Calendar } from 'lucide-react'

const FILTER_FIELDS = [
    { key: 'campaignStatus', ariaLabel: 'Filter by campaign status', icon: CircleCheck },
    { key: 'region', ariaLabel: 'Filter by region', icon: MapPin },
    { key: 'areaOffice', ariaLabel: 'Filter by area office', icon: Building2 },
    { key: 'companyCode', ariaLabel: 'Filter by company code', icon: Building },
    { key: 'plantCode', ariaLabel: 'Filter by plant code', icon: Factory },
    { key: 'campaignType', ariaLabel: 'Filter by campaign type', icon: Megaphone },
    { key: 'campaignDesc', ariaLabel: 'Filter by campaign description', icon: FileText },
    { key: 'chassisNo', ariaLabel: 'Filter by chassis number', icon: Hash },
    { key: 'year', ariaLabel: 'Filter by year', icon: CalendarDays },
    { key: 'month', ariaLabel: 'Filter by month', icon: Calendar },
]

export function CampaignFiltersSkeleton() {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="h-4 w-24 rounded-full bg-slate-200/70 animate-pulse" />
                <div className="h-9 w-28 rounded-lg bg-slate-200/60 animate-pulse" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, index) => (
                    <div key={`filter-skeleton-${index}`} className="h-11 rounded-xl bg-slate-200/70 animate-pulse" />
                ))}
            </div>
        </div>
    )
}

function CampaignFilters({ filters, onFilterChange, onClearFilters, isFilterActive, options }) {
    
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

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {FILTER_FIELDS.map((field) => {
                    return (
                        <FilterSelect
                            key={field.key}
                            value={filters[field.key]}
                            onChange={(value) => onFilterChange(field.key, value)}
                            options={options[field.key]}
                            ariaLabel={field.ariaLabel}
                            leadingIcon={field.icon ? <field.icon className="h-4 w-4" aria-hidden="true" /> : null}
                        />
                    )
                })}
            </div>
        </div>
    )
}

export default CampaignFilters
