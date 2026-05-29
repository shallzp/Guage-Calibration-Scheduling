import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Gauge, Megaphone, ChevronLeft } from 'lucide-react'

const navItems = [
  { to: '/gauge-calibration', label: 'Gauge Calibration', Icon: Gauge },
  { to: '/campaign', label: 'Campaign', Icon: Megaphone },
]

function Navbar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('navbarCollapsed')
      if (saved !== null) return JSON.parse(saved)
    } catch {
      // fallback
    }
    return false
  })

  useEffect(() => {
    localStorage.setItem('navbarCollapsed', JSON.stringify(collapsed))
  }, [collapsed])

  return (
    <aside
      className={`relative z-40 border-white/60 bg-white/75 shadow-sm backdrop-blur-md transition-all duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:shrink-0 md:border-r md:border-b-0 ${collapsed
          ? 'border-b p-2 md:w-22 md:py-6 md:px-3'
          : 'w-full border-b p-4 md:w-72 md:p-6'
        }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setCollapsed((prev) => !prev)
        }
      }}
      aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
    >

      <div className="mb-6">
        {!collapsed ? (
          <p className="display-font text-sm font-semibold uppercase tracking-[0.2em] text-teal-800/80">
            Navigation
          </p>
        ) : (
          <p className="text-center display-font text-sm font-semibold uppercase tracking-[0.2em] text-teal-800/80">
            Nav
          </p>
        )}
      </ div>

      <nav className={`flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white/80 p-2`}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg text-sm font-semibold transition ${collapsed ? 'justify-center px-4 py-3' : 'px-4 py-3'
              } ${isActive
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <item.Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export default Navbar
