// Single source of truth for the Node backend base URL.
// All API calls in the frontend must import from here instead of
// reading import.meta.env.VITE_API_BASE_URL directly.
export const API_BASE_URL = 'http://localhost:5000' //import.meta.env.VITE_API_BASE_URL

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
