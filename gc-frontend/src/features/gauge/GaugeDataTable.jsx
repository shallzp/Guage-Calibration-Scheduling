import { useState, useMemo, useEffect } from 'react'
import { CalendarDays } from 'lucide-react'
import SortableHeader from '../../components/SortableHeader'
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
      <TableSkeleton widths={['w-28', 'w-20', 'w-32', 'w-16', 'w-24', 'w-24', 'w-24', 'w-20', 'w-10']} rows={10} />
    </>
  )
}

const STATUS_BADGE_STYLES = {
  'Completed':   'bg-emerald-100 text-emerald-700 border-emerald-200',
  'In Progress': 'bg-blue-100   text-blue-700   border-blue-200',
  'Overdue':     'bg-rose-100   text-rose-700   border-rose-200',
  'Not Started': 'bg-slate-100  text-slate-600  border-slate-200',
}

function StatusBadge({ status }) {
  const style = STATUS_BADGE_STYLES[status]
  if (!style) return <span className="text-slate-400">—</span>
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {status}
    </span>
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
  const [sortField, setSortField] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')

  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  const sortedGauges = useMemo(() => {
    if (!sortField) return gauges
    return [...gauges].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      
      if (sortField === 'dueDate' || sortField === 'lastCompletionDate') {
        const parseD = (val) => (!val || val === '-' ? 0 : new Date(val).getTime() || 0)
        aVal = parseD(aVal)
        bVal = parseD(bVal)
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [gauges, sortField, sortDirection])

  const filteredCount = sortedGauges.length
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedGauges = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE
    return sortedGauges.slice(start, start + PAGE_SIZE)
  }, [sortedGauges, safeCurrentPage])

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return
    setCurrentPage(page)
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleClearTableFilters = () => {
    onClearFilters()
    setSortField(null)
    setSortDirection('asc')
  }

  const isTableFilterActive = isFilterActive || sortField !== null

  return (
    <>
      <div className="my-5">
        <GaugeDataFilter
          filters={filters}
          onFilterChange={onFilterChange}
          onClearFilters={handleClearTableFilters}
          isFilterActive={isTableFilterActive}
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
              <SortableHeader label="Last Completion Date" field="lastCompletionDate" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Due Date" field="dueDate" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3">Current Status</th>
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
                    <StatusBadge status={gauge.currentStatus} />
                  </td>
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
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
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
