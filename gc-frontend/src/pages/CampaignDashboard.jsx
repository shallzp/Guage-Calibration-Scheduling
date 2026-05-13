import { useMemo, useState, useEffect } from 'react'
import { NavLink, useParams, useSearchParams } from 'react-router-dom'

import { normalizeCampaignRow, toSelectOptions, buildCampaignOverviewRows, buildSummaryRows } from '../utils/campaignData'

import CampaignFilters, { CampaignFiltersSkeleton } from '../features/campaign/CampaignFilters'
import SummaryTable, { SummaryTableSkeleton } from '../features/campaign/SummaryTable'
import CampaignOverview from '../features/campaign/CampaignOverview'
import PartsDispatchDetails, { PartsDispatchSkeleton } from '../features/campaign/PartsDispatchDetails'

const TAB_CONFIG = [
  { id: 'campaign-overview', label: 'Campaign Overview' },
  { id: 'region-wise-summary', label: 'Region-wise Summary' },
  { id: 'area-office-wise-summary', label: 'Area-office Wise Summary' },
  { id: 'parts-dispatch-summary', label: 'Parts Dispatch Summary' },
]

const FILTERED_DASHBOARDS = new Set([
  'campaign-overview',
  'region-wise-summary',
  'area-office-wise-summary'
])

const DEFAULT_FILTERS = {
  campaignStatus: 'all',
  region: 'all',
  areaOffice: 'all',
  companyCode: 'all',
  plantCode: 'all',
  campaignType: 'all',
  campaignDesc: 'all',
  chassisNo: 'all',
  year: 'all',
  month: 'all',
}

const MONTH_LABELS = { 
  '1': 'January', '2': 'February', '3': 'March', '4': 'April', '5': 'May', '6': 'June', '7': 'July', 
  '8': 'August', '9': 'September', '10': 'October', '11': 'November', '12': 'December'
}

