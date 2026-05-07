export default function Pagination({
    currentPage,
    totalPages,
    filteredCount,
    onPageChange,
}) {
    const startIndex = filteredCount === 0 ? 0 : (currentPage - 1) * 10 + 1
    const endIndex = filteredCount === 0 ? 0 : Math.min(currentPage * 10, filteredCount)

    if (filteredCount === 0) return null

    return (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm px-4 pb-4">
            <p className="text-slate-600">
                Showing {startIndex}-{endIndex} of {filteredCount}
            </p>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Prev
                </button>
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">
                    Page {currentPage} / {totalPages || 1}
                </span>
                <button
                    type="button"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Next
                </button>
            </div>
        </div>
    )
}
