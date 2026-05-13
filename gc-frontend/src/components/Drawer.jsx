import { X } from 'lucide-react'

/**
 * Reusable right-side drawer component with consistent styling and sizing
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether drawer is visible
 * @param {string} props.title - Drawer title/heading
 * @param {string} props.subtitle - Optional subtitle (e.g. metadata)
 * @param {React.ReactNode} props.children - Drawer body content
 * @param {Function} props.onClose - Callback when drawer closes
 * @param {React.ReactNode} props.footerAction - Optional footer button/action
 * @param {string} props.width - Optional drawer width (default: max-w-3xl)
 */

export default function Drawer({ isOpen, title, subtitle, children, onClose, footerAction }) {
  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/30"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl`}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{title}</h3>
            {subtitle && (
              <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footerAction && (
          <div className="border-t border-slate-100 px-6 py-4">
            {footerAction}
          </div>
        )}
      </aside>
    </>
  )
}
