import { useEffect, useMemo, useState } from 'react'
import { Boxes, CalendarDays, CircleDollarSign, Gauge, HardDrive, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiRequest } from '../services/api'
import type { DashboardAnalytics, UsageSummary } from '../types/analytics'

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

function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00.000Z`))
}

function usageSeriesKey(resourceType: UsageSummary['resourceType'], usageUnit: string): string {
  return `${resourceType}|${usageUnit}`
}

function buildUsageChartData(
  data: DashboardAnalytics,
  selectedSeries: string,
): Array<{ date: string; usage: number; records: number }> {
  const values = new Map<string, number>()
  const records = new Map(data.usageTrend.map((point) => [point.date, point.records]))
  for (const point of data.usageOverTime) {
    if (usageSeriesKey(point.resourceType, point.usageUnit) === selectedSeries) {
      values.set(point.date, (values.get(point.date) ?? 0) + point.totalUsage)
    }
  }

  const points: Array<{ date: string; usage: number; records: number }> = []
  const start = new Date(`${data.period.startDate}T00:00:00.000Z`)
  const end = new Date(`${data.period.endDate}T00:00:00.000Z`)
  for (let day = start; day <= end; day = new Date(day.getTime() + 24 * 60 * 60 * 1000)) {
    const date = day.toISOString().slice(0, 10)
    points.push({ date, usage: values.get(date) ?? 0, records: records.get(date) ?? 0 })
  }
  return points
}

function buildSpendingChartData(
  data: DashboardAnalytics,
  currency: string,
): Array<{ date: string; spend: number }> {
  const values = new Map<string, number>()
  for (const point of data.spendingTrend) {
    if (point.currency === currency) {
      values.set(point.date, (values.get(point.date) ?? 0) + point.totalCost)
    }
  }

  const points: Array<{ date: string; spend: number }> = []
  const start = new Date(`${data.period.startDate}T00:00:00.000Z`)
  const end = new Date(`${data.period.endDate}T00:00:00.000Z`)
  for (let day = start; day <= end; day = new Date(day.getTime() + 24 * 60 * 60 * 1000)) {
    const date = day.toISOString().slice(0, 10)
    points.push({ date, spend: values.get(date) ?? 0 })
  }
  return points
}

export function Dashboard() {
  const [initialRange] = useState(getDefaultDateRange)
  const [startDate, setStartDate] = useState(initialRange.startDate)
  const [endDate, setEndDate] = useState(initialRange.endDate)
  const [refreshKey, setRefreshKey] = useState(0)
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usageSeries, setUsageSeries] = useState('')
  const [spendingCurrency, setSpendingCurrency] = useState('')

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
  const costByCurrency = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of analytics?.resourceConsumption ?? []) {
      totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.totalCost)
    }
    return totals
  }, [analytics])
  const usageSeriesOptions = useMemo(() => {
    const options = new Map<string, { key: string; label: string }>()
    for (const point of analytics?.usageOverTime ?? []) {
      const key = usageSeriesKey(point.resourceType, point.usageUnit)
      options.set(key, { key, label: `${formatResourceType(point.resourceType)} · ${point.usageUnit}` })
    }
    return Array.from(options.values())
  }, [analytics])
  const spendingCurrencies = useMemo(
    () => Array.from(new Set(analytics?.spendingTrend.map((point) => point.currency) ?? [])),
    [analytics],
  )

  useEffect(() => {
    if (usageSeriesOptions.length > 0 && !usageSeriesOptions.some((option) => option.key === usageSeries)) {
      setUsageSeries(usageSeriesOptions[0].key)
    }
  }, [usageSeriesOptions, usageSeries])
  useEffect(() => {
    if (spendingCurrencies.length > 0 && !spendingCurrencies.includes(spendingCurrency)) {
      setSpendingCurrency(spendingCurrencies[0])
    }
  }, [spendingCurrencies, spendingCurrency])

  const effectiveUsageSeries = usageSeriesOptions.some((option) => option.key === usageSeries)
    ? usageSeries
    : usageSeriesOptions[0]?.key ?? ''
  const effectiveSpendingCurrency = spendingCurrencies.includes(spendingCurrency)
    ? spendingCurrency
    : spendingCurrencies[0] ?? ''
  const usageChartData = useMemo(
    () => analytics ? buildUsageChartData(analytics, effectiveUsageSeries) : [],
    [analytics, effectiveUsageSeries],
  )
  const spendingChartData = useMemo(
    () => analytics ? buildSpendingChartData(analytics, effectiveSpendingCurrency) : [],
    [analytics, effectiveSpendingCurrency],
  )
  const resourceDistribution = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of analytics?.resourceConsumption ?? []) {
      if (item.currency === effectiveSpendingCurrency) {
        totals.set(item.resourceType, (totals.get(item.resourceType) ?? 0) + item.totalCost)
      }
    }
    return Array.from(totals, ([resourceType, value]) => ({
      name: formatResourceType(resourceType as UsageSummary['resourceType']),
      value,
    }))
  }, [analytics, effectiveSpendingCurrency])

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
                {usageSeriesOptions.length > 0 && (
                  <select
                    className="chart-select"
                    aria-label="Usage chart series"
                    value={effectiveUsageSeries}
                    onChange={(event) => setUsageSeries(event.target.value)}
                  >
                    {usageSeriesOptions.map((option) => (
                      <option value={option.key} key={option.key}>{option.label}</option>
                    ))}
                  </select>
                )}
              </div>
              {loading ? (
                <div className="analytics-state" role="status"><span className="loader" /> Loading usage trend…</div>
              ) : !analytics || analytics.usageOverTime.length === 0 ? (
                <div className="analytics-state analytics-empty">No usage records for this date range.</div>
              ) : (
                <div className="interactive-chart" role="img" aria-label="Daily usage over the selected period">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={usageChartData} margin={{ top: 12, right: 8, bottom: 4, left: -16 }}>
                      <CartesianGrid stroke="rgba(149, 183, 199, .09)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={displayDate} tick={{ fill: '#637c88', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tick={{ fill: '#637c88', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#102333', border: '1px solid rgba(149, 183, 199, .18)', borderRadius: 5, fontSize: 10 }}
                        labelFormatter={(label) => displayDate(String(label))}
                        formatter={(value) => [formatNumber(Number(value)), 'Usage']}
                      />
                      <Line type="monotone" dataKey="usage" stroke="#51d7d1" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#51d7d1', stroke: '#0c1b29', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {!loading && analytics && analytics.usageOverTime.length > 0 && (
                <div className="chart-legend">
                  <span><i className="legend-dot legend-cyan" /> Consumption</span>
                  <span className="chart-total">{usageChartData.reduce((total, point) => total + point.usage, 0) ? formatNumber(usageChartData.reduce((total, point) => total + point.usage, 0)) : '0'} <small>in period</small></span>
                </div>
              )}
            </article>

            <article className="chart-panel resource-panel" id="resources" aria-busy={loading}>
              <div className="panel-heading">
                <div><span className="panel-kicker">BY RESOURCE TYPE</span><h2>Resource consumption</h2></div>
                {costByCurrency.size > 0 && <span className="chart-caption">Cost by resource</span>}
              </div>
              {loading ? (
                <div className="analytics-state" role="status"><span className="loader" /> Loading resource data…</div>
              ) : analytics?.resourceConsumption.length === 0 ? (
                <div className="analytics-state analytics-empty">No resource consumption recorded for this date range.</div>
              ) : (
                <div className="interactive-chart resource-bar-chart" role="img" aria-label="Resource consumption cost comparison">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(analytics?.resourceConsumption ?? []).map((item) => ({
                        name: `${formatResourceType(item.resourceType)} · ${item.usageUnit}`,
                        cost: item.totalCost,
                        currency: item.currency,
                      }))}
                      layout="vertical"
                      margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
                    >
                      <CartesianGrid stroke="rgba(149, 183, 199, .09)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#637c88', fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={105} tick={{ fill: '#9ab0b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#102333', border: '1px solid rgba(149, 183, 199, .18)', borderRadius: 5, fontSize: 10 }}
                        formatter={(value, _name, props) => [
                          formatCurrency(Number(value), props.payload.currency),
                          'Cost',
                        ]}
                      />
                      <Bar dataKey="cost" fill="#62a9ed" radius={[0, 4, 4, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="chart-panel spending-panel" aria-busy={loading}>
              <div className="panel-heading">
                <div><span className="panel-kicker">DAILY SPEND</span><h2>Spending trend</h2></div>
                {spendingCurrencies.length > 0 && (
                  <select
                    className="chart-select"
                    aria-label="Spending chart currency"
                    value={effectiveSpendingCurrency}
                    onChange={(event) => setSpendingCurrency(event.target.value)}
                  >
                    {spendingCurrencies.map((currency) => <option value={currency} key={currency}>{currency}</option>)}
                  </select>
                )}
              </div>
              {loading ? (
                <div className="analytics-state" role="status"><span className="loader" /> Loading spending trend…</div>
              ) : spendingCurrencies.length === 0 ? (
                <div className="analytics-state analytics-empty">No successful billing transactions for this date range.</div>
              ) : (
                <div className="interactive-chart" role="img" aria-label="Successful billing spending over the selected period">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={spendingChartData} margin={{ top: 12, right: 8, bottom: 4, left: -16 }}>
                      <defs>
                        <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#62a9ed" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#62a9ed" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(149, 183, 199, .09)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={displayDate} tick={{ fill: '#637c88', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tick={{ fill: '#637c88', fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#102333', border: '1px solid rgba(149, 183, 199, .18)', borderRadius: 5, fontSize: 10 }}
                        labelFormatter={(label) => displayDate(String(label))}
                        formatter={(value) => [formatCurrency(Number(value), effectiveSpendingCurrency), 'Spend']}
                      />
                      <Area type="monotone" dataKey="spend" stroke="#62a9ed" strokeWidth={2} fill="url(#spendFill)" activeDot={{ r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="chart-panel distribution-panel" aria-busy={loading}>
              <div className="panel-heading">
                <div><span className="panel-kicker">COST SHARE</span><h2>Resource distribution</h2></div>
                {effectiveSpendingCurrency && <span className="chart-caption">{effectiveSpendingCurrency}</span>}
              </div>
              {loading ? (
                <div className="analytics-state" role="status"><span className="loader" /> Loading distribution…</div>
              ) : resourceDistribution.length === 0 ? (
                <div className="analytics-state analytics-empty">No resource cost to distribute.</div>
              ) : (
                <div className="interactive-chart distribution-chart" role="img" aria-label="Resource cost distribution">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={resourceDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="52%"
                        outerRadius="78%"
                        paddingAngle={3}
                        stroke="rgba(7, 19, 31, .8)"
                        strokeWidth={2}
                      >
                        {resourceDistribution.map((_entry, index) => (
                          <Cell key={resourceDistribution[index].name} fill={['#51d7d1', '#62a9ed', '#8bd1a2', '#d9b375'][index % 4]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#102333', border: '1px solid rgba(149, 183, 199, .18)', borderRadius: 5, fontSize: 10 }}
                        formatter={(value) => formatCurrency(Number(value), effectiveSpendingCurrency)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              {!loading && resourceDistribution.length > 0 && (
                <div className="distribution-legend">
                  {resourceDistribution.map((item, index) => (
                    <span key={item.name}><i style={{ background: ['#51d7d1', '#62a9ed', '#8bd1a2', '#d9b375'][index % 4] }} />{item.name}</span>
                  ))}
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
