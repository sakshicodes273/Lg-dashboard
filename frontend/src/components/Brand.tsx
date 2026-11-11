import { ShieldCheck } from 'lucide-react'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? ' brand-compact' : ''}`}>
      <span className="brand-mark"><ShieldCheck size={20} strokeWidth={2.2} /></span>
      <span className="brand-name">ledger<span>guard</span></span>
    </div>
  )
}