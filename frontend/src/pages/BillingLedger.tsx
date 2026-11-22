import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Eye, RefreshCw, X } from 'lucide-react'
import { apiRequest } from '../services/api'
import type { BillingStatus, BillingTransaction, BillingTransactionPage } from '../types/billing'

const pageSize = 10

function displayDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

function displayAmount(transaction: BillingTransaction): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: transaction.currency,
  }).format(transaction.amount)
}

function readableStatus(status: BillingStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function BillingLedger() {
  const [status, setStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [result, setResult] = useState<BillingTransactionPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<BillingTransaction | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) })
    if (status) params.set('status', status)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    apiRequest<BillingTransactionPage>(`/billing/transactions?${params}`, { signal: controller.signal })
      .then(setResult)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load billing transactions')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [status, startDate, endDate, page, refreshKey])

  useEffect(() => {
    if (!selectedTransaction) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedTransaction(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedTransaction])

  async function showDetails(transactionId: string) {
    setSelectedTransaction(null)
    setDetailsError(null)
    setDetailsLoading(true)
    try {
      const response = await apiRequest<{ transaction: BillingTransaction }>(
        `/billing/transactions/${encodeURIComponent(transactionId)}`,
      )
      setSelectedTransaction(response.transaction)
    } catch (requestError) {
      setDetailsError(requestError instanceof Error ? requestError.message : 'Unable to load transaction details')
    } finally {
      setDetailsLoading(false)
    }
  }

  function clearFilters() {
    setLoading(true)
    setError(null)
    setStatus('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-label">FINANCE</span>
          <h1>Billing ledger</h1>
          <p>Review and filter your organization&apos;s billing transactions.</p>
        </div>
        <div className="heading-actions">
          <button className="quiet-button" type="button" onClick={() => { setLoading(true); setError(null); setRefreshKey((current) => current + 1) }} title="Refresh transactions">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      <section className="ledger-panel" aria-label="Billing transactions">
        <div className="ledger-toolbar">
          <div className="ledger-toolbar-title">
            <h2>Transactions</h2>
            <span>{result ? `${result.total} total` : 'Your recent billing activity'}</span>
          </div>
          <div className="ledger-filters">
            <label>
              <span>Status</span>
              <select value={status} onChange={(event) => { setLoading(true); setError(null); setStatus(event.target.value); setPage(1) }}>
                <option value="">All statuses</option>
                <option value="successful">Successful</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label>
              <span>From</span>
              <input aria-label="Start date" type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setLoading(true); setError(null); setStartDate(event.target.value); setPage(1) }} />
            </label>
            <label>
              <span>To</span>
              <input aria-label="End date" type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setLoading(true); setError(null); setEndDate(event.target.value); setPage(1) }} />
            </label>
            {(status || startDate || endDate) && <button className="clear-filters" type="button" onClick={clearFilters}>Clear filters</button>}
          </div>
        </div>

        {error && (
          <div className="ledger-state ledger-error" role="alert">
            <strong>Couldn&apos;t load transactions</strong>
            <span>{error}</span>
            <button type="button" onClick={() => { setLoading(true); setError(null); setRefreshKey((current) => current + 1) }}>Try again</button>
          </div>
        )}

        {!error && loading && <div className="ledger-state" role="status"><span className="loader" /> Loading transactions…</div>}

        {!error && !loading && result?.transactions.length === 0 && (
          <div className="ledger-state ledger-empty">
            <strong>{result.total === 0 ? 'No billing transactions yet' : 'No transactions match these filters'}</strong>
            <span>{result.total === 0 ? 'Transactions created for your organization will appear here.' : 'Try adjusting the status or date range.'}</span>
            {result.total > 0 && <button type="button" onClick={clearFilters}>Clear filters</button>}
          </div>
        )}

        {!error && !loading && result && result.transactions.length > 0 && (
          <>
            <div className="ledger-table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr><th scope="col">Transaction ID</th><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Action</span></th></tr>
                </thead>
                <tbody>
                  {result.transactions.map((transaction) => (
                    <tr key={transaction.transactionId}>
                      <td><code>{transaction.transactionId}</code></td>
                      <td><time dateTime={transaction.createdAt}>{displayDate(transaction.createdAt)}</time></td>
                      <td className="ledger-description">{transaction.description || '—'}</td>
                      <td className="ledger-amount">{displayAmount(transaction)}</td>
                      <td><span className={`status-badge status-${transaction.status}`}><i />{readableStatus(transaction.status)}</span></td>
                      <td><button className="details-button" type="button" disabled={detailsLoading} onClick={() => void showDetails(transaction.transactionId)} aria-label={`View transaction ${transaction.transactionId}`}><Eye size={15} /><span>Details</span></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ledger-pagination">
              <span>Page {result.page} of {Math.max(result.totalPages, 1)}</span>
              <div>
                <button type="button" aria-label="Previous page" disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage((current) => current - 1) }}><ArrowLeft size={15} /> Previous</button>
                <button type="button" aria-label="Next page" disabled={loading || page >= result.totalPages} onClick={() => { setLoading(true); setPage((current) => current + 1) }}>Next <ArrowRight size={15} /></button>
              </div>
            </div>
          </>
        )}
      </section>

      {detailsError && <div className="ledger-detail-error" role="alert">{detailsError}<button type="button" onClick={() => setDetailsError(null)} aria-label="Dismiss error"><X size={14} /></button></div>}
      {detailsLoading && <div className="details-loading" role="status"><span className="loader" /> Loading transaction details…</div>}

      {selectedTransaction && (
        <div className="ledger-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTransaction(null) }}>
          <section className="ledger-details" role="dialog" aria-modal="true" aria-labelledby="transaction-details-title">
            <div className="ledger-details-heading">
              <div><span className="section-label">TRANSACTION</span><h2 id="transaction-details-title">Details</h2></div>
              <button type="button" className="icon-button" onClick={() => setSelectedTransaction(null)} aria-label="Close transaction details"><X size={18} /></button>
            </div>
            <dl>
              <div><dt>Transaction ID</dt><dd><code>{selectedTransaction.transactionId}</code></dd></div>
              <div><dt>Date</dt><dd>{displayDate(selectedTransaction.createdAt)}</dd></div>
              <div><dt>Description</dt><dd>{selectedTransaction.description || '—'}</dd></div>
              <div><dt>Amount</dt><dd>{displayAmount(selectedTransaction)}</dd></div>
              <div><dt>Status</dt><dd><span className={`status-badge status-${selectedTransaction.status}`}><i />{readableStatus(selectedTransaction.status)}</span></dd></div>
              <div><dt>Last updated</dt><dd>{displayDate(selectedTransaction.updatedAt)}</dd></div>
            </dl>
          </section>
        </div>
      )}
    </>
  )
}
