import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

import { formatISODate } from '../../utils/dateUtils'

import SortableHeader from '../../components/SortableHeader'
import Pagination from '../../components/Pagination'
import TableSkeleton from '../../components/TableSkeleton'

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

function SummaryTable({ title, rows = [], firstColumnLabel, extraColumns = [], clearFilterTrigger = 0, onSortChange }) {
    const [searchParams, setSearchParams] = useSearchParams()
    const pageParam = parseInt(searchParams.get('page') || '1', 10)
    const currentPage = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam

    const setCurrentPage = (page) => {
        const next = new URLSearchParams(searchParams)
        if (page === 1) {
            next.delete('page')
        } else {
            next.set('page', page.toString())
        }
        setSearchParams(next, { replace: true })
    }
    const [sortField, setSortField] = useState(null)
    const [sortDirection, setSortDirection] = useState('asc')

    const isInitialMount = useRef(true)
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
        } else {
            setCurrentPage(1)
        }
    }, [rows])

    useEffect(() => {
        if (clearFilterTrigger > 0) {
            setSortField(null)
            setSortDirection('asc')
            setCurrentPage(1)
            if (onSortChange) onSortChange(false)
        }
    }, [clearFilterTrigger, onSortChange])

    const sortedRows = useMemo(() => {
        if (!sortField) return rows
        return [...rows].sort((a, b) => {
            let aVal = a[sortField]
            let bVal = b[sortField]

            if (sortField.toLowerCase().includes('date')) {
                const parseD = (val) => (!val || val === '-' ? 0 : new Date(val).getTime() || 0)
                aVal = parseD(aVal)
                bVal = parseD(bVal)
            }

            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
            return 0
        })
    }, [rows, sortField, sortDirection])

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDirection('asc')
        }
        if (onSortChange) onSortChange(true)
    }

    const itemsPerPage = 10
    const totalPages = Math.ceil(sortedRows.length / itemsPerPage)
    const safePage = Math.max(1, Math.min(currentPage, totalPages || 1))
    const currentRows = sortedRows.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)

    return (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="display-font text-sm font-semibold text-slate-900">{title}</p>
            </div>
            <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                        <th className="whitespace-nowrap px-4 py-3">{firstColumnLabel}</th>
                        {extraColumns.map((col) => {
                            if (col.key.toLowerCase().includes('date')) {
                                return <SortableHeader key={col.header} label={col.header} field={col.key} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                            }
                            return <th key={col.header} className="whitespace-nowrap px-4 py-3">{col.header}</th>
                        })}
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
