import { statusBadgeStyle } from '../utils/gauge/badgeStyles'

function statusClassName(status) {
  return statusBadgeStyle(status) ?? 'bg-slate-100 text-slate-700 border-slate-200'
}

function StatusUpdater({ status, statusOptions, completionDate, onStatusChange }) {
  return (
    <>
      <td className="px-4 py-3">
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
          className={`rounded-lg border px-2.5 py-2 font-medium outline-none ${statusClassName(status)}`}
        >
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 font-medium text-slate-700">{completionDate || '-'}</td>
    </>
  )
}

export default StatusUpdater
