import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import Navbar from './components/Navbar'
import CampaignDashboard from './pages/CampaignDashboard'
import GaugeDashboard from './pages/GaugeDashboard'
import ScheduleCalibration from './pages/ScheduleCalibration'
import { toGaugeModelFromApi } from './utils/gaugeData'
import { apiFetch, mlFetch } from './utils/api'

function App() {
  const [gaugeRecords, setGaugeRecords] = useState([])
  const [isLoadingGauges, setIsLoadingGauges] = useState(true)
  const [gaugeLoadError, setGaugeLoadError] = useState(false)
  const [campaignData, setCampaignData] = useState([])
  const [partsDispatchData, setPartsDispatchData] = useState([])
  const [isLoadingCampaign, setIsLoadingCampaign] = useState(true)
  const [campaignLoadError, setCampaignLoadError] = useState(false)

  const loadGauges = useCallback(async () => {
    setIsLoadingGauges(true)
    try {
      const response = await apiFetch('/api/gauges')
      if (!response.ok) throw new Error('Failed to fetch gauges')
      const data = await response.json()

      const models = Array.isArray(data) ? data.map(toGaugeModelFromApi) : []
      setGaugeRecords(models)
      setGaugeLoadError(false)
    } catch (error) {
      setGaugeRecords([])
      setGaugeLoadError(true)
    } finally {
      setIsLoadingGauges(false)
    }
  }, [])

  const loadCampaignData = useCallback(async () => {
    setIsLoadingCampaign(true)
    try {
      const [campaignResponse, partsDispatchResponse] = await Promise.all([
        apiFetch('/api/campaign'),
        apiFetch('/api/parts-dispatch'),
      ])

      if (!campaignResponse.ok || !partsDispatchResponse.ok) {
        throw new Error('Failed to fetch campaign data')
      }

      const [campaignRowsResponse, partsDispatchRowsResponse] = await Promise.all([
        campaignResponse.json(),
        partsDispatchResponse.json(),
      ])

      setCampaignData(Array.isArray(campaignRowsResponse) ? campaignRowsResponse : [])
      setPartsDispatchData(Array.isArray(partsDispatchRowsResponse) ? partsDispatchRowsResponse : [])
      setCampaignLoadError(false)
    } catch (error) {
      setCampaignData([])
      setPartsDispatchData([])
      setCampaignLoadError(true)
    } finally {
      setIsLoadingCampaign(false)
    }
  }, [])

  /**
   * Background ML startup sequence (runs once on app mount, fully fire-and-forget).
   * 1. Await overdue recalculation so training data is fresh.
   * 2. Trigger a full model retrain on the ML service.
   * 3. Poll /api/train/status until "done" or "error" (max ~4 min).
   * 4. Run risk scoring so gauge risk levels are up-to-date.
   * 5. Silently reload gauges to surface the new risk scores in the UI.
   */
  const runMlPipeline = useCallback(async () => {
    try {
      // Step 1 — Wait for overdue statuses to be corrected in DB
      await apiFetch('/api/gauges/recalculate-overdue', { method: 'POST' })
    } catch (err) {
      console.error('recalculate-overdue failed:', err)
      // Non-fatal — continue pipeline with possibly stale statuses
    }

    try {
      // Step 2 — Only trigger training if not already running
      // (React Strict Mode double-invokes effects in dev, so check first to avoid 409)
      const currentStatusRes = await mlFetch('/api/train/status')
      const currentStatus = currentStatusRes.ok
        ? (await currentStatusRes.json()).status
        : 'idle'

      if (currentStatus !== 'running') {
        const trainRes = await mlFetch('/api/train', { method: 'POST' })
        // 409 = training already started by a concurrent invocation (React Strict Mode)
        // — fall through to polling in both cases
        if (!trainRes.ok && trainRes.status !== 409) {
          console.error('ML train trigger failed:', trainRes.status)
          return
        }
      }

      // Step 3 — Poll until training finishes (4 s interval, max 225 attempts ≈ 15 min)
      const MAX_POLLS = 225
      const POLL_INTERVAL_MS = 4000
      let done = false

      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

        const statusRes = await mlFetch('/api/train/status')
        if (!statusRes.ok) continue

        const { status } = await statusRes.json()
        if (status === 'done') { done = true; break }
        if (status === 'error') {
          console.warn('ML training reported an error — will still attempt risk scoring with existing model.')
          break  // fall through to risk scoring rather than bailing
        }
      }

      if (!done) {
        console.warn('ML training did not complete within the polling window — attempting risk scoring anyway.')
      }

      // Step 4 — Run risk scoring now that models are fresh (or best available)
      await mlFetch('/api/risk/run', { method: 'POST' })

      // Step 5 — Reload gauges silently to show updated risk scores
      loadGauges()

      console.log('[ML Pipeline] Completed: overdue recalculation → training → risk scoring → gauge reload.')
    } catch (err) {
      console.error('ML pipeline error:', err)
    }
  }, [loadGauges])

  useEffect(() => {
    // UI data loads immediately (parallel, not blocked by ML pipeline)
    loadGauges()
    loadCampaignData()

    // ML pipeline runs entirely in background
    runMlPipeline()
  }, [loadGauges, loadCampaignData, runMlPipeline])

  return (
    <div className="min-h-screen md:flex">
      <Navbar />
      <div className="min-w-0 flex-1">
        <Routes>
          <Route path="/gauge-calibration">
            <Route index element={<Navigate to="gauge-overview" replace />} />
            <Route
              path=":tab"
              element={
                <GaugeDashboard
                  gauges={gaugeRecords}
                  isLoading={isLoadingGauges}
                  hasError={gaugeLoadError}
                  onRefreshGauges={loadGauges}
                />
              }
            />
            <Route
              path="schedule/:gaugeKey"
              element={
                <ScheduleCalibration
                  gauges={gaugeRecords}
                  setGauges={setGaugeRecords}
                  onRefreshGauges={loadGauges}
                />
              }
            />
          </Route>
          <Route path="/campaign">
            <Route index element={<Navigate to="campaign-overview" replace />} />
            <Route
              path=":tab"
              element={
                <CampaignDashboard
                  campaignData={campaignData}
                  partsDispatchData={partsDispatchData}
                  isLoading={isLoadingCampaign}
                  hasError={campaignLoadError}
                />
              }
            />
          </Route>
          <Route path="/dashboard" element={<Navigate to="/gauge-calibration" replace />} />
          <Route path="/" element={<Navigate to="/gauge-calibration" replace />} />
          <Route path="*" element={<Navigate to="/gauge-calibration" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
