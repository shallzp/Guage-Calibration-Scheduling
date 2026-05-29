import { useEffect, useMemo, useState, useRef } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { PanelRightOpen } from 'lucide-react'

import { addMonthsClamped, formatDate, formatDisplayDate, parseDate, parseDateAny, toDateSortValue } from '../../utils/dateUtils'
import { apiFetch } from '../../utils/api'
import { riskBadgeStyle, actionBadgeStyle } from '../../utils/gauge/badgeStyles'
import { getRiskActionLabel, getRiskLevelLabel } from '../../utils/gauge/gaugeDataUtils'

import TableSkeleton from '../../components/TableSkeleton'
import Pagination from '../../components/Pagination'
import Drawer from '../../components/Drawer'
import SortableHeader from '../../components/SortableHeader'

import GaugeDataFilter, { GaugeFiltersSkeleton } from './GaugeDataFilter'

export function GaugeRecommendationsSkeleton() {
  return (
    <>
      <div className='my-5'>
        <GaugeFiltersSkeleton />
      </div>
      <TableSkeleton widths={['w-28', 'w-20', 'w-20', 'w-20', 'w-24', 'w-10']} rows={10} />
    </>
  )
}

const PAGE_SIZE = 10

function toDueDateText(value) {
  return formatDisplayDate(value, value || '-')
}

function toRiskPercent(score, level) {
  if (typeof score === 'number' && !Number.isNaN(score)) {
    const scaled = score <= 1 ? score * 100 : score
    return Math.max(0, Math.min(100, Math.round(scaled)))
  }
  if (level === 'high') return 100
  if (level === 'medium') return 65
  if (level === 'low') return 30
  return null
}

function getActionType(action) {
  const normalized = String(action || '').toLowerCase()
  if (normalized.includes('increase')) return 'increase'
  if (normalized.includes('reschedule')) return 'reschedule'
  return 'other'
}


function getRecommendedShiftText(gauge) {
  if (gauge?.recommendedFrequency) return `Shift to ${gauge.recommendedFrequency} months`
  if (gauge?.recommendedDueDate) return toDueDateText(gauge.recommendedDueDate)
  return 'Based on AI recommendation'
}

