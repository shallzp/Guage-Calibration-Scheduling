import { useState, useEffect } from 'react'
import Pagination from '../../components/Pagination'
import TableSkeleton from '../../components/TableSkeleton'
import { formatISODate } from '../../utils/dateUtils'

function formatCellValue(value, key) {
    if (value === null || value === undefined) return '-'

    // Format date fields
    if (key && (key.includes('Date') || key === 'startDate' || key === 'endDate')) {
        if (typeof value === 'string' || value instanceof String) {
            const formatted = formatISODate(value)
            return formatted || '-'
        }
    }

    return value
}

export function SummaryTableSkeleton({ title }) {
    return <TableSkeleton widths={['w-24', 'w-20', 'w-28', 'w-16', 'w-24', 'w-20', 'w-16', 'w-20', 'w-24', 'w-16', 'w-20']} rows={10} title={title} />
}

function SummaryTable({ title, rows = [], firstColumnLabel, extraColumns = [] }) {
    const [currentPage, setCurrentPage] = useState(1)

    useEffect(() => {
        setCurrentPage(1)
    }, [rows])

    const itemsPerPage = 10
    const totalPages = Math.ceil(rows.length / itemsPerPage)
    const safePage = Math.max(1, Math.min(currentPage, totalPages || 1))
    const currentRows = rows.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)

    return (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="display-font text-sm font-semibold text-slate-900">{title}</p>
            </div>
            <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                        <th className="whitespace-nowrap px-4 py-3">{firstColumnLabel}</th>
                        {extraColumns.map((col) => (
                            <th key={col.header} className="whitespace-nowrap px-4 py-3">{col.header}</th>
                        ))}
                        <th className="px-4 py-3">No of Vehicles Assigned</th>
                        <th className="px-4 py-3">No of Vehicles attended</th>
                        <th className="px-4 py-3">Pending No</th>
                        <th className="px-4 py-3">% Of Completion</th>
                        <th className="px-4 py-3">Parts Ordered</th>
                        <th className="px-4 py-3">Qty Executed</th>
                        <th className="px-4 py-3">GR Qty</th>
                        <th className="px-4 py-3">Details Chassis</th>
                        <th className="px-4 py-3">Details Parts</th>
                        <th className="px-4 py-3">Loss Opportunity</th>
                    </tr>
                </thead>
                <tbody>
                    {currentRows.map((row) => (
                        <tr key={row.label} className="border-t border-slate-200/80 text-slate-700 hover:bg-slate-50">
                            <td className="whitespace-nowrap px-4 py-3 font-medium">{row.label}</td>
                            {extraColumns.map((col) => (
                                <td key={col.key} className="whitespace-nowrap px-4 py-3">{formatCellValue(row[col.key], col.key)}</td>
                            ))}
                            <td className="px-4 py-3">{row.noOfVehiclesAssigned}</td>
                            <td className="px-4 py-3">{row.noOfVehiclesAttended}</td>
                            <td className="px-4 py-3">{row.pendingNo}</td>
                            <td className="px-4 py-3">{row.completionPercent}</td>
                            <td className="px-4 py-3">{row.partsOrdered}</td>
                            <td className="px-4 py-3">{row.qtyExecuted}</td>
                            <td className="px-4 py-3">{row.grQty}</td>
                            <td className="px-4 py-3">{row.detailsChassis}</td>
                            <td className="px-4 py-3">{row.detailsParts}</td>
                            <td className="px-4 py-3">{row.lossOpportunity}</td>
                        </tr>
                    ))}
                    {rows.length === 0 && (
                        <tr className="border-t border-slate-200/80">
                            <td colSpan={11 + extraColumns.length} className="px-4 py-8 text-center text-sm text-slate-500">
                                No records match the selected filters.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                filteredCount={rows.length}
                onPageChange={setCurrentPage}
            />
        </div>
    )
}

export default SummaryTable
