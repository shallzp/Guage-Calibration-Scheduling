function statusClassName(status) {
  if (status === 'Completed') return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
  if (status === 'Overdue') return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
  if (status === 'In Progress') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
  return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
}

function StatusUpdater({ status, statusOptions, completionDate, onStatusChange }) {
  return (
    <>
      <td className="px-4 py-3">
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
          className={`rounded-lg px-2.5 py-2 font-medium outline-none ${statusClassName(status)}`}
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
