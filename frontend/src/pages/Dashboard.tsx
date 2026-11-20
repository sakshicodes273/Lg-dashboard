import { useEffect, useMemo, useState } from 'react'
import { Boxes, CalendarDays, CircleDollarSign, Gauge, HardDrive, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../services/api'
import type { DashboardAnalytics, UsageSummary, UsageTrendPoint } from '../types/analytics'

function toInputDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDefaultDateRange(): { startDate: string; endDate: string } {
  const today = new Date()
  return {
    startDate: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: toInputDate(today),
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatResourceType(resourceType: UsageSummary['resourceType']): string {
  return {
    compute: 'Compute',
    storage: 'Storage',
    api_requests: 'API requests',
    network: 'Network',
  }[resourceType]
}

function sumUsageByUnit(summary: UsageSummary[]): Array<{ unit: string; amount: number }> {
  const totals = new Map<string, number>()
  for (const item of summary) {
    totals.set(item.usageUnit, (totals.get(item.usageUnit) ?? 0) + item.totalUsage)
  }
  return Array.from(totals, ([unit, amount]) => ({ unit, amount }))
}

function sumSpendByCurrency(summary: UsageSummary[]): Array<{ currency: string; amount: number }> {
  const totals = new Map<string, number>()
  for (const item of summary) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.totalCost)
  }
  return Array.from(totals, ([currency, amount]) => ({ currency, amount }))
}

function getTrendForPeriod(data: DashboardAnalytics): UsageTrendPoint[] {
  const recordsByDate = new Map(data.usageTrend.map((point) => [point.date, point.records]))
  const start = new Date(`${data.period.startDate}T00:00:00.000Z`)
  const end = new Date(`${data.period.endDate}T00:00:00.000Z`)
  const points: UsageTrendPoint[] = []

  for (let day = start; day <= end; day = new Date(day.getTime() + 24 * 60 * 60 * 1000)) {
    const date = day.toISOString().slice(0, 10)
    points.push({ date, records: recordsByDate.get(date) ?? 0 })
  }
  return points
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00.000Z`))
}

export function Dashboard() {
  const [initialRange] = useState(getDefaultDateRange)
  const [startDate, setStartDate] = useState(initialRange.startDate)
  const [endDate, setEndDate] = useState(initialRange.endDate)
  const [refreshKey, setRefreshKey] = useState(0)
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ startDate, endDate })

    apiRequest<DashboardAnalytics>(`/dashboard?${params}`, { signal: controller.signal })
      .then(setAnalytics)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setAnalytics(null)
          setError(requestError instanceof Error ? requestError.message : 'Unable to load analytics')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [startDate, endDate, refreshKey])

  const usageTotals = useMemo(
    () => analytics ? sumUsageByUnit(analytics.resourceConsumption) : [],
    [analytics],
  )
  const spendTotals = useMemo(
    () => analytics ? sumSpendByCurrency(analytics.resourceConsumption) : [],
    [analytics],
  )
  const trend = useMemo(() => analytics ? getTrendForPeriod(analytics) : [], [analytics])
  const maxDailyRecords = Math.max(...trend.map((point) => point.records), 0)
  const costByCurrency = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of analytics?.resourceConsumption ?? []) {
      totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.totalCost)
    }
    return totals
  }, [analytics])

  function refresh() {
    setLoading(true)
    setError(null)
    setRefreshKey((current) => current + 1)
  }

  function updateStartDate(value: string) {
    if (!value) return
    setLoading(true)
    setError(null)
    setStartDate(value)
  }

  function updateEndDate(value: string) {
    if (!value) return
    setLoading(true)
    setError(null)
    setEndDate(value)
  }

  function usageValue(): string {
    if (!analytics) return '—'
    if (usageTotals.length === 0) return '0'
    if (usageTotals.length > 1) return 'Multiple units'
    return `${formatNumber(usageTotals[0].amount)} ${usageTotals[0].unit}`
  }

  function spendValue(): string {
    if (!analytics || spendTotals.length === 0) return '—'
    if (spendTotals.length > 1) return 'Multiple currencies'
    return formatCurrency(spendTotals[0].amount, spendTotals[0].currency)
  }

  const metricCards = [
    {
      label: 'Total usage',
      value: usageValue(),
      detail: usageTotals.length > 1
        ? usageTotals.map(({ unit, amount }) => `${formatNumber(amount)} ${unit}`).join(' · ')
        : 'Across the selected period',
      icon: HardDrive,
    },
    {
      label: 'Monthly spend',
      value: spendValue(),
      detail: spendTotals.length > 1
        ? spendTotals.map(({ currency, amount }) => formatCurrency(amount, currency)).join(' · ')
        : 'Usage cost for the selected period',
      icon: CircleDollarSign,
    },
    {
      label: 'Active resources',
      value: analytics ? formatNumber(analytics.activeResources) : '—',
      detail: 'Named resources with recorded usage',
      icon: Boxes,
    },
    {
      label: 'Resource utilization',
      value: analytics?.utilizationPercent === null || !analytics ? 'Not tracked' : `${formatNumber(analytics.utilizationPercent)}%`,
      detail: 'Capacity telemetry is not available',
      icon: Gauge,
    },
  ]

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-label">ORGANIZATION ANALYTICS</span>
          <h1>Overview</h1>
          <p>Usage and spend for your organization.</p>
        </div>
        <div className="heading-actions">
          <button className="quiet-button" type="button" onClick={refresh} disabled={loading} title="Refresh analytics">
            <RefreshCw size={15} /> Refresh
          </button>
          <Link className="export-button dashboard-billing-link" to="/billing">Billing ledger</Link>
        </div>
      </div>

      <section className="analytics-toolbar" aria-label="Analytics date range">
        <div className="analytics-toolbar-title"><CalendarDays size={16} /><span>Date range</span></div>
        <div className="analytics-filters">
          <label>
            <span>From</span>
            <input
              aria-label="Analytics start date"
              type="date"
              value={startDate}
              max={endDate}
              onChange={(event) => updateStartDate(event.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              aria-label="Analytics end date"
              type="date"
              value={endDate}
              min={startDate}
              max={initialRange.endDate}
              onChange={(event) => updateEndDate(event.target.value)}
            />
          </label>
        </div>
      </section>

      {error && (
        <div className="analytics-state analytics-error" role="alert">
          <strong>Couldn&apos;t load analytics</strong>
          <span>{error}</span>
          <button type="button" onClick={refresh}>Try again</button>
        </div>
      )}

      {!error && (
        <>
          <section className="metric-grid" aria-label="Usage summary" aria-busy={loading}>
            {metricCards.map(({ label, value, detail, icon: Icon }) => (
              <article className="metric-card" key={label}>
                <div className="metric-card-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div>
                <strong className="metric-value">{loading ? 'Loading…' : value}</strong>
                <div className="metric-foot">{detail}</div>
              </article>
            ))}
          </section>

          <section className="charts-grid">
            <article className="chart-panel usage-panel" aria-busy={loading}>
              <div className="panel-heading">
                <div><span className="panel-kicker">DAILY ACTIVITY</span><h2>Usage overview</h2></div>
                <span className="chart-caption">Usage records per day</span>
              </div>
              {loading ? (
                <div className="analytics-state" role="status"><span className="loader" /> Loading usage trend…</div>
              ) : analytics?.usageTrend.length === 0 ? (
                <div className="analytics-state analytics-empty">No usage records for this date range.</div>
              ) : (
                <div className="usage-chart" role="img" aria-label="Daily usage records over the selected period">
                  <div className="chart-y-labels"><span>{maxDailyRecords}</span><span>{Math.ceil(maxDailyRecords / 2)}</span><span>0</span></div>
                  <div className="chart-plot">
                    <div className="chart-grid-lines"><i /><i /><i /></div>
                    <div className="bar-chart" style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(0, 1fr))` }}>
                      {trend.map((point) => {
                        const height = maxDailyRecords === 0 ? 0 : (point.records / maxDailyRecords) * 100
                        const dayOfMonth = Number(point.date.slice(-2))
                        return (
                          <div className="bar-column" key={point.date} title={`${displayDate(point.date)}: ${point.records} records`}>
                            <span style={{ height: `${height}%` }} />
                            {(dayOfMonth === 1 || dayOfMonth % 7 === 0) && <small>{dayOfMonth}</small>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
              {!loading && analytics && analytics.usageTrend.length > 0 && (
                <div className="chart-legend">
                  <span><i className="legend-dot legend-cyan" /> Usage records</span>
                  <span className="chart-total">{trend.reduce((total, point) => total + point.records, 0)} <small>in period</small></span>
                </div>
              )}
            </article>

            <article className="chart-panel resource-panel" id="resources" aria-busy={loading}>
              <div className="panel-heading">
                <div><span className="panel-kicker">BY RESOURCE TYPE</span><h2>Resource consumption</h2></div>
              </div>
              {loading ? (
                <div className="analytics-state" role="status"><span className="loader" /> Loading resource data…</div>
              ) : analytics?.resourceConsumption.length === 0 ? (
                <div className="analytics-state analytics-empty">No resource consumption recorded for this date range.</div>
              ) : (
                <div className="resource-list">
                  {analytics?.resourceConsumption.map((item) => {
                    const currencyTotal = costByCurrency.get(item.currency) ?? 0
                    const percentage = currencyTotal === 0 ? 0 : (item.totalCost / currencyTotal) * 100
                    return (
                      <div className="resource-row" key={`${item.resourceType}-${item.usageUnit}-${item.currency}`}>
                        <div className="resource-row-heading">
                          <span>{formatResourceType(item.resourceType)} <small>· {item.usageUnit}</small></span>
                          <span>{formatNumber(item.totalUsage)} {item.usageUnit}</span>
                        </div>
                        <div className="resource-row-cost">
                          <span>{formatCurrency(item.totalCost, item.currency)}</span>
                          <small>{Math.round(percentage)}% of {item.currency} spend</small>
                        </div>
                        <b><i style={{ width: `${percentage}%` }} /></b>
                      </div>
                    )
                  })}
                </div>
              )}
            </article>
          </section>
          <div className="dashboard-footer-note">
            {analytics?.utilizationPercent === null && <span><Gauge size={14} /> Utilization is unavailable until capacity data is configured.</span>}
            <Link to="/billing">View billing ledger</Link>
          </div>
        </>
      )}
    </>
  )
}
