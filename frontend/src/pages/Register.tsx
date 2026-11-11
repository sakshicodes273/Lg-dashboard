import { useState, type FormEvent } from 'react'
import { ArrowRight, Building2, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'

export function Register() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', organizationName: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signUp(form.name, form.email, form.password, form.organizationName)
      navigate('/')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create your account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="story-copy">
          <div className="eyebrow"><span /> YOUR COSTS, UNDER CONTROL</div>
          <h1>Build with<br />clarity. Spend<br /><em>with intent.</em></h1>
          <p>Bring your cloud footprint into focus from day one.</p>
        </div>
        <div className="story-foot"><span>01</span><div /><span>CONTROL YOUR CLOUD ECONOMY</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-top"><span>CREATE YOUR WORKSPACE</span><span className="secure-label"><LockKeyhole size={13} /> PRIVATE BY DESIGN</span></div>
        <div className="auth-form-wrap register-form-wrap">
          <div className="auth-heading"><span className="form-kicker">GET STARTED</span><h2>Create your account</h2><p>Set up your organization in a few steps.</p></div>
          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="name">Your name</label>
            <div className="input-wrap"><UserRound size={17} /><input id="name" autoComplete="name" placeholder="Alex Morgan" value={form.name} onChange={(event) => update('name', event.target.value)} minLength={2} maxLength={120} required /></div>
            <label htmlFor="organization">Organization</label>
            <div className="input-wrap"><Building2 size={17} /><input id="organization" autoComplete="organization" placeholder="Acme, Inc." value={form.organizationName} onChange={(event) => update('organizationName', event.target.value)} minLength={2} maxLength={120} required /></div>
            <label htmlFor="email">Work email</label>
            <div className="input-wrap"><Mail size={17} /><input id="email" type="email" autoComplete="email" placeholder="you@company.com" value={form.email} onChange={(event) => update('email', event.target.value)} required /></div>
            <label htmlFor="password">Password <span className="label-hint">10+ characters</span></label>
            <div className="input-wrap"><LockKeyhole size={17} /><input id="password" type="password" autoComplete="new-password" placeholder="Create a strong password" value={form.password} onChange={(event) => update('password', event.target.value)} minLength={10} maxLength={128} required /></div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating workspace…' : 'Create workspace'} <ArrowRight size={17} /></button>
          </form>
          <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
        <div className="auth-footer"><span>© 2026 LEDGERGUARD</span><span>PRIVACY &nbsp; · &nbsp; SECURITY</span></div>
      </section>
    </main>
  )
}