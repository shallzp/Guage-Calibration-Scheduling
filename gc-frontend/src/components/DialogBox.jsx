function DialogBox({ isOpen, title, message, children, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel' }) {
    
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white p-6 shadow-2xl">
                {title && <p className="display-font text-lg font-semibold text-slate-900 mb-3">{title}</p>}
                {message && <p className="text-sm leading-6 text-slate-700">{message}</p>}

                {children && <div className="mt-2 text-sm leading-6 text-slate-700">{children}</div>}

                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                            {cancelText}
                        </button>
                    )}
                    {onConfirm && (
                        <button
                            type="button"
                            onClick={onConfirm}
                            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                        >
                            {confirmText}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default DialogBox
