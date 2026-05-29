import { useState, useEffect } from 'react'

// The 6 configurable SLA fields — mirrors the backend SLA_FIELDS set
const SLA_FIELDS = [
  'reminderNotStartedHours',
  'reminderOverdueIntervalHours',
  'escalationNotStartedInitialHours',
  'escalationNotStartedIntervalHours',
  'escalationOverdueInitialHours',
  'escalationOverdueIntervalHours',
]

export function SLAConfigModal({ isOpen, initialConfig, onSave, onClose, errorMessage = '' }) {
    const [config, setConfig] = useState(initialConfig || {})

    useEffect(() => {
        setConfig(initialConfig || {})
    }, [initialConfig, isOpen])

    if (!isOpen || !config) return null

    const handleChange = (key, value) => {
        setConfig((prev) => ({
            ...prev,
            [key]: Number(value)
        }))
    }

    // only validate the 6 SLA numeric fields — ignore _id, version, timestamps etc.
    const hasInvalidValue = SLA_FIELDS.some((key) => {
        const value = Number(config[key])
        return !Number.isFinite(value) || value <= 0
    })

    const handleSubmit = (e) => {
        e.preventDefault()
        if (hasInvalidValue) return
        // send only the 6 SLA fields — strip any extra keys before calling onSave
        const payload = Object.fromEntries(SLA_FIELDS.map((key) => [key, config[key]]))
        onSave(payload)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/70 bg-white p-6 shadow-2xl">
                <h2 className="display-font mb-4 text-xl font-semibold text-slate-900">Set SLA Configuration</h2>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <section>
                        <h3 className="mb-2 text-sm font-semibold text-teal-800 uppercase tracking-widest">Reminder Emails</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <label className="flex flex-col text-sm text-slate-700">
                                <span className="mb-1">Not Started (Hours Before)</span>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                                    value={config.reminderNotStartedHours}
                                    onChange={(e) => handleChange('reminderNotStartedHours', e.target.value)}
                                />
                            </label>
                            <label className="flex flex-col text-sm text-slate-700">
                                <span className="mb-1">Overdue (Interval Hours)</span>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                                    value={config.reminderOverdueIntervalHours}
                                    onChange={(e) => handleChange('reminderOverdueIntervalHours', e.target.value)}
                                />
                            </label>
                        </div>
                    </section>

                    <section>
                        <h3 className="mb-2 text-sm font-semibold text-teal-800 uppercase tracking-widest">Escalation Emails</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <label className="flex flex-col text-sm text-slate-700">
                                <span className="mb-1">Not Started (Initial Delay Hours)</span>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                                    value={config.escalationNotStartedInitialHours}
                                    onChange={(e) => handleChange('escalationNotStartedInitialHours', e.target.value)}
                                />
                            </label>
                            <label className="flex flex-col text-sm text-slate-700">
                                <span className="mb-1">Not Started (Interval Hours)</span>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                                    value={config.escalationNotStartedIntervalHours}
                                    onChange={(e) => handleChange('escalationNotStartedIntervalHours', e.target.value)}
                                />
                            </label>
                            <label className="flex flex-col text-sm text-slate-700">
                                <span className="mb-1">Overdue (Initial Delay Hours)</span>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                                    value={config.escalationOverdueInitialHours}
                                    onChange={(e) => handleChange('escalationOverdueInitialHours', e.target.value)}
                                />
                            </label>
                            <label className="flex flex-col text-sm text-slate-700">
                                <span className="mb-1">Overdue (Interval Hours)</span>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                                    value={config.escalationOverdueIntervalHours}
                                    onChange={(e) => handleChange('escalationOverdueIntervalHours', e.target.value)}
                                />
                            </label>
                        </div>
                    </section>

                    {errorMessage ? (
                        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {errorMessage}
                        </p>
                    ) : null}

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={hasInvalidValue}
                            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                        >
                            Save Configuration
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default SLAConfigModal
