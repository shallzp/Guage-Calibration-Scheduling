function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
      <div className="animate-pulse rounded-full bg-slate-200/80 h-3 w-20" />
      <div className="animate-pulse rounded-full bg-slate-200/80 mt-6 h-8 w-14" />
      <div className="animate-pulse rounded-full bg-slate-200/80 mt-3 h-3 w-28" />
    </div>
  )
}

function StatCard({ label, value, sub, color = 'slate', accent }) {
  const colorMap = {
    slate:   { border: 'border-slate-200',   bg: 'bg-white/90',        text: 'text-slate-900',   label: 'text-slate-500'   },
    rose:    { border: 'border-rose-200',     bg: 'bg-rose-50/70',      text: 'text-rose-700',    label: 'text-rose-600'    },
    amber:   { border: 'border-amber-200',    bg: 'bg-amber-50/70',     text: 'text-amber-700',   label: 'text-amber-600'   },
    emerald: { border: 'border-emerald-200',  bg: 'bg-emerald-50/70',   text: 'text-emerald-700', label: 'text-emerald-600' },
    sky:     { border: 'border-sky-200',      bg: 'bg-sky-50/70',       text: 'text-sky-700',     label: 'text-sky-600'     },
    violet:  { border: 'border-violet-200',   bg: 'bg-violet-50/70',    text: 'text-violet-700',  label: 'text-violet-600'  },
    orange:  { border: 'border-orange-200',   bg: 'bg-orange-50/70',    text: 'text-orange-700',  label: 'text-orange-600'  },
    blue:    { border: 'border-blue-200',     bg: 'bg-blue-50/70',      text: 'text-blue-700',    label: 'text-blue-600'    },
    teal:    { border: 'border-teal-200',     bg: 'bg-teal-50/70',      text: 'text-teal-700',    label: 'text-teal-600'    },
  }
  const c = colorMap[color] || colorMap.slate

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-semibold tracking-[0.2em] uppercase ${c.label}`}>{label}</p>
        {accent !== undefined && (
          <span className={`rounded-full border ${c.border} bg-white/80 px-2 py-0.5 text-xs font-semibold ${c.text}`}>
            {accent}
          </span>
        )}
      </div>
      <p className={`mt-5 text-3xl font-bold tabular-nums ${c.text}`}>{value ?? '—'}</p>
      {sub && <p className={`mt-1 text-xs ${c.label}`}>{sub}</p>}
    </div>
  )
}

export { SkeletonCard }
export default StatCard;