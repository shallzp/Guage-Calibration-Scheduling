import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import GaugeScheduleTable from '../features/gauge/GaugeScheduleTable'
import DialogBox from '../components/DialogBox'
import StakeholderModal from '../features/gauge/StakeholderModal'

import { addMonthsClamped, formatDate, inputDateToDisplayDate, parseDate, toInputDate } from '../utils/dateUtils'
import { getStakeholders, saveStakeholders } from '../utils/stakeholderData'
import { STATUS, appendNextScheduleDate, applyOverdueRule, getCurrentDueDate, getLastCompletionDateFromSchedule, } from '../utils/gaugeData'
import { apiFetch } from '../utils/api'

const initialDialogState = {
  isOpen: false,
  gaugeKey: '',
  rowIndex: null,
  completionDate: '',
  scheduledDate: '',
}

const initialFrequencyDialog = {
  isOpen: false,
  value: '',
}

const initialEditDateDialog = {
  isOpen: false,
  rowIndex: null,
  value: '',
}

function ScheduleCalibration({ gauges, setGauges }) {
  const navigate = useNavigate()
  const { gaugeKey: gaugeKeyParam } = useParams()
  const routeGaugeKey = gaugeKeyParam ? decodeURIComponent(gaugeKeyParam) : ''

  const [confirmDialog, setConfirmDialog] = useState(initialDialogState)
  const [frequencyDialog, setFrequencyDialog] = useState(initialFrequencyDialog)
  const [editDateDialog, setEditDateDialog] = useState(initialEditDateDialog)
  const [stakeholderModalOpen, setStakeholderModalOpen] = useState(false)
  const [stakeholderData, setStakeholderData] = useState({ operators: [], supervisors: [] })
  const [availableUsers, setAvailableUsers] = useState([])
  const [slaConfig, setSlaConfig] = useState(null)

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
        setStakeholderData(getStakeholders(routeGaugeKey))
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
      saveStakeholders(routeGaugeKey, normalized)
    } catch {
      saveStakeholders(routeGaugeKey, data)
      setStakeholderData(data)
    } finally {
      setStakeholderModalOpen(false)
    }
  }

  const handleBackToList = () => {
    navigate('/gauge-calibration/gauge-data')
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

        const baseIndex = gauge.schedule.findIndex((row) => row.status !== STATUS.COMPLETED)
        if (baseIndex === -1) {
          return {
            ...gauge,
            frequency: nextFrequency,
          }
        }

        // Use the last completed row's due date as the base, or the first non-completed row's date
        const lastCompletedIndex = baseIndex - 1
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

        const schedule = applyOverdueRule(updatedRows)

        return {
          ...gauge,
          frequency: nextFrequency,
          schedule,
          dueDate: getCurrentDueDate(schedule, gauge.dueDate),
          lastCompletionDate: getLastCompletionDateFromSchedule(schedule, gauge.lastCompletionDate),
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
      .then((res) => {
        if (!res.ok) console.error('Update frequency failed:', res.status, res.statusText)
      })
      .catch((err) => console.error('Update frequency network error:', err))

    // Persist each shifted due date to MongoDB
    for (const { scheduleId, dueDate } of shiftedRows) {
      if (!scheduleId) continue
      apiFetch(
        `/api/gauges/${encodeURIComponent(selectedGauge.key)}/schedule/${scheduleId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ due_date: dueDate }),
        },
      )
        .then((res) => {
          if (!res.ok) console.error(`Freq shift failed for schedule ${scheduleId}:`, res.status)
        })
        .catch((err) => console.error(`Freq shift error for schedule ${scheduleId}:`, err))
    }
  }

  const handleAddSchedule = () => {
    if (!selectedGauge) return

    setGauges((previous) =>
      previous.map((gauge) => {
        if (gauge.key !== selectedGauge.key) return gauge

        const updatedRows = appendNextScheduleDate(gauge.schedule, gauge.frequency)
        const schedule = applyOverdueRule(updatedRows)

        return {
          ...gauge,
          schedule,
          dueDate: getCurrentDueDate(schedule, gauge.dueDate),
          lastCompletionDate: getLastCompletionDateFromSchedule(schedule, gauge.lastCompletionDate),
        }
      }),
    )

    // Persist to MongoDB in the background
    apiFetch(`/api/gauges/${encodeURIComponent(selectedGauge.key)}/schedule`, {
      method: 'POST',
    })
      .then((res) => {
        if (!res.ok) console.error('Add schedule failed:', res.status, res.statusText)
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
    const shiftedRows = []

    setGauges((previous) =>
      previous.map((gauge) => {
        if (gauge.key !== selectedGauge.key) return gauge

        const newBaseDate = parseDate(nextDate)

        const updatedRows = gauge.schedule.map((row, index) => {
          if (index < rowIndex) return row
          if (index === rowIndex) {
            shiftedRows.push({ scheduleId: row.id, dueDate: nextDate })
            return { ...row, dueDate: nextDate }
          }
          // Shift all future rows based on the new date + frequency
          if (newBaseDate) {
            const shiftedDate = addMonthsClamped(newBaseDate, gauge.frequency * (index - rowIndex))
            const newDueDate = formatDate(shiftedDate)
            shiftedRows.push({ scheduleId: row.id, dueDate: newDueDate })
            return { ...row, dueDate: newDueDate }
          }
          return row
        })

        const schedule = applyOverdueRule(updatedRows)

        return {
          ...gauge,
          schedule,
          dueDate: getCurrentDueDate(schedule, gauge.dueDate),
          lastCompletionDate: getLastCompletionDateFromSchedule(schedule, gauge.lastCompletionDate),
        }
      }),
    )

    closeEditDueDate()

    // Persist all shifted rows to MongoDB in the background
    for (const { scheduleId, dueDate } of shiftedRows) {
      if (!scheduleId) continue
      apiFetch(
        `/api/gauges/${encodeURIComponent(selectedGauge.key)}/schedule/${scheduleId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ due_date: dueDate }),
        },
      )
        .then((res) => {
          if (!res.ok) console.error(`Update due date failed for schedule ${scheduleId}:`, res.status)
        })
        .catch((err) => console.error(`Update due date error for schedule ${scheduleId}:`, err))
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

        const schedule = applyOverdueRule(updatedRows)
        const nextDueDate = schedule[rowIndex + 1]?.dueDate || getCurrentDueDate(schedule, gauge.dueDate)
        const lastCompletionDate =
          nextStatus === STATUS.COMPLETED
            ? schedule[rowIndex]?.completionDate || gauge.lastCompletionDate
            : getLastCompletionDateFromSchedule(schedule, gauge.lastCompletionDate)

        return {
          ...gauge,
          schedule,
          dueDate: nextDueDate,
          lastCompletionDate,
        }
      }),
    )

    if (shouldShowConfirm) {
      setConfirmDialog(confirmData)
    }

    // Persist to MongoDB in the background
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
        .then((res) => {
          if (!res.ok) console.error('Update status failed:', res.status, res.statusText)
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

    // Collect shifted rows for API persistence
    const shiftedRows = []

    setGauges((previous) =>
      previous.map((gauge) => {
        if (gauge.key !== gaugeKey) return gauge

        const completionBaseDate = parseDate(completionDate)
        if (!completionBaseDate) return gauge

        const updatedRows = gauge.schedule.map((row, index) => {
          if (index <= rowIndex) return row
          const shiftedDate = addMonthsClamped(completionBaseDate, gauge.frequency * (index - rowIndex))
          const newDueDate = formatDate(shiftedDate)
          shiftedRows.push({ scheduleId: row.id, dueDate: newDueDate })
          return { ...row, dueDate: newDueDate }
        })

        const schedule = applyOverdueRule(updatedRows)
        const nextDueDate = schedule[rowIndex + 1]?.dueDate || getCurrentDueDate(schedule, gauge.dueDate)
        return {
          ...gauge,
          schedule,
          dueDate: nextDueDate,
          lastCompletionDate: schedule[rowIndex]?.completionDate || gauge.lastCompletionDate,
        }
      }),
    )

    closeDialog()

    // Persist each shifted row to MongoDB in the background
    for (const { scheduleId, dueDate } of shiftedRows) {
      if (!scheduleId) continue
      apiFetch(
        `/api/gauges/${encodeURIComponent(gaugeKey)}/schedule/${scheduleId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ due_date: dueDate }),
        },
      )
        .then((res) => {
          if (!res.ok) console.error(`Shift date failed for schedule ${scheduleId}:`, res.status)
        })
        .catch((err) => console.error(`Shift date error for schedule ${scheduleId}:`, err))
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