function CampaignDashboard({ campaignData, partsDispatchData, isLoading, hasError }) {
  const { tab } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const selectedDashboard = TAB_CONFIG.some((opt) => opt.id === tab)
    ? tab
    : TAB_CONFIG[0].id

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
    const readFiltersFromParams = (params) => ({
      campaignStatus: params.get('campaignStatus') ?? DEFAULT_FILTERS.campaignStatus,
      region: params.get('region') ?? DEFAULT_FILTERS.region,
      areaOffice: params.get('areaOffice') ?? DEFAULT_FILTERS.areaOffice,
      companyCode: params.get('companyCode') ?? DEFAULT_FILTERS.companyCode,
      plantCode: params.get('plantCode') ?? DEFAULT_FILTERS.plantCode,
      campaignType: params.get('campaignType') ?? DEFAULT_FILTERS.campaignType,
      campaignDesc: params.get('campaignDesc') ?? DEFAULT_FILTERS.campaignDesc,
      chassisNo: params.get('chassisNo') ?? DEFAULT_FILTERS.chassisNo,
      year: params.get('year') ?? DEFAULT_FILTERS.year,
      month: params.get('month') ?? DEFAULT_FILTERS.month,
    })

    useEffect(() => {
      const next = readFiltersFromParams(searchParams)
      setFilters((previous) => {
        if (JSON.stringify(previous) === JSON.stringify(next)) return previous
        return next
      })
    }, [searchParams])

    useEffect(() => {
      const next = new URLSearchParams(searchParams)
      const setParam = (key, value, fallback) => {
        if (value && value !== fallback) next.set(key, value)
        else next.delete(key)
      }

      setParam('campaignStatus', filters.campaignStatus, DEFAULT_FILTERS.campaignStatus)
      setParam('region', filters.region, DEFAULT_FILTERS.region)
      setParam('areaOffice', filters.areaOffice, DEFAULT_FILTERS.areaOffice)
      setParam('companyCode', filters.companyCode, DEFAULT_FILTERS.companyCode)
      setParam('plantCode', filters.plantCode, DEFAULT_FILTERS.plantCode)
      setParam('campaignType', filters.campaignType, DEFAULT_FILTERS.campaignType)
      setParam('campaignDesc', filters.campaignDesc, DEFAULT_FILTERS.campaignDesc)
      setParam('chassisNo', filters.chassisNo, DEFAULT_FILTERS.chassisNo)
      setParam('year', filters.year, DEFAULT_FILTERS.year)
      setParam('month', filters.month, DEFAULT_FILTERS.month)

      if (next.toString() !== searchParams.toString()) {
        setSearchParams(next, { replace: true })
      }
    }, [filters, searchParams, setSearchParams])
  const [clearFilterTrigger, setClearFilterTrigger] = useState(0)
  const [isTableSorted, setIsTableSorted] = useState(false)

  useEffect(() => {
    setIsTableSorted(false)
  }, [tab])

  const normalizedCampaignRows = useMemo(() => campaignData.map(normalizeCampaignRow), [campaignData])

  const filterOptions = useMemo(() => {
    const getUniqueValues = (key) =>
      Array.from(new Set(normalizedCampaignRows.map((row) => row[key]).filter((value) => value !== 'Not Available'))).sort()

    return {
      campaignStatus: toSelectOptions(getUniqueValues('campaignStatus'), 'All Campaign Statuses'),
      region: toSelectOptions(getUniqueValues('region'), 'All Regions'),
      areaOffice: toSelectOptions(getUniqueValues('areaOffice'), 'All Area Offices'),
      companyCode: toSelectOptions(getUniqueValues('companyCode'), 'All Company Codes'),
      plantCode: toSelectOptions(getUniqueValues('plantCode'), 'All Plant Codes'),
      campaignType: toSelectOptions(getUniqueValues('campaignType'), 'All Campaign Types'),
      campaignDesc: toSelectOptions(getUniqueValues('campaignDesc'), 'All Campaign Descriptions'),
      chassisNo: toSelectOptions(getUniqueValues('chassisNo'), 'All Chassis Numbers'),
      year: toSelectOptions(getUniqueValues('year'), 'All Years'),
      month: [
        { value: 'all', label: 'All Months' },
        ...getUniqueValues('month')
          .sort((a, b) => Number(a) - Number(b))
          .map((value) => ({ value, label: MONTH_LABELS[value] || value })),
      ],
    }
  }, [normalizedCampaignRows])

  const filteredRows = useMemo(() => {
    return normalizedCampaignRows.filter((row) => {
      if (filters.campaignStatus !== 'all' && row.campaignStatus !== filters.campaignStatus) return false
      if (filters.region !== 'all' && row.region !== filters.region) return false
      if (filters.areaOffice !== 'all' && row.areaOffice !== filters.areaOffice) return false
      if (filters.companyCode !== 'all' && row.companyCode !== filters.companyCode) return false
      if (filters.plantCode !== 'all' && row.plantCode !== filters.plantCode) return false
      if (filters.campaignType !== 'all' && row.campaignType !== filters.campaignType) return false
      if (filters.year !== 'all' && row.year !== filters.year) return false
      if (filters.month !== 'all' && row.month !== filters.month) return false
      if (filters.campaignDesc !== 'all' && row.campaignDesc !== filters.campaignDesc) return false
      if (filters.chassisNo !== 'all' && row.chassisNo !== filters.chassisNo) return false
      return true
    })
  }, [normalizedCampaignRows, filters])

  const campaignOverviewRows = useMemo(() => buildCampaignOverviewRows(filteredRows), [filteredRows])

  const filteredDispatchRows = useMemo(() => {
    return partsDispatchData.filter((row) => {
      if (filters.region !== 'all' && row['Region'] !== filters.region) return false
      if (filters.areaOffice !== 'all' && row['Area Office'] !== filters.areaOffice) return false
      return true
    })
  }, [partsDispatchData, filters])

  const regionSummaryRows = useMemo(
    () => buildSummaryRows(filteredRows, filteredDispatchRows, (row) => row.region, (row) => row['Region']),
    [filteredRows, filteredDispatchRows],
  )
  const areaOfficeSummary = useMemo(
    () => buildSummaryRows(filteredRows, filteredDispatchRows, (row) => row.areaOffice, (row) => row['Area Office']),
    [filteredRows, filteredDispatchRows],
  )

  const isFilterActive = useMemo(
    () => Object.values(filters).some((value) => value !== 'all') || isTableSorted,
    [filters, isTableSorted],
  )

  const showFilters = FILTERED_DASHBOARDS.has(selectedDashboard)

  const handleFilterChange = (name, value) => {
    setFilters((previous) => ({ ...previous, [name]: value }))
  }

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setClearFilterTrigger((prev) => prev + 1)
    setSearchParams({}, { replace: true })
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -top-24 -left-10 h-60 w-60 rounded-full bg-emerald-300/35 blur-3xl" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl" />

      <section className="relative mx-auto w-full max-w-7xl">
        <header className="mb-8 text-center fade-in-up">
          <p className="display-font text-sm font-semibold uppercase tracking-[0.2em] text-teal-800/80">
            Campaign Dashboard
          </p>
        </header>

        <div className="rounded-2xl border border-white/70 bg-white/85 p-6 shadow-lg">
          <div className="mb-6 flex overflow-x-auto border-b border-slate-200 pb-2 scrollbar-none">
            <nav className="flex space-x-2" aria-label="Tabs">
              {TAB_CONFIG.map((option) => (
                <NavLink
                  key={option.id}
                  to={{
                    pathname: `/campaign/${option.id}`,
                    search: searchParams.toString() ? `?${searchParams.toString()}` : '',
                  }}
                  className={({ isActive }) =>
                    `shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      isActive || (!tab && option.id === TAB_CONFIG[0].id)
                        ? 'bg-teal-700 text-white shadow-sm'
                        : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  {option.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {showFilters && (
            <div className="my-5">
              {isLoading || hasError ? (
                <CampaignFiltersSkeleton />
              ) : (
                <CampaignFilters
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  onClearFilters={handleClearFilters}
                  isFilterActive={isFilterActive}
                  options={filterOptions}
                />
              )}
            </div>
          )}

          {(isLoading || hasError) && selectedDashboard === 'campaign-overview' && (
            <SummaryTableSkeleton title="Campaign Overview Records" />
          )}

          {(isLoading || hasError) && selectedDashboard === 'region-wise-summary' && (
            <SummaryTableSkeleton title="Region-wise Campaign Summary" />
          )}

          {(isLoading || hasError) && selectedDashboard === 'area-office-wise-summary' && (
            <SummaryTableSkeleton title="Area-office Wise Campaign Summary" />
          )}

          {(isLoading || hasError) && selectedDashboard === 'parts-dispatch-summary' && <PartsDispatchSkeleton />}

          {!isLoading && !hasError && selectedDashboard === 'campaign-overview' && (
            <CampaignOverview campaignOverviewRows={campaignOverviewRows} clearFilterTrigger={clearFilterTrigger} onSortChange={setIsTableSorted} />
          )}

          {!isLoading && !hasError && selectedDashboard === 'region-wise-summary' && (
            <SummaryTable
              title="Region-wise Campaign Summary"
              rows={regionSummaryRows}
              firstColumnLabel="Region"
              clearFilterTrigger={clearFilterTrigger}
              onSortChange={setIsTableSorted}
            />
          )}

          {!isLoading && !hasError && selectedDashboard === 'area-office-wise-summary' && (
            <SummaryTable
              title="Area-office Wise Campaign Summary"
              rows={areaOfficeSummary}
              firstColumnLabel="Area Office"
              clearFilterTrigger={clearFilterTrigger}
              onSortChange={setIsTableSorted}
            />
          )}

          {!isLoading && !hasError && selectedDashboard === 'parts-dispatch-summary' && (
            <PartsDispatchDetails dispatchData={partsDispatchData} clearFilterTrigger={clearFilterTrigger} onSortChange={setIsTableSorted} />
          )}
        </div>
      </section>
    </main>
  )
}

export default CampaignDashboard
