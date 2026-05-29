import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'

import { calculateReminderDate, calculateEscalationDate } from '../../utils/gauge/slaUtils'
import { toDateSortValue } from '../../utils/dateUtils'
import { riskBadgeStyle, actionBadgeStyle, INFO_CHIP_STYLE, FREQ_CHIP_STYLE } from '../../utils/gauge/badgeStyles'
import { getRiskActionLabel, getRiskLevelLabel } from '../../utils/gauge/gaugeDataUtils'

import SortableHeader from '../../components/SortableHeader'
import StatusUpdater from '../../components/StatusUpdater'

const statusOptions = ['In Progress', 'Not Started', 'Completed', 'Overdue']

function GaugeTable({ gauge, slaConfig, onStatusChange, onAddSchedule, onChangeFrequency, onEditDueDate }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const sortParam = searchParams.get('sort')
  const dirParam = searchParams.get('dir')
  const [sortField, setSortField] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  useEffect(() => {
    setSortField(sortParam || null)
    setSortDirection(dirParam === 'desc' ? 'desc' : 'asc')
  }, [dirParam, sortParam])

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

  const sortedSchedule = useMemo(() => {
    const enhanced = gauge?.schedule?.map((row, i) => ({
      ...row,
      originalIndex: i,
      calcReminder: row.reminderDateTime || calculateReminderDate(row.dueDate, row.status, slaConfig),
      calcEscalation: row.escalationDateTime || calculateEscalationDate(row.dueDate, row.status, slaConfig),
    })) || []

    if (!sortField) return enhanced

    return enhanced.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (['dueDate', 'completionDate', 'calcReminder', 'calcEscalation'].includes(sortField)) {
        const parseD = (val) => {
          const cleanVal = String(val || '').includes(' - ') ? String(val).split(' - ')[0] : val
          return toDateSortValue(cleanVal)
        }
        aVal = parseD(aVal)
        bVal = parseD(bVal)
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [gauge?.schedule, slaConfig, sortField, sortDirection])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  if (!gauge) return null

  return (
    <section className="mt-7 fade-in-up overflow-hidden rounded-2xl border border-white/60 bg-white p-5 shadow-sm backdrop-blur md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="display-font text-2xl font-semibold text-slate-900">Schedule Table</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onChangeFrequency}
            disabled={!onChangeFrequency}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Change Frequency
          </button>
          <button
            type="button"
            onClick={onAddSchedule}
            disabled={!onAddSchedule}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            + Add New Schedule
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full px-3 py-1 font-medium ${INFO_CHIP_STYLE}`}>
          Gauge ID: {gauge.gaugeId}
        </span>
        <span className={`rounded-full px-3 py-1 font-medium ${INFO_CHIP_STYLE}`}>
          Gauge Name: {gauge.gaugeName}
        </span>
        <span className={`rounded-full px-3 py-1 font-medium ${INFO_CHIP_STYLE}`}>
          Department: {gauge.currentLocation}
        </span>
        <span className={`rounded-full px-3 py-1 font-medium ${FREQ_CHIP_STYLE}`}>
          Frequency: {gauge.frequency} months
        </span>
        {gauge.riskLevel && (
          <span className={`rounded-full border px-3 py-1 font-medium ${riskBadgeStyle(gauge.riskLevel) || ''}`}>
            Risk: {getRiskLevelLabel(gauge.riskLevel)}
          </span>
        )}
        {gauge.riskAction && (
          <span className={`rounded-full border px-3 py-1 font-medium ${actionBadgeStyle(gauge.riskAction)}`}>
            Action: {getRiskActionLabel(gauge.riskAction)}
          </span>
        )}
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortableHeader label="Date" field="dueDate" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3">Status</th>
              <SortableHeader label="Completion Date" field="completionDate" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Reminder Email Date & Time" field="calcReminder" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Escalate Email Date & Time" field="calcEscalation" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedSchedule.map((row) => {
              const index = row.originalIndex
              return (
                <tr key={row.id} className="group border-t border-slate-200/80 text-slate-700">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{row.dueDate}</span>
                      {row.status !== 'Completed' && (
                        <button
                          type="button"
                          onClick={() => onEditDueDate?.(index)}
                          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm opacity-0 transition hover:border-slate-300 hover:text-slate-800 group-hover:opacity-100"
                          aria-label="Edit due date"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  <StatusUpdater
                    status={row.status}
                    statusOptions={statusOptions}
                    completionDate={row.completionDate}
                    onStatusChange={(nextStatus) => onStatusChange(index, nextStatus)}
                  />
                  <td className="px-4 py-3">
                    {row.calcReminder}
                  </td>
                  <td className="px-4 py-3">
                    {row.calcEscalation}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Note: Use "Add New Schedule" to extend the schedule based on the configured frequency.
      </p>
    </section>
  )
}

export default GaugeTable
