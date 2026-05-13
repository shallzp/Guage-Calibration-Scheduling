import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'

import GaugeScheduleTable from '../features/gauge/GaugeScheduleTable'
import DialogBox from '../components/DialogBox'
import StakeholderModal from '../features/gauge/StakeholderModal'

import { addMonthsClamped, formatDate, inputDateToDisplayDate, parseDate, toInputDate } from '../utils/dateUtils'

import { STATUS, toGaugeModelFromApi } from '../utils/gaugeData'
import { apiFetch } from '../utils/api'

const initialDialogState = { isOpen: false, gaugeKey: '', rowIndex: null, completionDate: '', scheduledDate: '' }
const initialFrequencyDialog = { isOpen: false, value: '' }
const initialEditDateDialog = { isOpen: false, rowIndex: null, value: '' }

function ScheduleCalibration({ gauges, setGauges, onRefreshGauges }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { gaugeKey: gaugeKeyParam } = useParams()
  const routeGaugeKey = gaugeKeyParam ? decodeURIComponent(gaugeKeyParam) : ''

  const [confirmDialog, setConfirmDialog] = useState(initialDialogState)
  const [frequencyDialog, setFrequencyDialog] = useState(initialFrequencyDialog)
  const [editDateDialog, setEditDateDialog] = useState(initialEditDateDialog)
  const [stakeholderModalOpen, setStakeholderModalOpen] = useState(false)
  const [stakeholderData, setStakeholderData] = useState({ operators: [], supervisors: [] })
  const [availableUsers, setAvailableUsers] = useState([])
  const [slaConfig, setSlaConfig] = useState(null)

  // Tracks the anchor for the next "add schedule" row.
  // Whichever action ran last wins — manual due-date edit OR
  // "shift future dates" confirmation after a completion.
  // Shape: { anchorDate: string (display format), anchorRowIndex: number } | null
  // Persisted in localStorage so it survives navigation/refresh.
  const LOCAL_STORAGE_KEY = routeGaugeKey ? `shiftBase:${routeGaugeKey}` : null

  const [lastDateShiftBase, setLastDateShiftBaseRaw] = useState(() => {
    if (!LOCAL_STORAGE_KEY) return null
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const setLastDateShiftBase = (value) => {
    setLastDateShiftBaseRaw(value)
    if (!LOCAL_STORAGE_KEY) return
    try {
      if (value === null) {
        localStorage.removeItem(LOCAL_STORAGE_KEY)
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(value))
      }
    } catch {
      // ignore storage errors
    }
  }

  const selectedGauge = useMemo(
    () => gauges.find((gauge) => gauge.key === routeGaugeKey) || null,
    [gauges, routeGaugeKey],
  )

  const availableFrequencies = useMemo(() => {
    const baseOptions = [1, 4, 6, 12, 24]
    const currentFrequency = Number(selectedGauge?.frequency) || 0
    return baseOptions.filter((value) => value > currentFrequency)
  }, [selectedGauge])

  useEffect(() => {
    let isActive = true

    async function loadStakeholders() {
      if (!routeGaugeKey) return
      try {
        const response = await apiFetch(`/api/gauges/stakeholders?gaugeKey=${encodeURIComponent(routeGaugeKey)}`)
        if (!response.ok) throw new Error('Failed to fetch stakeholders')
        const data = await response.json()
        if (!isActive) return
        setStakeholderData({
          operators: Array.isArray(data?.operators) ? data.operators : [],
          supervisors: Array.isArray(data?.supervisors) ? data.supervisors : [],
        })
      } catch {
        if (!isActive) return
        setStakeholderData({ operators: [], supervisors: [] })
      }
    }

    loadStakeholders()

    return () => {
      isActive = false
    }
  }, [routeGaugeKey])

  useEffect(() => {
    let isActive = true

    async function loadUsers() {
      try {
        const response = await apiFetch('/api/users')
        if (!response.ok) throw new Error('Failed to fetch users')
        const data = await response.json()
        if (!isActive) return
        setAvailableUsers(Array.isArray(data) ? data : [])
      } catch {
        if (!isActive) return
        setAvailableUsers([])
      }
    }

    loadUsers()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true

    async function loadSlaConfig() {
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
      }
    }

    loadSlaConfig()

    return () => {
      isActive = false
    }
  }, [])

  const handleOpenStakeholders = () => setStakeholderModalOpen(true)

  const handleSaveStakeholders = async (data) => {
    const toPayloadList = (items) =>
      (items || [])
        .map((item) => ({ user_id: item?.user_id || item?._id }))
        .filter((item) => item.user_id)

    const payload = {
      operators: toPayloadList(data.operators),
      supervisors: toPayloadList(data.supervisors),
    }

    try {
      const response = await apiFetch(`/api/gauges/stakeholders?gaugeKey=${encodeURIComponent(routeGaugeKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to save stakeholders')
      const saved = await response.json()
      const normalized = {
        operators: Array.isArray(saved?.operators) ? saved.operators : [],
        supervisors: Array.isArray(saved?.supervisors) ? saved.supervisors : [],
      }
      setStakeholderData(normalized)
    } catch {
      // Keep backend as single source of truth: do not fallback to local storage.
    } finally {
      setStakeholderModalOpen(false)
    }
  }

  const handleBackToList = async () => {
    try {
      if (onRefreshGauges) {
        await onRefreshGauges()
      }
    } finally {
      if (location.state && location.state.from) {
        navigate(location.state.from)
      } else {
        navigate('/gauge-calibration/gauge-data')
      }
    }
  }

  const openFrequencyDialog = () => {
    if (!selectedGauge) return
    const nextValue = availableFrequencies[0] ? String(availableFrequencies[0]) : ''
    setFrequencyDialog({ isOpen: true, value: nextValue })
  }

  const closeFrequencyDialog = () => setFrequencyDialog(initialFrequencyDialog)

  const handleFrequencyInput = (event) => {
    setFrequencyDialog((previous) => ({ ...previous, value: event.target.value }))
  }

  const handleSaveFrequency = () => {
    if (!selectedGauge) return

    const nextFrequency = Number(frequencyDialog.value)
    const currentFrequency = Number(selectedGauge.frequency) || 0
    if (!Number.isFinite(nextFrequency) || nextFrequency <= currentFrequency) return

    // Collect shifted rows for API persistence
    const shiftedRows = []

    setGauges((previous) =>
      previous.map((gauge) => {
        if (gauge.key !== selectedGauge.key) return gauge

        let lastCompletedIndex = -1
        for (let i = gauge.schedule.length - 1; i >= 0; i--) {
          if (gauge.schedule[i].status === STATUS.COMPLETED) {
            lastCompletedIndex = i
            break
          }
        }
        
        const baseIndex = lastCompletedIndex + 1
        if (baseIndex >= gauge.schedule.length) {
          return {
            ...gauge,
            frequency: nextFrequency,
          }
        }

        // Use the last completed row's due date as the base, or the first non-completed row's date
        const baseDate = lastCompletedIndex >= 0
          ? parseDate(gauge.schedule[lastCompletedIndex]?.dueDate)
          : parseDate(gauge.schedule[baseIndex]?.dueDate)

        if (!baseDate) {
          return {
            ...gauge,
            frequency: nextFrequency,
          }
        }

        const updatedRows = gauge.schedule.map((row, index) => {
          if (index < baseIndex) return row
          const offset = lastCompletedIndex >= 0 ? index - lastCompletedIndex : index - baseIndex + 1
          const shiftedDate = addMonthsClamped(baseDate, nextFrequency * offset)
          const newDueDate = formatDate(shiftedDate)
          shiftedRows.push({ scheduleId: row.id, dueDate: newDueDate })
          return { ...row, dueDate: newDueDate }
        })

        const schedule = updatedRows

        return {
          ...gauge,
          frequency: nextFrequency,
          schedule,
        }
      }),
    )

    closeFrequencyDialog()

    // Persist frequency to MongoDB
    apiFetch(`/api/gauges/${encodeURIComponent(selectedGauge.key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency: nextFrequency }),
    })
      .then(async (res) => {
        if (!res.ok) console.error('Update frequency failed:', res.status, res.statusText)
        else {
          const updatedRecord = await res.json()
          setGauges((prev) => prev.map((g) => (g.key === selectedGauge.key ? toGaugeModelFromApi(updatedRecord) : g)))
        }
      })
      .catch((err) => console.error('Update frequency network error:', err))

    // Persist all shifted due dates to MongoDB in one bulk request
    if (shiftedRows.length > 0) {
      const updates = shiftedRows.map(r => ({ scheduleId: r.scheduleId, due_date: r.dueDate }))
      apiFetch(`/api/gauges/${encodeURIComponent(selectedGauge.key)}/schedule-bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
        .then(async (res) => {
          if (!res.ok) console.error('Bulk frequency shift failed:', res.status)
          else {
            const updatedRecord = await res.json()
            setGauges((prev) => prev.map((g) => (g.key === selectedGauge.key ? toGaugeModelFromApi(updatedRecord) : g)))
          }
        })
        .catch((err) => console.error('Bulk frequency shift error:', err))
    }
  }

  const handleAddSchedule = () => {
    if (!selectedGauge) return

    // ── Step 1: Determine the next due date ──────────────────────────────────
    // Case A: A "shift future dates" decision was stored in localStorage.
    //   → Use anchorDate + frequency as the new due date (one-time use).
    //   → Clear the anchor immediately after consuming it.
    // Case B: No anchor → use the last schedule row's due date + frequency.
    let nextDueDate = null
    let consumedAnchor = false

    if (lastDateShiftBase) {
      const { anchorDate } = lastDateShiftBase
      const anchorParsed = parseDate(anchorDate)
      if (anchorParsed) {
        nextDueDate = formatDate(addMonthsClamped(anchorParsed, selectedGauge.frequency))
        consumedAnchor = true
      }
    }

    if (!nextDueDate) {
      // Fallback: last row's due date + frequency
      const lastRow = selectedGauge.schedule[selectedGauge.schedule.length - 1]
      const lastDate = lastRow ? parseDate(lastRow.dueDate) : null
      if (lastDate) {
        nextDueDate = formatDate(addMonthsClamped(lastDate, selectedGauge.frequency))
      }
    }

    if (!nextDueDate) return  // Cannot determine a valid date; bail out

    // ── Step 2: Clear the anchor if it was consumed ──────────────────────────
    if (consumedAnchor) {
      setLastDateShiftBase(null)   // clears state + localStorage
    }

    // ── Step 3: Optimistically append the new row to in-memory state ─────────
    const newRow = {
      id: (selectedGauge.schedule.length || 0) + 1,
      dueDate: nextDueDate,
      status: STATUS.NOT_STARTED,
      completionDate: '',
    }

    setGauges((previous) =>
      previous.map((gauge) => {
        if (gauge.key !== selectedGauge.key) return gauge
        return { ...gauge, schedule: [...gauge.schedule, newRow] }
      }),
    )

    // ── Step 4: Persist to MongoDB ───────────────────────────────────────────
    // Always send the computed due_date explicitly so the backend never
    // re-derives it from a potentially stale last DB row.
    apiFetch(`/api/gauges/${encodeURIComponent(selectedGauge.key)}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: nextDueDate }),
    })
      .then(async (res) => {
        if (!res.ok) {
          console.error('Add schedule failed:', res.status, res.statusText)
          return
        }
        const updatedRecord = await res.json()
        setGauges((prev) => prev.map((g) => (g.key === selectedGauge.key ? toGaugeModelFromApi(updatedRecord) : g)))
      })
      .catch((err) => console.error('Add schedule network error:', err))
  }

  const openEditDueDate = (rowIndex) => {
    if (!selectedGauge) return
    const currentRow = selectedGauge.schedule[rowIndex]
    if (!currentRow) return
    setEditDateDialog({ isOpen: true, rowIndex, value: toInputDate(currentRow.dueDate) })
  }

  const closeEditDueDate = () => setEditDateDialog(initialEditDateDialog)

  const handleEditDueDateInput = (event) => {
    setEditDateDialog((previous) => ({ ...previous, value: event.target.value }))
  }

  const handleSaveDueDate = () => {
    if (!selectedGauge || editDateDialog.rowIndex === null) return

    const nextDate = inputDateToDisplayDate(editDateDialog.value)
    if (!nextDate) return

    const rowIndex = editDateDialog.rowIndex
    const newBaseDate = parseDate(nextDate)

    // Build the shifted rows synchronously from the current gauge data
    // BEFORE calling setGauges (which is async) so the API call always has data.
    const shiftedRows = selectedGauge.schedule.reduce((acc, row, index) => {
      if (index < rowIndex) return acc
      if (index === rowIndex) {
        acc.push({ scheduleId: row.id, dueDate: nextDate })
        return acc
      }
      if (newBaseDate) {
        const shiftedDate = addMonthsClamped(newBaseDate, selectedGauge.frequency * (index - rowIndex))
        acc.push({ scheduleId: row.id, dueDate: formatDate(shiftedDate) })
      }
      return acc
    }, [])

    // Apply the same shifts to in-memory state optimistically
    setGauges((previous) =>
      previous.map((gauge) => {
        if (gauge.key !== selectedGauge.key) return gauge

        const updatedRows = gauge.schedule.map((row, index) => {
          if (index < rowIndex) return row
          if (index === rowIndex) return { ...row, dueDate: nextDate }
          if (newBaseDate) {
            const shiftedDate = addMonthsClamped(newBaseDate, gauge.frequency * (index - rowIndex))
            return { ...row, dueDate: formatDate(shiftedDate) }
          }
          return row
        })

        return { ...gauge, schedule: updatedRows }
      }),
    )

    // Only set the anchor if this is the very last row in the schedule.
    // If there are future rows, they just got shifted, so "Add Schedule"
    // can safely fall back to using the last row's date.
    if (rowIndex === selectedGauge.schedule.length - 1) {
      setLastDateShiftBase({ anchorDate: nextDate, anchorRowIndex: rowIndex })
    } else {
      setLastDateShiftBase(null)
    }

    closeEditDueDate()

    // Persist all shifted rows to MongoDB in the background via bulk request
    if (shiftedRows.length > 0) {
      const updates = shiftedRows.map(r => ({ scheduleId: r.scheduleId, due_date: r.dueDate }))
      apiFetch(`/api/gauges/${encodeURIComponent(selectedGauge.key)}/schedule-bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
        .then(async (res) => {
          if (!res.ok) console.error('Bulk update due date failed:', res.status)
          else {
            const updatedRecord = await res.json()
            setGauges((prev) => prev.map((g) => (g.key === selectedGauge.key ? toGaugeModelFromApi(updatedRecord) : g)))
          }
        })
        .catch((err) => console.error('Bulk update due date error:', err))
    }
  }

  const handleStatusChange = (rowIndex, nextStatus) => {
    if (!selectedGauge) return

    // Track the row's schedule_id and completion_date for the API call
    const changedRow = selectedGauge.schedule[rowIndex]
    const scheduleId = changedRow?.id  // id maps to schedule_id in MongoDB
    const isCompleting = nextStatus === STATUS.COMPLETED
    const completionDate = isCompleting ? formatDate(new Date()) : null

    let shouldShowConfirm = false
    let confirmData = null

    if (isCompleting) {
      const isDifferentDate = changedRow && completionDate !== changedRow.dueDate
      if (isDifferentDate) {
        shouldShowConfirm = true
        confirmData = {
          isOpen: true,
          gaugeKey: selectedGauge.key,
          rowIndex,
          completionDate,
          scheduledDate: changedRow.dueDate,
        }
      }
    }

    setGauges((previous) =>
      previous.map((gauge) => {
        if (gauge.key !== selectedGauge.key) return gauge

        let updatedRows = gauge.schedule.map((row, index) => {
          if (index !== rowIndex) return row
          return { 
            ...row, 
            status: nextStatus,
            completionDate: isCompleting ? completionDate : ''
          }
        })

        const schedule = updatedRows
        return {
          ...gauge,
          schedule,
        }
      }),
    )

    if (shouldShowConfirm) {
      setConfirmDialog(confirmData)
    }

    // Persist status to MongoDB in the background.
    // Do NOT replace the full gauge from the response — it would overwrite
    // any in-memory date shifts that have not propagated to the DB yet.
    if (scheduleId) {
      apiFetch(
        `/api/gauges/${encodeURIComponent(selectedGauge.key)}/schedule/${scheduleId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: nextStatus,
            completion_date: completionDate ?? null,
          }),
        },
      )
        .then(async (res) => {
          if (!res.ok) console.error('Update status failed:', res.status, res.statusText)
          else {
            const updatedRecord = await res.json()
            setGauges((prev) => prev.map((g) => (g.key === selectedGauge.key ? toGaugeModelFromApi(updatedRecord) : g)))
          }
        })
        .catch((err) => console.error('Update status network error:', err))
    }
  }

  const closeDialog = () => setConfirmDialog(initialDialogState)

  const handleShiftFutureDates = () => {
    const { gaugeKey, rowIndex, completionDate, isOpen } = confirmDialog
    if (!isOpen || rowIndex === null || !gaugeKey) {
      closeDialog()
      return
    }

    const baseGauge = gauges.find((gauge) => gauge.key === gaugeKey)
    const completedRow = baseGauge?.schedule?.[rowIndex]
    const completionBaseDate = parseDate(completionDate)
    if (!baseGauge || !completedRow || !completionBaseDate) {
      closeDialog()
      return
    }

    const sortedSchedule = [...(baseGauge.schedule || [])].sort((a, b) => Number(a.id) - Number(b.id))
    const baseIndex = sortedSchedule.findIndex((row) => Number(row.id) === Number(completedRow.id))
    if (baseIndex === -1) {
      closeDialog()
      return
    }

    const shiftMap = new Map()
    for (let i = baseIndex + 1; i < sortedSchedule.length; i++) {
      const row = sortedSchedule[i]
      const shiftedDate = addMonthsClamped(completionBaseDate, baseGauge.frequency * (i - baseIndex))
      shiftMap.set(row.id, formatDate(shiftedDate))
    }

    // Collect shifted rows for API persistence
    const shiftedRows = Array.from(shiftMap.entries()).map(([scheduleId, dueDate]) => ({ scheduleId, dueDate }))

    // Apply date shifts to in-memory state (if any future rows)
    if (shiftMap.size > 0) {
      setGauges((previous) =>
        previous.map((gauge) => {
          if (gauge.key !== gaugeKey) return gauge

          const updatedRows = gauge.schedule.map((row) => {
            if (!shiftMap.has(row.id)) return row
            return { 
              ...row, 
              dueDate: shiftMap.get(row.id),
              status: STATUS.NOT_STARTED,
              completionDate: ''
            }
          })

          return {
            ...gauge,
            schedule: updatedRows,
          }
        }),
      )
    }

    // Only save the anchor if there are NO future rows to shift.
    // If future rows exist, their dates are updated, and "Add Schedule"
    // will just append properly after the last one.
    if (shiftMap.size === 0) {
      setLastDateShiftBase({ anchorDate: completionDate, anchorRowIndex: rowIndex })
    } else {
      setLastDateShiftBase(null)
    }

    closeDialog()

    // Build the bulk updates payload.
    // Always include the completed row's status + completion_date.
    // Append future date shifts if any exist.
    const updates = []
    if (completedRow?.id) {
      updates.push({
        scheduleId: completedRow.id,
        status: STATUS.COMPLETED,
        completion_date: completionDate,
      })
    }
    shiftedRows.forEach((r) => {
      updates.push({ 
        scheduleId: r.scheduleId, 
        due_date: r.dueDate,
        status: STATUS.NOT_STARTED,
        completion_date: null
      })
    })

    // Always fire the bulk API to persist at minimum the completion status.
    // When future rows exist the shifted dates are persisted atomically in the same call.
    if (updates.length > 0) {
      apiFetch(`/api/gauges/${encodeURIComponent(gaugeKey)}/schedule-bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
        .then(async (res) => {
          if (!res.ok) console.error('Bulk shift future dates failed:', res.status)
          else {
            const updatedRecord = await res.json()
            setGauges((prev) => prev.map((g) => (g.key === gaugeKey ? toGaugeModelFromApi(updatedRecord) : g)))
          }
        })
        .catch((err) => console.error('Bulk shift future dates error:', err))
    }
  }

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

        {selectedGauge && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={handleBackToList}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back To Data Table
              </button>
              <button
                type="button"
                onClick={handleOpenStakeholders}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Edit Stakeholders
              </button>
            </div>
            <GaugeScheduleTable
              key={`${selectedGauge.key}-${selectedGauge.frequency}`}
              gauge={selectedGauge}
              slaConfig={slaConfig}
              onStatusChange={handleStatusChange}
              onAddSchedule={handleAddSchedule}
              onChangeFrequency={openFrequencyDialog}
              onEditDueDate={openEditDueDate}
            />
          </>
        )}

        {!selectedGauge && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
            <p className="text-sm font-medium">Schedule not found for this gauge.</p>
            <button
              type="button"
              onClick={handleBackToList}
              className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-800"
            >
              Back To Data Table
            </button>
          </div>
        )}
      </section>

      <DialogBox
        isOpen={confirmDialog.isOpen}
        title="Update Future Dates?"
        onConfirm={handleShiftFutureDates}
        onCancel={closeDialog}
        confirmText="Shift Future Dates"
        cancelText="Keep Dates Same"
      >
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Completed on <span className="font-semibold text-slate-900">{confirmDialog.completionDate}</span>{' '}
          instead of scheduled{' '}
          <span className="font-semibold text-slate-900">{confirmDialog.scheduledDate}</span>.
          <br />
          Do you want to shift the next calibration dates based on this completion date?
        </p>
      </DialogBox>

      <DialogBox
        isOpen={frequencyDialog.isOpen}
        title="Change Frequency"
        onConfirm={handleSaveFrequency}
        onCancel={closeFrequencyDialog}
        confirmText="Save Frequency"
        cancelText="Cancel"
      >
        <label className="mt-3 flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium text-slate-800">New frequency (months)</span>
          <select
            value={frequencyDialog.value}
            onChange={handleFrequencyInput}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
          >
            <option value="" disabled>
              Select frequency
            </option>
            {availableFrequencies.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          {availableFrequencies.length === 0 && (
            <span className="text-xs text-slate-500">No higher frequencies available.</span>
          )}
        </label>
      </DialogBox>

      <DialogBox
        isOpen={editDateDialog.isOpen}
        title="Edit Due Date"
        onConfirm={handleSaveDueDate}
        onCancel={closeEditDueDate}
        confirmText="Save Date"
        cancelText="Cancel"
      >
        <label className="mt-3 flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium text-slate-800">New due date</span>
          <input
            type="date"
            value={editDateDialog.value}
            onChange={handleEditDueDateInput}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
          />
        </label>
      </DialogBox>

      <StakeholderModal
        isOpen={stakeholderModalOpen}
        initialData={stakeholderData}
        onSave={handleSaveStakeholders}
        onClose={() => setStakeholderModalOpen(false)}
        availableUsers={availableUsers}
      />
    </main>
  )
}

export default ScheduleCalibration
