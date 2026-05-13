// Single source of truth for all backend base URLs.
// All API calls in the frontend must import from here instead of
// using hardcoded URLs directly.
export const API_BASE_URL = 'http://localhost:5000' //import.meta.env.VITE_API_BASE_URL
export const ML_BASE_URL  = 'http://localhost:8000'

/**
 * Thin wrapper around fetch that prepends the Node backend base URL.
 *
 * @param {string} path   - Path starting with '/', e.g. '/api/gauges'
 * @param {RequestInit} [options] - Standard fetch options
 * @returns {Promise<Response>}
 */
export function apiFetch(path, options) {
  return fetch(`${API_BASE_URL}${path}`, options)
}

/**
 * Thin wrapper around fetch that prepends the ML service base URL.
 *
 * @param {string} path   - Path starting with '/', e.g. '/api/train'
 * @param {RequestInit} [options] - Standard fetch options
 * @returns {Promise<Response>}
 */
export function mlFetch(path, options) {
  return fetch(`${ML_BASE_URL}${path}`, options)
}
