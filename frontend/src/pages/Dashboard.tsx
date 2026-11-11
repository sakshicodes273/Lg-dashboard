import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Boxes, CircleDollarSign, Download, Gauge, HardDrive, RefreshCw, ShieldCheck } from 'lucide-react'
import { apiRequest } from '../services/api'
import type { DashboardMetrics } from '../types/auth'

const fallbackMetrics: DashboardMetrics = {
  totalUsage: { value: '2.84 TB', change: '+12.8%' },
  monthlySpend: { value: '$12,840', change: '+4.2%' },
  activeResources: { value: '128', change: '+8 this month' },
  utilization: { value: '76%', change: 'Within target' },
}

const spendBars = [36, 48, 41, 58, 52, 69, 61, 77, 65, 87, 72, 94]
const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function Dashboard({ activeView = 'overview' }: { activeView?: 'overview' | 'billing' }) {
  const [metrics, setMetrics] = useState(fallbackMetrics)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiRequest<{ metrics: DashboardMetrics }>('/dashboard')
      .then((result) => setMetrics(result.metrics))
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  const cards = [
    { label: 'Total usage', metric: metrics.totalUsage, icon: HardDrive, note: 'Across all services', positive: true },
    { label: 'Monthly spend', metric: metrics.monthlySpend, icon: CircleDollarSign, note: 'Compared to last month', positive: false },
    { label: 'Active resources', metric: metrics.activeResources, icon: Boxes, note: 'Across 6 environments', positive: true },
    { label: 'Utilization', metric: metrics.utilization, icon: Gauge, note: 'Target range: 70–85%', positive: true },
  ]

  return (
    <>
      <div className="page-heading">
        <div><span className="section-label">{activeView === 'billing' ? 'FINANCE' : 'WEDNESDAY, NOVEMBER 11, 2026'}</span><h1>{activeView === 'billing' ? 'Billing ledger' : 'Overview'}</h1><p>{activeView === 'billing' ? 'A clear record of your cloud costs.' : 'Your cloud footprint, at a glance.'}</p></div>
        <div className="heading-actions"><button className="quiet-button" type="button" onClick={() => window.location.reload()} title="Refresh data"><RefreshCw size={15} /> Refresh</button><button className="export-button" type="button"><Download size={15} /> Export report</button></div>
      </div>

      {activeView === 'billing' && <div className="ledger-notice"><ShieldCheck size={19} /><div><strong>Ledger view is ready to connect</strong><span>Sample totals are shown until a billing provider is connected.</span></div><span className="demo-tag">PREVIEW DATA</span></div>}

      <section className="metric-grid" aria-label="Usage summary">
        {cards.map(({ label, metric, icon: Icon, note, positive }, index) => (
          <article className="metric-card" key={label} style={{ animationDelay: `${index * 70}ms` }}>
            <div className="metric-card-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div>
            <strong className="metric-value">{loading ? '—' : metric.value}</strong>
            <div className="metric-foot"><span className={`metric-change ${positive ? 'change-positive' : 'change-neutral'}`}>{positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{metric.change}</span><span>{note}</span></div>
          </article>
        ))}
      </section>

      <section className="charts-grid">
        <article className="chart-panel usage-panel">
          <div className="panel-heading"><div><span className="panel-kicker">CLOUD ECONOMY</span><h2>Usage over time</h2></div><button className="period-select" type="button">Last 12 months <span>⌄</span></button></div>
          <div className="usage-chart">
            <div className="chart-y-labels"><span>$16k</span><span>$12k</span><span>$8k</span><span>$4k</span><span>$0</span></div>
            <div className="chart-plot">
              <div className="chart-grid-lines"><i /><i /><i /><i /><i /></div>
              <div className="bar-chart">{spendBars.map((height, index) => <div className={`bar-column${index === spendBars.length - 1 ? ' bar-current' : ''}`} key={months[index]}><span style={{ height: `${height}%` }} /><small>{months[index]}</small></div>)}</div>
            </div>
          </div>
          <div className="chart-legend"><span><i className="legend-dot legend-cyan" /> Cloud spend</span><span className="chart-total">$12,840 <small>current month</small></span></div>
        </article>

        <article className="chart-panel resource-panel" id="resources">
          <div className="panel-heading"><div><span className="panel-kicker">BY SERVICE</span><h2>Resource consumption</h2></div><button className="more-button" type="button" aria-label="Resource chart options">···</button></div>
          <div className="resource-total"><span className="resource-ring"><span><Boxes size={18} /></span></span><div><strong>2.84 TB</strong><span>Total consumption</span></div></div>
          <div className="resource-list">
            <div><span className="resource-name"><i className="resource-swatch swatch-cyan" /> Compute</span><span>1.24 TB <small>44%</small></span><b><i style={{ width: '44%' }} /></b></div>
            <div><span className="resource-name"><i className="resource-swatch swatch-blue" /> Storage</span><span>0.86 TB <small>30%</small></span><b><i style={{ width: '30%' }} /></b></div>
            <div><span className="resource-name"><i className="resource-swatch swatch-lime" /> Network</span><span>0.48 TB <small>17%</small></span><b><i style={{ width: '17%' }} /></b></div>
            <div><span className="resource-name"><i className="resource-swatch swatch-orange" /> Other</span><span>0.26 TB <small>9%</small></span><b><i style={{ width: '9%' }} /></b></div>
          </div>
        </article>
      </section>

      <section className="bottom-grid" id="activity">
        <article className="activity-panel">
          <div className="panel-heading"><div><span className="panel-kicker">RECENT CHANGES</span><h2>Activity</h2></div><a href="#activity">View all <ArrowUpRight size={14} /></a></div>
          <div className="activity-row"><span className="activity-icon activity-cyan"><Boxes size={16} /></span><span><strong>Resource provisioned</strong><small>Compute · production-api-03</small></span><time>12 min ago</time></div>
          <div className="activity-row"><span className="activity-icon activity-blue"><CircleDollarSign size={16} /></span><span><strong>Spend threshold at 72%</strong><small>Monthly budget · Production</small></span><time>1 hr ago</time></div>
          <div className="activity-row"><span className="activity-icon activity-green"><ShieldCheck size={16} /></span><span><strong>Usage report generated</strong><small>October 2026 · All services</small></span><time>Yesterday</time></div>
        </article>
        <article className="budget-panel">
          <div className="budget-overline"><span className="live-dot" /> MONTHLY BUDGET</div>
          <div className="budget-amount"><strong>$12,840</strong><span>of $18,000</span></div>
          <div className="budget-track"><span /></div>
          <div className="budget-foot"><span>71% utilized</span><span>$5,160 remaining</span></div>
          <div className="budget-note"><span className="budget-note-icon"><Gauge size={15} /></span>Projected to stay within budget this month.</div>
        </article>
      </section>
      <div className="demo-disclaimer">DEMO METRICS &nbsp; · &nbsp; Connect a billing source to see live usage and spend data.</div>
    </>
  )
}