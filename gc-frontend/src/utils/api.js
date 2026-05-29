export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
export const ML_BASE_URL  = import.meta.env.VITE_ML_BASE_URL

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
