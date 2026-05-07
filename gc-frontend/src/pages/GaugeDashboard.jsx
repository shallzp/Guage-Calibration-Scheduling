import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'

import GaugeDataTable, { GaugeDataTableSkeleton } from '../features/gauge/GaugeDataTable'
import GaugeOverview, { GaugeOverviewSkeleton } from '../features/gauge/GaugeOverview'
import GaugeRecommendations, { GaugeRecommendationsSkeleton } from '../features/gauge/GaugeRecommendations'
import GaugeBatches, { GaugeBatchesSkeleton } from '../features/gauge/GaugeBatches'
import DialogBox from '../components/DialogBox'
import SLAConfigModal from '../features/gauge/SLAConfigModal'

import { applySLAConfigToGauges, processSLAEmails } from '../utils/slaUtils'
import { apiFetch } from '../utils/api'

const DEFAULT_FILTERS = {
  query: '',
  location: 'all',
  frequency: 'all',
  currentStatus: 'all',
  riskLevel: 'all',
}

const TAB_CONFIG = [
  { id: 'gauge-overview', label: 'Gauge Overview' },
  { id: 'recommendations', label: 'AI Recommendations' },
  { id: 'batch-plan', label: 'Batch Plan' },
  { id: 'gauge-data', label: 'Gauge Data' },
]

const VALID_TAB_IDS = new Set(TAB_CONFIG.map((t) => t.id))
const DEFAULT_TAB = 'gauge-overview'


