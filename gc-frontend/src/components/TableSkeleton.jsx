export default function TableSkeleton({ rows = 10, title = null, widths }) {

    return (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            {title && (
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="h-4 w-56 rounded-full bg-slate-200/70 animate-pulse" />
                    <span className="sr-only">{title}</span>
                </div>
            )}
            <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <tr>
                        {widths.map((width, index) => (
                            <th key={`head-${index}`} className="px-4 py-3">
                                <div className={`h-3 ${width} rounded-full bg-slate-200/70 animate-pulse`} />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {Array.from({ length: rows }).map((_, rowIndex) => (
                        <tr key={`row-${rowIndex}`}>
                            {widths.map((width, colIndex) => (
                                <td key={`cell-${rowIndex}-${colIndex}`} className="px-4 py-4">
                                    <div className={`h-5 ${width} rounded-full bg-slate-200/60 animate-pulse`} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
