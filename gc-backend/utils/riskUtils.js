// Utility functions for computing risk summaries from gauge documents.


// Risk summary


/**
 * Computes risk level counts and percentages from an array of gauge documents.
 * Each document should have the shape: { latest_prediction: { risk_level: string } }
 *
 * @param {Array<{ latest_prediction?: { risk_level?: string } }>} gauges
 * @returns {{ total: number, high: number, medium: number, low: number,
 *             high_percentage: number, medium_percentage: number, low_percentage: number }}
 */
function computeRiskSummary(gauges) {
  const summary = { total: 0, high: 0, medium: 0, low: 0 };

  for (const gauge of gauges) {
    summary.total += 1;
    const riskLevel = String((gauge.latest_prediction || {}).risk_level || '')
      .trim()
      .toLowerCase();
    if (riskLevel === 'high' || riskLevel === 'medium' || riskLevel === 'low') {
      summary[riskLevel] += 1;
    }
  }

  for (const level of ['high', 'medium', 'low']) {
    summary[`${level}_percentage`] =
      summary.total > 0
        ? parseFloat(((summary[level] / summary.total) * 100).toFixed(2))
        : 0;
  }

  return summary;
}

module.exports = { computeRiskSummary };
