import { parseDate, parseDayMonthYear } from './dateUtils'

function toDisplayValue(value, fallback = 'Not Available') {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text ? text : fallback
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeCampaignRow(row, index) {
  const { year, month } = parseDayMonthYear(row['Start Date'])

  return {
    id: `${toDisplayValue(row['Chasis Number'], 'NA')}-${index}`,
    campaignStatus: toDisplayValue(row['Campaign Status']),
    region: toDisplayValue(row['Assigned Region'] || row.Region),
    areaOffice: toDisplayValue(row['Assigned Area Office']),
    companyCode: toDisplayValue(row['Company Code']),
    plantCode: toDisplayValue(row['Plant Code']),
    campaignType: toDisplayValue(row['Campaign Type'] || row['Campaign Short Desc']),
    campaignDesc: toDisplayValue(row['Campaign description']),
    chassisNo: toDisplayValue(row['Chasis Number']),
    year: toDisplayValue(year),
    month: toDisplayValue(month),
    dealerCode: toDisplayValue(row['Assigned Dealer Code'] || row['Selling Dealer Code'] || row['Dealer Code']),
    dealerName: toDisplayValue(row['Assigned Dealer Name'] || row['Selling Dealer Name'] || row.Dealer),
    recallNumber: toDisplayValue(row['Recall Number']),
    externalNumber: toDisplayValue(row['External Number']),
    startDate: toDisplayValue(row['Start Date']),
    endDate: toDisplayValue(row['End Date']),
    u2h2: toDisplayValue(row.U2H2),
    partCode: toDisplayValue(row['Part L1'], ''),
    partDesc: toDisplayValue(row['Part Desc.'], ''),
    claimNumber: toDisplayValue(row['Claim Number'], ''),
    totalAmount: parseNumber(row['Total Amount']),
    raw: row,
  }
}

export function toSelectOptions(values, allLabel) {
  return [{ value: 'all', label: allLabel }, ...values.map((value) => ({ value, label: value }))]
}

function getStatusType(status) {
  const text = status.toLowerCase()
  if (text.includes('not availed')) return 'notAvailed'
  if (text.includes('availed') || text.includes('completed') || text.includes('closed')) return 'availed'
  return 'other'
}

function groupCampaignRows(rows, getKey, initExtra, processExtra) {
  const grouped = new Map()

  rows.forEach((row) => {
    const key = getKey(row)
    if (!grouped.has(key)) {
      grouped.set(key, {
        noOfVehiclesAssigned: 0,
        noOfVehiclesAttended: 0,
        _chassis: new Set(),
        _parts: new Set(),
        _lossAmount: 0,
        ...(initExtra ? initExtra(row) : {}),
      })
    }

    const current = grouped.get(key)
    current.noOfVehiclesAssigned += 1

    const statusType = getStatusType(row.campaignStatus)
    if (statusType === 'availed') current.noOfVehiclesAttended += 1
    if (statusType !== 'availed') current._lossAmount += row.totalAmount

    if (row.chassisNo && row.chassisNo !== 'Not Available') {
      current._chassis.add(row.chassisNo)
    }

    const partIdentifier = [row.partCode, row.partDesc].filter(Boolean).join(' | ')
    if (partIdentifier) current._parts.add(partIdentifier)

    if (processExtra) processExtra(current, row)
  })

  return grouped
}

function computeSummaryFields(group) {
  const pendingNo = Math.max(group.noOfVehiclesAssigned - group.noOfVehiclesAttended, 0)
  const completionPercent =
    group.noOfVehiclesAssigned > 0
      ? `${((group.noOfVehiclesAttended / group.noOfVehiclesAssigned) * 100).toFixed(1)}%`
      : '0%'
  const lossOpportunity = group._lossAmount > 0 ? group._lossAmount.toLocaleString('en-IN') : '-'
  return { pendingNo, completionPercent, lossOpportunity }
}

export function buildCampaignOverviewRows(rows) {
  const todayTime = Date.now()

  const grouped = groupCampaignRows(
    rows,
    (row) => {
      const campaignNo = row.recallNumber !== 'Not Available' ? row.recallNumber : row.externalNumber
      return [row.campaignType, row.startDate, row.endDate, row.campaignDesc, campaignNo].join('|')
    },
    (row) => {
      const campaignNo = row.recallNumber !== 'Not Available' ? row.recallNumber : row.externalNumber
      return {
        campaignType: row.campaignType,
        startDate: row.startDate,
        endDate: row.endDate,
        campaignDesc: row.campaignDesc,
        campaignNo,
        _u2h2Votes: [],
        _startTime: null,
      }
    },
    (current, row) => {
      if (row.u2h2 && row.u2h2 !== 'Not Available') {
        current._u2h2Votes.push(String(row.u2h2).toLowerCase())
      }
      const startDate = parseDate(row.startDate)
      if (startDate) {
        const startTime = startDate.getTime()
        if (current._startTime === null || startTime < current._startTime) {
          current._startTime = startTime
        }
      }
    },
  )

  return Array.from(grouped.values())
    .map((row) => {
      const { pendingNo, completionPercent, lossOpportunity } = computeSummaryFields(row)

      const campaignAge =
        row._startTime === null ? 'Not Available' : `${Math.max(0, Math.floor((todayTime - row._startTime) / 86400000))} days`

      const u2h2FromData = row._u2h2Votes.some((value) => value.includes('yes'))
      const u2h2 = u2h2FromData ? 'Yes' : row.noOfVehiclesAttended > 0 ? 'Yes' : 'No'

      return {
        label: row.campaignType,
        campaignType: row.campaignType,
        startDate: row.startDate,
        endDate: row.endDate,
        campaignDesc: row.campaignDesc,
        campaignNo: row.campaignNo,
        noOfVehiclesAssigned: row.noOfVehiclesAssigned,
        noOfVehiclesAttended: row.noOfVehiclesAttended,
        pendingNo,
        campaignAge,
        u2h2,
        completionPercent,
        partsOrdered: row._parts.size,
        qtyExecuted: row.noOfVehiclesAttended,
        grQty: row.noOfVehiclesAttended,
        detailsChassis: '-',
        detailsParts: '-',
        lossOpportunity,
      }
    })
    .sort((left, right) => right.noOfVehiclesAssigned - left.noOfVehiclesAssigned)
}

export function buildSummaryRows(rows, dispatchRows, getLabel, getDispatchLabel) {
  const grouped = groupCampaignRows(
    rows,
    getLabel,
    (row) => ({ label: getLabel(row), _orderQty: 0, _receiveQty: 0, _grQty: 0 }),
  )

  if (dispatchRows && getDispatchLabel) {
    dispatchRows.forEach((row) => {
      const rawLabel = getDispatchLabel(row)
      if (!rawLabel) return
      const label = toDisplayValue(rawLabel, 'Not Available')

      if (!grouped.has(label)) {
        grouped.set(label, {
          label,
          noOfVehiclesAssigned: 0,
          noOfVehiclesAttended: 0,
          _chassis: new Set(),
          _parts: new Set(),
          _lossAmount: 0,
          _orderQty: 0,
          _receiveQty: 0,
          _grQty: 0,
        })
      }

      const current = grouped.get(label)
      current._orderQty += Number(row['Order Quantity']) || 0
      current._receiveQty += Number(row['Original Receive Quantity']) || 0
      current._grQty += Number(row['GR Quantity']) || 0
    })
  }

  return Array.from(grouped.values())
    .map((row) => {
      const { pendingNo, completionPercent, lossOpportunity } = computeSummaryFields(row)

      return {
        label: row.label,
        noOfVehiclesAssigned: row.noOfVehiclesAssigned,
        noOfVehiclesAttended: row.noOfVehiclesAttended,
        pendingNo,
        completionPercent,
        partsOrdered: row._orderQty || 0,
        qtyExecuted: row._receiveQty || 0,
        grQty: row._grQty || 0,
        detailsChassis: '-',
        detailsParts: '-',
        lossOpportunity,
      }
    })
    .sort((left, right) => right.noOfVehiclesAssigned - left.noOfVehiclesAssigned)
}
