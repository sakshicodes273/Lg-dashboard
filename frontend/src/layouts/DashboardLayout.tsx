import { ArrowUpRight, Boxes, CircleHelp, CreditCard, LayoutDashboard, LogOut, Settings2 } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Brand } from '../components/Brand'

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, organizationName, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isBilling = location.pathname.startsWith('/billing')

  async function handleLogout() {
    try {
      await signOut()
    } finally {
      navigate('/login')
    }
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-switcher">
          <div className="workspace-icon">{(organizationName || 'L').slice(0, 1).toUpperCase()}</div>
          <div className="workspace-copy"><strong>{organizationName || 'Your workspace'}</strong><span>Free plan</span></div>
          <ArrowUpRight size={15} />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/" end><LayoutDashboard size={17} /> Overview</NavLink>
          <NavLink to="/billing"><CreditCard size={17} /> Billing ledger</NavLink>
          <a href="#resources"><Boxes size={17} /> Resources</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-bottom">
          <a href="#help"><CircleHelp size={17} /> Help center</a>
          <a href="#settings"><Settings2 size={17} /> Settings</a>
          <div className="account-row">
            <div className="avatar">{user?.name.slice(0, 1).toUpperCase() ?? 'L'}</div>
            <div className="account-copy"><strong>{user?.name}</strong><span>{user?.email}</span></div>
            <button type="button" className="icon-button logout-button" aria-label="Log out" title="Log out" onClick={handleLogout}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      <main className="dashboard-main">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{isBilling ? 'Billing ledger' : 'Overview'}</strong></div>
          <div className="topbar-meta"><span className="live-dot" /> All systems operational <span className="topbar-date">Updated just now</span></div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  )
}