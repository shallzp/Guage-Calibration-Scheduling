import { useState, useEffect, useRef } from 'react'
import { X, Plus, Search } from 'lucide-react'

function getUserKey(user) {
  return user?.user_id || user?._id || user?.email || user?.name || ''
}

function UserSearch({ onSelect, excludeUserKeys, availableUsers }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const handleOutside = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const filtered = availableUsers.filter((u) => {
    if (excludeUserKeys.has(getUserKey(u))) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return String(u?.name || '').toLowerCase().includes(q) || String(u?.email || '').toLowerCase().includes(q)
  })

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-teal-600 focus-within:ring-1 focus-within:ring-teal-600">
        <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search by name or email..."
          className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-40 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {filtered.map((user) => (
            <li key={getUserKey(user)}>
              <button
                type="button"
                onClick={() => { onSelect(user); setQuery(''); setOpen(false) }}
                className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100"
              >
                <span className="font-medium text-slate-800">{user.name}</span>
                <span className="text-xs text-slate-500">{user.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && query.trim() && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-center text-sm text-slate-500 shadow-lg">
          No matching users found
        </div>
      )}
    </div>
  )
}

function StakeholderSection({ title, description, users, onAdd, onRemove, availableUsers }) {
  const [adding, setAdding] = useState(false)
  const excludeUserKeys = new Set(users.map((u) => getUserKey(u)))

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-teal-800">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3">
          <UserSearch
            excludeUserKeys={excludeUserKeys}
            availableUsers={availableUsers}
            onSelect={(user) => { onAdd(user); setAdding(false) }}
          />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-1.5 text-xs text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      )}

      {users.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-center text-xs text-slate-400">
          No {title.toLowerCase()} added yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2 text-center w-16">Remove</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={getUserKey(user)} className="border-t border-slate-200 text-slate-700">
                  <td className="px-4 py-2 font-medium">{user.name}</td>
                  <td className="px-4 py-2 text-slate-500">{user.email}</td>
                  <td className="px-4 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => onRemove(getUserKey(user))}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${user.name}`}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function StakeholderModal({ isOpen, initialData, onSave, onClose, availableUsers = [] }) {
  const [operators, setOperators] = useState([])
  const [supervisors, setSupervisors] = useState([])

  useEffect(() => {
    if (isOpen) {
      setOperators(initialData?.operators || [])
      setSupervisors(initialData?.supervisors || [])
    }
  }, [isOpen, initialData])

  if (!isOpen) return null

  const handleAddOperator = (user) => {
    setOperators((prev) => {
      if (prev.some((u) => getUserKey(u) === getUserKey(user))) return prev
      return [...prev, user]
    })
  }

  const handleRemoveOperator = (userKey) => {
    setOperators((prev) => prev.filter((u) => getUserKey(u) !== userKey))
  }

  const handleAddSupervisor = (user) => {
    setSupervisors((prev) => {
      if (prev.some((u) => getUserKey(u) === getUserKey(user))) return prev
      return [...prev, user]
    })
  }

  const handleRemoveSupervisor = (userKey) => {
    setSupervisors((prev) => prev.filter((u) => getUserKey(u) !== userKey))
  }

  const handleSave = () => {
    onSave({ operators, supervisors })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-white/70 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="display-font text-xl font-semibold text-slate-900">Edit Stakeholders</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <StakeholderSection
            title="Operators"
            description="Users who can modify schedules, change status, and update completion dates."
            users={operators}
            onAdd={handleAddOperator}
            onRemove={handleRemoveOperator}
            availableUsers={availableUsers}
          />
          <StakeholderSection
            title="Supervisors"
            description="Users who monitor schedules, receive escalation emails, and track compliance."
            users={supervisors}
            onAdd={handleAddSupervisor}
            onRemove={handleRemoveSupervisor}
            availableUsers={availableUsers}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

export default StakeholderModal
