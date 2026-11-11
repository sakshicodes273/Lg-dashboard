import { useState, type FormEvent } from 'react'
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to sign in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="story-copy">
          <div className="eyebrow"><span /> FINANCIAL CLARITY, ENGINEERED</div>
          <h1>Know where<br />every dollar <em>goes.</em></h1>
          <p>One clear view of your cloud spend, usage, and the resources behind them.</p>
        </div>
        <div className="story-foot"><span>01</span><div /><span>CONTROL YOUR CLOUD ECONOMY</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-top"><span>SECURE WORKSPACE ACCESS</span><span className="secure-label"><LockKeyhole size={13} /> ENCRYPTED</span></div>
        <div className="auth-form-wrap">
          <div className="auth-heading"><span className="form-kicker">WELCOME BACK</span><h2>Sign in to LedgerGuard</h2><p>Your workspace is ready when you are.</p></div>
          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="email">Work email</label>
            <div className="input-wrap"><Mail size={17} /><input id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <div className="label-row"><label htmlFor="password">Password</label><a href="#forgot">Forgot password?</a></div>
            <div className="input-wrap"><LockKeyhole size={17} /><input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} /></button>
          </form>
          <p className="auth-switch">New to LedgerGuard? <Link to="/register">Create an account</Link></p>
        </div>
        <div className="auth-footer"><span>© 2026 LEDGERGUARD</span><span>PRIVACY &nbsp; · &nbsp; SECURITY</span></div>
      </section>
    </main>
  )
}