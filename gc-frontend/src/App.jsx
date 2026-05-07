import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import Navbar from './components/Navbar'
import CampaignDashboard from './pages/CampaignDashboard'
import GaugeDashboard from './pages/GaugeDashboard'
import ScheduleCalibration from './pages/ScheduleCalibration'
import { toGaugeModelFromApi } from './utils/gaugeData'
import { apiFetch } from './utils/api'

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
      setGaugeRecords(Array.isArray(data) ? data.map(toGaugeModelFromApi) : [])
      setGaugeLoadError(false)
    } catch (error) {
      setGaugeRecords([])
      setGaugeLoadError(true)
    } finally {
      setIsLoadingGauges(false)
    }
  }, [])

  useEffect(() => {
    let isActive = true

    async function loadCampaignData() {
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

        if (!isActive) return
        setCampaignData(Array.isArray(campaignRowsResponse) ? campaignRowsResponse : [])
        setPartsDispatchData(Array.isArray(partsDispatchRowsResponse) ? partsDispatchRowsResponse : [])
        setCampaignLoadError(false)
      } catch (error) {
        if (!isActive) return
        setCampaignData([])
        setPartsDispatchData([])
        setCampaignLoadError(true)
      } finally {
        if (!isActive) return
        setIsLoadingCampaign(false)
      }
    }

    loadGauges()
    loadCampaignData()

    return () => {
      isActive = false
    }
  }, [loadGauges])

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
              element={<ScheduleCalibration gauges={gaugeRecords} setGauges={setGaugeRecords} />}
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
