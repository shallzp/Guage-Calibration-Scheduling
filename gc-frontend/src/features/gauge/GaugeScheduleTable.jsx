import { Pencil } from 'lucide-react'

import StatusUpdater from '../../components/StatusUpdater'
import { calculateReminderDate, calculateEscalationDate } from '../../utils/slaUtils'

const statusOptions = ['In Progress', 'Not Started', 'Completed', 'Overdue']

function GaugeTable({ gauge, slaConfig, onStatusChange, onAddSchedule, onChangeFrequency, onEditDueDate }) {
  if (!gauge) return null

  return (
    <section className="mt-7 fade-in-up overflow-hidden rounded-3xl border border-white/60 bg-[color:var(--card)] p-5 shadow-[0_20px_55px_rgba(18,38,63,0.14)] backdrop-blur md:p-8">
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
        <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
          Gauge ID: {gauge.gaugeId}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
          Gauge Name: {gauge.gaugeName}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
          Department: {gauge.currentLocation}
        </span>
        <span className="rounded-full bg-teal-50 px-3 py-1 font-medium text-teal-700">
          Frequency: {gauge.frequency} months
        </span>
        {gauge.riskLevel && (
          <span className={`rounded-full px-3 py-1 font-medium ${
            gauge.riskLevel === 'high'
              ? 'bg-rose-100 text-rose-700'
              : gauge.riskLevel === 'medium'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-emerald-100 text-emerald-700'
          }`}>
            Risk: {gauge.riskLevel.charAt(0).toUpperCase() + gauge.riskLevel.slice(1)}
          </span>
        )}
        {gauge.riskAction && (
          <span className="rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-700">
            Action: {gauge.riskAction}
          </span>
        )}
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Completion Date</th>
              <th className="px-4 py-3">Reminder Email Date & Time</th>
              <th className="px-4 py-3">Escalate Email Date & Time</th>
            </tr>
          </thead>
          <tbody>
            {gauge.schedule.map((row, index) => (
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
                  {row.reminderDateTime || calculateReminderDate(row.dueDate, row.status, slaConfig)}
                </td>
                <td className="px-4 py-3">
                  {row.escalationDateTime || calculateEscalationDate(row.dueDate, row.status, slaConfig)}
                </td>
              </tr>
            ))}
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
