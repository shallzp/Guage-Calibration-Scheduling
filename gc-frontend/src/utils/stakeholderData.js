const STORAGE_KEY = 'gaugeStakeholders'

export function getStakeholders(gaugeKey) {
    try {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
        return all[gaugeKey] || { operators: [], supervisors: [] }
    } catch {
        return { operators: [], supervisors: [] }
    }
}

export function saveStakeholders(gaugeKey, stakeholders) {
    try {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
        all[gaugeKey] = stakeholders
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    } catch {
        // ignore write errors
    }
}
