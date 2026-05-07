import { useState, useMemo, useEffect } from 'react'
import { CalendarDays } from 'lucide-react'
import GaugeDataFilter, { GaugeFiltersSkeleton } from './GaugeDataFilter'
import Pagination from '../../components/Pagination'
import TableSkeleton from '../../components/TableSkeleton'

const PAGE_SIZE = 10

export function GaugeDataTableSkeleton() {
  return (
    <>
      <div className="my-5">
        <GaugeFiltersSkeleton />
      </div>
      <TableSkeleton widths={['w-28', 'w-20', 'w-32', 'w-16', 'w-24', 'w-24', 'w-20', 'w-10']} rows={10} />
    </>
  )
}

const RISK_BADGE_STYLES = {
  high: 'bg-rose-100 text-rose-700 border-rose-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

function RiskBadge({ level }) {
  const normalized = String(level || '').trim().toLowerCase()
  const style = RISK_BADGE_STYLES[normalized]
  if (!style) return <span className="text-slate-400">—</span>
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${style}`}>
      {normalized}
    </span>
  )
}

function GaugeDataTable({
  gauges,
  selectedGaugeKey,
  onOpenSchedule,
  filters,
  onFilterChange,
  onClearFilters,
  isFilterActive,
  filterOptions,
}) {
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  const filteredCount = gauges.length
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedGauges = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE
    return gauges.slice(start, start + PAGE_SIZE)
  }, [gauges, safeCurrentPage])

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return
    setCurrentPage(page)
  }

  return (
    <>
      <div className="my-5">
        <GaugeDataFilter
          filters={filters}
          onFilterChange={onFilterChange}
          onClearFilters={onClearFilters}
          isFilterActive={isFilterActive}
          options={filterOptions}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Current Location</th>
              <th className="px-4 py-3">Guage ID</th>
              <th className="px-4 py-3">Gauge Name</th>
              <th className="px-4 py-3">Frequency</th>
              <th className="px-4 py-3">Last Completion Date</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Risk Level</th>
              <th className="px-4 py-3 text-center">Open Schedule</th>
            </tr>
          </thead>
          <tbody>
            {paginatedGauges.map((gauge) => {
              const isActive = selectedGaugeKey === gauge.key
              return (
                <tr
                  key={gauge.key}
                  className={`border-t border-slate-200/80 text-slate-700 ${isActive ? 'bg-teal-50/70' : ''}`}
                >
                  <td className="px-4 py-3 font-medium">{gauge.currentLocation}</td>
                  <td className="px-4 py-3">{gauge.gaugeId}</td>
                  <td className="px-4 py-3">{gauge.gaugeName}</td>
                  <td className="px-4 py-3">{gauge.frequency}</td>
                  <td className="px-4 py-3">{gauge.lastCompletionDate || '-'}</td>
                  <td className="px-4 py-3">{gauge.dueDate}</td>
                  <td className="px-4 py-3">
                    <RiskBadge level={gauge.riskLevel} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => onOpenSchedule(gauge.key)}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${isActive
                        ? 'border-teal-700 bg-teal-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      aria-label={`Open schedule for ${gauge.gaugeId}`}
                      title="Open schedule table"
                    >
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {gauges.length === 0 && (
              <tr className="border-t border-slate-200/80">
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  No gauges match the applied filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        filteredCount={filteredCount}
        onPageChange={handlePageChange}
      />
    </>
  )
}

export default GaugeDataTable
