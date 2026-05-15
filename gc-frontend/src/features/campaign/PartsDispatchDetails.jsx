import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

import Pagination from '../../components/Pagination'
import TableSkeleton from '../../components/TableSkeleton'

import { formatISODate } from '../../utils/dateUtils'

function toDisplayValue(value, key, fallback = 'Not Available') {
    if (value === null || value === undefined) return fallback

    // Format date fields
    if (key && (key.includes('Date') || key === 'PO Date' || key === 'Dispatch Date')) {
        if (typeof value === 'string' || value instanceof String) {
            const formatted = formatISODate(value)
            return formatted || fallback
        }
    }

    const text = String(value).trim()
    return text ? text : fallback
}

export function PartsDispatchSkeleton() {
    return <TableSkeleton widths={['w-24', 'w-32', 'w-20', 'w-32', 'w-24', 'w-20', 'w-20', 'w-24', 'w-28', 'w-20', 'w-24', 'w-32', 'w-20', 'w-24', 'w-16', 'w-20']} rows={10} title="Parts Dispatch Details" />
}

function PartsDispatchDetails({ dispatchData }) {
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

    const isInitialMount = useRef(true)
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
        } else {
            setCurrentPage(1)
        }
    }, [dispatchData])

    const itemsPerPage = 10
    const totalPages = Math.ceil(dispatchData.length / itemsPerPage)
    const safePage = Math.max(1, Math.min(currentPage, totalPages || 1))
    const currentRows = dispatchData.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)

    return (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Plant</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Plant Description</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Material No.</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Material Description</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">PO Number</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Order Quantity</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Original Receive Quantity</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">GR Quantity</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">PO Date</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Dispatch Date</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">NRGP/Challan Number</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Docket Number</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Transporter Name</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Campaign Short Desc</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Region</th>
                        <th className="whitespace-nowrap px-4 py-3 border-b border-slate-200">Area Office</th>
                    </tr>
                </thead>
                <tbody>
                    {currentRows.map((row, index) => (
                        <tr key={index} className="border-t border-slate-200/80 text-slate-700 hover:bg-slate-50">
                            <td className="px-4 py-3">{toDisplayValue(row['Plant'], 'Plant', '-')}</td>
                            <td className="whitespace-nowrap px-4 py-3">{toDisplayValue(row['Plant Description'], 'Plant Description', '-')}</td>
                            <td className="px-4 py-3">{toDisplayValue(row['Material No'], 'Material No.', '-')}</td>
                            <td className="whitespace-nowrap px-4 py-3">{toDisplayValue(row['Material Description'], 'Material Description', '-')}</td>
                            <td className="whitespace-nowrap px-4 py-3">{toDisplayValue(row['PO Number'], 'PO Number', '-')}</td>
                            <td className="px-4 py-3">{toDisplayValue(row['Order Quantity'], 'Order Quantity', '-')}</td>
                            <td className="px-4 py-3">{toDisplayValue(row['Original Receive Quantity'], 'Original Receive Quantity', '-')}</td>
                            <td className="px-4 py-3">{toDisplayValue(row['GR Quantity'], 'GR Quantity', '-')}</td>
                            <td className="px-4 py-3">{toDisplayValue(row['PO Date'], 'PO Date', '-')}</td>
                            <td className="px-4 py-3">{toDisplayValue(row['Dispatch Date'], 'Dispatch Date', '-')}</td>
                            <td className="px-4 py-3">{toDisplayValue(row['NRGP/Challan Number'], 'NRGP/Challan Number', '-')}</td>
                            <td className="whitespace-nowrap px-4 py-3">{toDisplayValue(row['Docket Number'], 'Docket Number', '-')}</td>
                            <td className="px-4 py-3">{toDisplayValue(row['Transporter Name'], 'Transporter Name', '-')}</td>
                            <td className="px-4 py-3">{toDisplayValue(row['Campaign Short Desc'], 'Campaign Short Desc', '-')}</td>
                            <td className="whitespace-nowrap px-4 py-3">{toDisplayValue(row['Region'], 'Region', '-')}</td>
                            <td className="whitespace-nowrap px-4 py-3">{toDisplayValue(row['Area Office'], 'Area Office', '-')}</td>
                        </tr>
                    ))}
                    {dispatchData.length === 0 && (
                        <tr className="border-t border-slate-200/80">
                            <td colSpan={16} className="px-4 py-8 text-center text-sm text-slate-500">
                                No parts dispatch data available.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                filteredCount={dispatchData.length}
                onPageChange={setCurrentPage}
            />
        </div>
    )
}

export default PartsDispatchDetails
