import SummaryTable from './SummaryTable'

function CampaignOverview({ campaignOverviewRows, clearFilterTrigger, onSortChange }) {
    const extraColumns = [
        { header: 'Start Date', key: 'startDate' },
        { header: 'End Date', key: 'endDate' },
        { header: 'Campaign Desc', key: 'campaignDesc' },
        { header: 'Campaign No', key: 'campaignNo' },
        { header: 'Campaign Age', key: 'campaignAge' },
        { header: 'U2H2 (Yes/No)', key: 'u2h2' },
    ]

    return (
        <div className="mt-5 space-y-5">
            <SummaryTable
                title="Campaign Overview Records"
                firstColumnLabel="Campaign Type"
                extraColumns={extraColumns}
                rows={campaignOverviewRows}
                clearFilterTrigger={clearFilterTrigger}
                onSortChange={onSortChange}
            />
        </div>
    )
}

export default CampaignOverview
