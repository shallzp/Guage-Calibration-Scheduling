import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export default function SortableHeader({ label, field, sortField, sortDirection, onSort }) {
  const isActive = sortField === field

  return (
    <th
      className="px-4 py-3 cursor-pointer group hover:bg-slate-100 transition select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        {isActive ? (
          sortDirection === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-teal-700" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-teal-700" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-40 group-hover:opacity-100 transition" />
        )}
      </div>
    </th>
  )
}