function RecommendationDetailPanel({ gauge, onClose, onConfirm, isApplying }) {
  if (!gauge) return null

  const riskLevel = String(gauge.riskLevel || '').trim().toLowerCase()
  const riskLabel = riskLevel ? getRiskLevelLabel(riskLevel) : '—'
  const actionLabel = getRiskActionLabel(gauge.riskAction)
  const actionType = getActionType(gauge.riskAction)
  const signals = Array.isArray(gauge.riskSignals) && gauge.riskSignals.length
    ? gauge.riskSignals
    : [
      `${riskLevel || 'unknown'}_risk`,
      `frequency_${gauge.frequency || 0}m`,
      `${actionType}_recommendation`,
    ]

  return (
    <Drawer
      isOpen={Boolean(gauge)}
      title={gauge.gaugeName || '-'}
      subtitle={`${gauge.gaugeId || '-'} · ${gauge.currentLocation || '-'}`}
      onClose={onClose}
      footerAction={
        <button
          type="button"
          onClick={onConfirm}
          disabled={isApplying}
          className="w-full rounded-2xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          {isApplying ? 'Applying Recommendation...' : 'Confirm & Apply Recommendation'}
        </button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${riskBadgeStyle(riskLevel) || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
            {riskLabel}
          </span>
          <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${actionBadgeStyle(gauge.riskAction)}`}>
            {actionLabel}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Current Due Date</p>
            <p className="mt-2 text-lg font-semibold text-slate-900 sm:text-xl">{toDueDateText(gauge.dueDate)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recommended Shift</p>
            <p className="mt-2 text-lg font-semibold text-slate-900 sm:text-xl">{getRecommendedShiftText(gauge)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Current Frequency</p>
            <p className="mt-2 text-lg font-semibold text-slate-900 sm:text-xl">{gauge.frequency ? `${gauge.frequency} months` : '-'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Current Status</p>
            <p className="mt-2 text-lg font-semibold text-slate-900 sm:text-xl">{gauge.currentStatus || '—'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">AI Rationale</p>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {gauge.riskReason || 'Recommendation generated from gauge history and risk indicators.'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Signals</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {signals.map((signal) => (
              <span key={signal} className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                {signal}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  )
}

function GaugeRecommendations({ gauges = [], onRecommendationApplied, filters, onFilterChange, onClearFilters, isFilterActive }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const sortParam = searchParams.get('sort')
  const dirParam = searchParams.get('dir')

  const setCurrentPage = (page) => {
    const next = new URLSearchParams(searchParams)
    if (page === 1) {
      next.delete('page')
    } else {
      next.set('page', page.toString())
    }
    setSearchParams(next, { replace: true })
  }
  const [isApplying, setIsApplying] = useState(false)
  const [sortField, setSortField] = useState(sortParam || null)
  const [sortDirection, setSortDirection] = useState(dirParam === 'desc' ? 'desc' : 'asc')

  const recommendationRows = useMemo(
    () => gauges.filter((gauge) => ['increase', 'reschedule'].includes(getActionType(gauge.riskAction))),
    [gauges],
  )

  // ── Drawer state is stored in the URL as ?drawer=<gaugeId> ──────────────
  const drawerGaugeId = searchParams.get('drawer') || null

  const selectedGauge = useMemo(
    () => (drawerGaugeId ? recommendationRows.find((g) => String(g.gaugeId) === drawerGaugeId) ?? null : null),
    [drawerGaugeId, recommendationRows],
  )

  const openDrawer = (gauge) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      next.set('drawer', String(gauge.gaugeId))
      return next
    }, { replace: true })
  }

  const closeDrawer = () => {
    // If we navigated here from another page (e.g. batch drawer), go back there.
    // Otherwise just strip ?drawer= and stay on the recommendations tab.
    if (location.state?.from) {
      navigate(location.state.from)
    } else {
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        next.delete('drawer')
        return next
      }, { replace: true })
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Legacy ?gaugeKey= deep-link support — redirect to ?drawer= if found
  useEffect(() => {
    const requestedGaugeKey = searchParams.get('gaugeKey')
    if (!requestedGaugeKey || drawerGaugeId) return

    const normalizedRequest = String(requestedGaugeKey).toLowerCase()
    const targetGauge = recommendationRows.find((gauge) => {
      const candidates = [gauge.key, gauge.gaugeId, gauge.gaugeName]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
      return candidates.includes(normalizedRequest)
    })

    if (targetGauge) {
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        next.delete('gaugeKey')
        next.set('drawer', String(targetGauge.gaugeId))
        return next
      }, { replace: true, state: location.state })  // preserve from state
    }
  }, [searchParams, recommendationRows, drawerGaugeId, setSearchParams])
  const filteredRows = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    return recommendationRows.filter((gauge) => {
      if (filters.location !== 'all' && gauge.currentLocation !== filters.location) return false
      if (filters.frequency !== 'all' && String(gauge.frequency) !== filters.frequency) return false
      if (filters.recommendedAction !== 'all' && getRiskActionLabel(gauge.riskAction) !== filters.recommendedAction) return false
      if (filters.riskLevel !== 'all' && gauge.riskLevel !== filters.riskLevel) return false
      if (!query) return true
      const searchable = [
        gauge.currentLocation,
        gauge.gaugeId,
        gauge.gaugeName,
        gauge.dueDate,
        gauge.lastCompletionDate,
      ]
        .join(' ')
        .toLowerCase()
      return searchable.includes(query)
    })
  }, [recommendationRows, filters])

  const filterOptions = useMemo(() => {
    const getUniqueValues = (key) =>
      Array.from(new Set(recommendationRows.map((gauge) => String(gauge[key] || '')))).filter(Boolean).sort()

    const toSelectOptions = (values, allLabel, formatter) => [
      { value: 'all', label: allLabel },
      ...values.map((value) => ({ value, label: formatter ? formatter(value) : value })),
    ]

    const frequencyVals = Array.from(new Set(recommendationRows.map((gauge) => String(gauge.frequency))))
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b))

    return {
      location: toSelectOptions(getUniqueValues('currentLocation'), 'All Locations'),
      frequency: toSelectOptions(frequencyVals, 'All Frequencies'),
      recommendedAction: toSelectOptions(
        Array.from(new Set(recommendationRows.map((gauge) => getRiskActionLabel(gauge.riskAction)))).filter(Boolean).sort(),
        'All Recommended Actions',
      ),
      riskLevel: toSelectOptions(getUniqueValues('riskLevel'), 'All Risk Levels', getRiskLevelLabel),
    }
  }, [recommendationRows])
  const filteredCount = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
    } else {
      setCurrentPage(1)
    }
  }, [gauges, filters])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (sortField) {
      next.set('sort', sortField)
      next.set('dir', sortDirection)
    } else {
      next.delete('sort')
      next.delete('dir')
    }

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [sortDirection, sortField, searchParams, setSearchParams])

  const isLocalFilterActive = isFilterActive || sortField !== null

  const sortedRows = useMemo(() => {
    if (!sortField) return filteredRows
    return [...filteredRows].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (sortField === 'dueDate') {
        aVal = toDateSortValue(a.dueDate)
        bVal = toDateSortValue(b.dueDate)
      }

      if (sortField === 'riskLevel') {
        const riskToScore = (item) => {
          if (typeof item.riskScore === 'number' && !Number.isNaN(item.riskScore)) return item.riskScore
          const level = String(item.riskLevel || '').toLowerCase()
          if (level === 'high') return 1
          if (level === 'medium') return 0.5
          if (level === 'low') return 0.1
          return 0
        }
        aVal = riskToScore(a)
        bVal = riskToScore(b)
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredRows, sortDirection, sortField])

  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE
    return sortedRows.slice(start, start + PAGE_SIZE)
  }, [sortedRows, safeCurrentPage])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return
    setCurrentPage(page)
  }

  const handleLocalClearFilters = () => {
    if (onClearFilters) onClearFilters()
    setSortField(null)
    setSortDirection('asc')
  }

  const isCompletedStatus = (status) => String(status || '').trim().toLowerCase() === 'completed'

  const getCurrentScheduleIndex = (schedule = []) => {
    if (!Array.isArray(schedule) || schedule.length === 0) return -1
    let lastCompletedIndex = -1
    schedule.forEach((row, index) => {
      if (isCompletedStatus(row.status)) lastCompletedIndex = index
    })
    const currentIndex = lastCompletedIndex + 1
    if (currentIndex >= 0 && currentIndex < schedule.length) return currentIndex
    return schedule.findIndex((row) => !isCompletedStatus(row.status))
  }

  const patchGaugeFrequency = async (gauge, nextFrequency) => {
    const response = await apiFetch(`/api/gauges/${encodeURIComponent(gauge.key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency: nextFrequency }),
    })
    if (!response.ok) throw new Error('Failed to update gauge frequency')
  }

  const clearLatestPredictionRecommendation = async (gauge) => {
    const response = await apiFetch(`/api/gauges/${encodeURIComponent(gauge.key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latest_prediction: {
          action: 'no_change',
          recommended_frequency: null,
          recommended_due_date: null,
        },
      }),
    })
    if (!response.ok) throw new Error('Failed to clear latest recommendation')
  }

  const patchScheduleDates = async (gaugeKey, shiftedRows) => {
    const updates = shiftedRows
      .filter(({ scheduleId, dueDate }) => scheduleId && dueDate)
      .map(({ scheduleId, dueDate }) => ({ scheduleId, due_date: dueDate }))

    if (updates.length === 0) return

    const response = await apiFetch(`/api/gauges/${encodeURIComponent(gaugeKey)}/schedule-bulk`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    if (!response.ok) throw new Error('Failed to bulk-update schedule due dates')
  }

  const refreshBatchSnapshotsOnly = async (gaugeKey) => {
    const gaugeResponse = await apiFetch(`/api/gauges/${encodeURIComponent(gaugeKey)}`)
    if (!gaugeResponse.ok) throw new Error('Failed to load gauge for batch refresh')

    const gauge = await gaugeResponse.json()
    const batchKeys = (gauge?.batch_keys && typeof gauge.batch_keys === 'object' && !Array.isArray(gauge.batch_keys))
      ? Object.keys(gauge.batch_keys)
      : []

    await Promise.all(batchKeys.map(async (batchKey) => {
      const response = await apiFetch(`/api/batches/${encodeURIComponent(batchKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_snapshot_for_gauge: gaugeKey }),
      })
      if (!response.ok) throw new Error('Failed to refresh batch snapshots')
    }))
  }

  const applyIncreaseFrequencyRecommendation = async (gauge) => {
    const currentFrequency = Number(gauge.frequency) || 0
    const nextFrequency = Number(gauge.recommendedFrequency) || 0
    if (!nextFrequency || nextFrequency <= currentFrequency) return

    const baseIndex = getCurrentScheduleIndex(gauge.schedule || [])
    const shiftedRows = []

    if (baseIndex !== -1) {
      const lastCompletedIndex = baseIndex - 1
      const baseDate = lastCompletedIndex >= 0
        ? parseDate(gauge.schedule[lastCompletedIndex]?.dueDate)
        : parseDate(gauge.schedule[baseIndex]?.dueDate)

      if (baseDate) {
        gauge.schedule.forEach((row, index) => {
          if (index < baseIndex) return
          const offset = lastCompletedIndex >= 0 ? index - lastCompletedIndex : index - baseIndex + 1
          shiftedRows.push({
            scheduleId: row.id,
            dueDate: formatDate(addMonthsClamped(baseDate, nextFrequency * offset)),
          })
        })
      }
    }

    await patchGaugeFrequency(gauge, nextFrequency)
    await patchScheduleDates(gauge.key, shiftedRows)
  }

  const applyRescheduleRecommendation = async (gauge) => {
    const baseIndex = getCurrentScheduleIndex(gauge.schedule || [])
    if (baseIndex === -1) return

    const currentDueDateText = gauge.schedule?.[baseIndex]?.dueDate
    const currentDueDate = parseDate(currentDueDateText)
    if (!currentDueDate) return

    const recommendedDate = parseDateAny(gauge.recommendedDueDate) || parseDate(gauge.recommendedDueDate)
    let shiftDays = 1
    if (recommendedDate) {
      const diffMs = recommendedDate.getTime() - currentDueDate.getTime()
      const rawDiffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
      // Reschedule must be after current schedule and within 1..3 days.
      shiftDays = Math.max(1, Math.min(3, rawDiffDays))
    }
    const adjustedDate = formatDate(new Date(currentDueDate.getTime() + shiftDays * 24 * 60 * 60 * 1000))
    const adjustedBaseDate = parseDate(adjustedDate)
    if (!adjustedBaseDate) return

    const frequency = Number(gauge.frequency) || 0
    const shiftedRows = []

    gauge.schedule.forEach((row, index) => {
      if (index < baseIndex) return
      if (index === baseIndex) {
        shiftedRows.push({ scheduleId: row.id, dueDate: adjustedDate })
        return
      }
      shiftedRows.push({
        scheduleId: row.id,
        dueDate: formatDate(addMonthsClamped(adjustedBaseDate, frequency * (index - baseIndex))),
      })
    })

    await patchScheduleDates(gauge.key, shiftedRows)
  }

  const handleConfirmRecommendation = async () => {
    if (!selectedGauge?.key || isApplying) return
    setIsApplying(true)
    try {
      const actionType = getActionType(selectedGauge.riskAction)
      if (actionType === 'increase') {
        await applyIncreaseFrequencyRecommendation(selectedGauge)
      } else if (actionType === 'reschedule') {
        await applyRescheduleRecommendation(selectedGauge)
      }
      await clearLatestPredictionRecommendation(selectedGauge)

      if (onRecommendationApplied) {
        await onRecommendationApplied()
      }

      closeDrawer()

      // Fire-and-forget: snapshot refresh should not block the UI
      refreshBatchSnapshotsOnly(selectedGauge.key).catch((error) => {
        console.error('Failed to refresh batch snapshots:', error)
      })
    } catch (error) {
      console.error('Failed to apply recommendation:', error)
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <>
      <div className="mb-5">
        <GaugeDataFilter
          filters={filters}
          onFilterChange={onFilterChange}
          onClearFilters={handleLocalClearFilters}
          isFilterActive={isLocalFilterActive}
          options={filterOptions}
          fieldKeys={['location', 'frequency', 'recommendedAction', 'riskLevel']}
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Gauge Name / ID / Location</th>
              <th className="px-4 py-3">Current Frequency</th>
              <SortableHeader label="Due Date" field="dueDate" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="AI Risk Level" field="riskLevel" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3">Recommended Action</th>
              <th className="px-4 py-3 text-center">Details</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((gauge) => {
              const riskLevel = String(gauge.riskLevel || '').trim().toLowerCase()
              const riskStyle = riskBadgeStyle(riskLevel) || 'bg-slate-100 text-slate-700 border-slate-200'
              const riskPercent = toRiskPercent(gauge.riskScore, riskLevel)
              const riskLabel = riskLevel
                ? `${getRiskLevelLabel(riskLevel)}${riskPercent !== null ? ` (${riskPercent}%)` : ''}`
                : '—'
              const actionText = getRiskActionLabel(gauge.riskAction)

              return (
                <tr key={gauge.key} className="border-t border-slate-200/80 text-slate-700">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800 uppercase">{gauge.gaugeName || '-'}</p>
                    <p className="mt-1 text-xs text-slate-500">{gauge.gaugeId || '-'}</p>
                    <p className="mt-1 text-xs text-slate-600">{gauge.currentLocation || '-'}</p>
                  </td>
                  <td className="px-4 py-3 font-medium">{gauge.frequency ? `${gauge.frequency} months` : '-'}</td>
                  <td className="px-4 py-3 font-medium">{toDueDateText(gauge.dueDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${riskStyle}`}>
                      {riskLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${actionBadgeStyle(gauge.riskAction)}`}>
                      {actionText}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => openDrawer(gauge)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
                      aria-label={`Open details for ${gauge.gaugeId || 'gauge'}`}
                      title="Open details"
                    >
                      <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {filteredRows.length === 0 && (
              <tr className="border-t border-slate-200/80">
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  No recommendations available.
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
      <RecommendationDetailPanel
        gauge={selectedGauge}
        onClose={closeDrawer}
        onConfirm={handleConfirmRecommendation}
        isApplying={isApplying}
      />
    </>
  )
}

export default GaugeRecommendations