function GaugeDashboard({ gauges, isLoading, hasError, onRefreshGauges }) {
  const navigate = useNavigate()
  const { tab } = useParams()

  // Resolve active tab from URL — fall back to default if unknown
  const activeTab = VALID_TAB_IDS.has(tab) ? tab : DEFAULT_TAB

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [slaDialog, setSlaDialog] = useState({ isOpen: false, count: 0 })
  const [slaConfig, setSlaConfig] = useState(null)
  const [isLoadingSlaConfig, setIsLoadingSlaConfig] = useState(true)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [slaSaveError, setSlaSaveError] = useState('')
  const [batchCount, setBatchCount] = useState(0)

  const gaugesWithSla = useMemo(() => applySLAConfigToGauges(gauges, slaConfig), [gauges, slaConfig])
  const isGaugeViewLoading = isLoading || isLoadingSlaConfig
  const hasGaugeViewError = hasError || !slaConfig

  useEffect(() => {
    let isActive = true
    ;(async () => {
      setIsLoadingSlaConfig(true)
      try {
        const response = await apiFetch('/api/sla-config')
        if (!response.ok) throw new Error('Failed to fetch SLA config')
        const data = await response.json()
        if (!isActive) return
        setSlaConfig({
          reminderNotStartedHours: Number(data.reminderNotStartedHours),
          reminderOverdueIntervalHours: Number(data.reminderOverdueIntervalHours),
          escalationNotStartedInitialHours: Number(data.escalationNotStartedInitialHours),
          escalationNotStartedIntervalHours: Number(data.escalationNotStartedIntervalHours),
          escalationOverdueInitialHours: Number(data.escalationOverdueInitialHours),
          escalationOverdueIntervalHours: Number(data.escalationOverdueIntervalHours),
        })
      } catch {
        if (!isActive) return
        setSlaConfig(null)
      } finally {
        if (!isActive) return
        setIsLoadingSlaConfig(false)
      }
    })()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true
    apiFetch('/api/batches/current')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch batches')
        return res.json()
      })
      .then((data) => {
        if (isActive && Array.isArray(data)) {
          setBatchCount(data.length)
        }
      })
      .catch((err) => console.error('Error fetching batch count:', err))
      
    return () => { isActive = false }
  }, [])

  const filterOptions = useMemo(() => {
    const getUniqueValues = (key) =>
      Array.from(new Set(gaugesWithSla.map((gauge) => String(gauge[key] || '')))).filter(Boolean).sort()

    const toSelectOptions = (values, allLabel) => [
      { value: 'all', label: allLabel },
      ...values.map(v => ({ value: v, label: v }))
    ]

    const frequencyVals = Array.from(new Set(gaugesWithSla.map((gauge) => String(gauge.frequency)))).filter(Boolean).sort((a, b) => Number(a) - Number(b))

    return {
      location: toSelectOptions(getUniqueValues('currentLocation'), 'All Locations'),
      frequency: toSelectOptions(frequencyVals, 'All Frequencies'),
      currentStatus: toSelectOptions(getUniqueValues('currentStatus'), 'All Statuses'),
      riskLevel: toSelectOptions(getUniqueValues('riskLevel'), 'All Risk Levels'),
    }
  }, [gaugesWithSla])

  const filteredGauges = useMemo(() => {
    const query = filters.query.trim().toLowerCase()

    return gaugesWithSla.filter((gauge) => {
      if (filters.location !== 'all' && gauge.currentLocation !== filters.location) return false
      if (filters.frequency !== 'all' && String(gauge.frequency) !== filters.frequency) return false
      if (filters.currentStatus !== 'all' && gauge.currentStatus !== filters.currentStatus) return false
      if (filters.riskLevel !== 'all' && gauge.riskLevel !== filters.riskLevel) return false
      if (!query) return true

      const searchable = [
        gauge.currentLocation,
        gauge.gaugeId,
        gauge.gaugeName,
        gauge.dueDate,
        gauge.lastCompletionDate,
      ]
        .join(' ')
        .toLowerCase()

      return searchable.includes(query)
    })
  }, [gaugesWithSla, filters])

  const isFilterActive =
    filters.query.trim() !== '' ||
    filters.location !== DEFAULT_FILTERS.location ||
    filters.frequency !== DEFAULT_FILTERS.frequency ||
    filters.currentStatus !== DEFAULT_FILTERS.currentStatus ||
    filters.riskLevel !== DEFAULT_FILTERS.riskLevel

  const handleOpenSchedule = (gaugeKey) => {
    navigate(`/gauge-calibration/schedule/${encodeURIComponent(gaugeKey)}`)
  }

  const handleFilterChange = (name, value) => {
    setFilters((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS)
  }

  const handleRunSLA = () => {
    const emailsSent = processSLAEmails(filteredGauges, slaConfig)
    setSlaDialog({ isOpen: true, count: emailsSent.length })
  }

  const handleSaveConfig = async (newConfig) => {
    try {
      setSlaSaveError('')
      const response = await apiFetch('/api/sla-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      })
      if (!response.ok) {
        let message = 'Failed to save SLA config'
        try {
          const errorPayload = await response.json()
          if (errorPayload?.message) message = errorPayload.message
        } catch {
          // ignore payload parsing errors
        }
        throw new Error(message)
      }
      const saved = await response.json()
      setSlaConfig({
        reminderNotStartedHours: Number(saved.reminderNotStartedHours),
        reminderOverdueIntervalHours: Number(saved.reminderOverdueIntervalHours),
        escalationNotStartedInitialHours: Number(saved.escalationNotStartedInitialHours),
        escalationNotStartedIntervalHours: Number(saved.escalationNotStartedIntervalHours),
        escalationOverdueInitialHours: Number(saved.escalationOverdueInitialHours),
        escalationOverdueIntervalHours: Number(saved.escalationOverdueIntervalHours),
      })
      setConfigModalOpen(false)
    } catch (error) {
      setSlaSaveError(error?.message || 'Failed to save SLA configuration.')
    }
  }

  const recommendationCount = 0


  // Attach counts to tabs
  const tabsWithCounts = useMemo(
    () =>
      TAB_CONFIG.map((t) => ({
        ...t,
        count:
          t.id === 'gauge-data'
            ? gaugesWithSla.length
            : t.id === 'recommendations'
            ? recommendationCount
            : t.id === 'batch-plan'
            ? batchCount
            : undefined,
      })),
    [gaugesWithSla.length, recommendationCount, batchCount],
  )

  const closeSlaDialog = () => setSlaDialog({ isOpen: false, count: 0 })

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -top-24 -left-10 h-60 w-60 rounded-full bg-teal-300/40 blur-3xl" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-72 w-72 rounded-full bg-blue-300/30 blur-3xl" />

      <section className="relative mx-auto w-full max-w-7xl">
        <header className="mb-8 text-center fade-in-up">
          <p className="display-font text-sm font-semibold uppercase tracking-[0.2em] text-teal-800/80">
            Gauge Calibration
          </p>
        </header>

        <div className="rounded-2xl border border-white/70 bg-white/85 p-6 shadow-lg">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
            <div className="flex overflow-x-auto scrollbar-none">
              <nav className="flex space-x-2" aria-label="Tabs">
                {tabsWithCounts.map((t) => {
                  const isActive = activeTab === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => navigate(`/gauge-calibration/${t.id}`)}
                      className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        isActive
                          ? 'bg-teal-700 text-white shadow-sm'
                          : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {t.label}
                      {typeof t.count === 'number' && (
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {t.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </nav>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onRefreshGauges}
                disabled={isGaugeViewLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isGaugeViewLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Refresh Data
              </button>
              <button
                type="button"
                onClick={() => setConfigModalOpen(true)}
                disabled={!slaConfig}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Set SLA
              </button>
              <button
                type="button"
                onClick={handleRunSLA}
                className="rounded-xl border border-slate-300 bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                Run SLA
              </button>
            </div>
          </div>

          {activeTab === 'gauge-overview' &&
            (isGaugeViewLoading || hasGaugeViewError ? (
              <GaugeOverviewSkeleton />
            ) : (
              <GaugeOverview gauges={gaugesWithSla} />
            ))}

          {activeTab === 'recommendations' &&
            (isGaugeViewLoading || hasGaugeViewError ? (
              <GaugeRecommendationsSkeleton />
            ) : (
              <GaugeRecommendations gauges={gaugesWithSla} />
            ))}

          {activeTab === 'batch-plan' &&
            (isGaugeViewLoading || hasGaugeViewError ? (
              <GaugeBatchesSkeleton />
            ) : (
              <GaugeBatches gauges={gaugesWithSla} />
            ))}

          {activeTab === 'gauge-data' &&
            (isGaugeViewLoading || hasGaugeViewError ? (
              <GaugeDataTableSkeleton />
            ) : (
              <GaugeDataTable
                gauges={filteredGauges}
                selectedGaugeKey=""
                onOpenSchedule={handleOpenSchedule}
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                isFilterActive={isFilterActive}
                filterOptions={filterOptions}
              />
            ))}
        </div>
      </section>

      <DialogBox
        isOpen={slaDialog.isOpen}
        title="SLA Rules Processed"
        message={`SLA processing completed. ${slaDialog.count} email(s) will be triggered today based on SLA rules.`}
        onConfirm={closeSlaDialog}
        confirmText="OK"
      />

      <SLAConfigModal
        isOpen={configModalOpen && Boolean(slaConfig)}
        initialConfig={slaConfig}
        onSave={handleSaveConfig}
        onClose={() => setConfigModalOpen(false)}
        errorMessage={slaSaveError}
      />
    </main>
  )
}

export default GaugeDashboard
