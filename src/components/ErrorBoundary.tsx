"use client"
import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  isNavigating: boolean
  isReloading: boolean
  errorMessage: string
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, isNavigating: false, isReloading: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    const isNavError =
      error.message?.includes('removeChild') ||
      error.message?.includes('not a child') ||
      error.message?.includes('NotFoundError') ||
      error.message?.includes('Failed to execute') ||
      error.message?.includes('cannot be found')

    return {
      hasError: true,
      isNavigating: !!isNavError,
      isReloading: false,
      errorMessage: error?.message || 'unknown'
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('ErrorBoundary caught:', error.message)

    const isNavError =
      error.message?.includes('removeChild') ||
      error.message?.includes('not a child') ||
      error.message?.includes('NotFoundError') ||
      error.message?.includes('Failed to execute') ||
      error.message?.includes('cannot be found')

    if (isNavError) {
      // Submit in progress — don't interfere, let it finish
      if (typeof window !== 'undefined' && (window as any).__submitInProgress) {
        console.warn('ErrorBoundary: submit in progress — skipping auto-reload')
        setTimeout(() => {
          if ((window as any).__submitInProgress) {
            window.location.replace('/dashboard')
          }
        }, 30000)
        return
      }

      // Auto-reload once to recover from stale cached code.
      // After reload, Zustand rehydrates from localStorage and the user
      // lands exactly where they were. sessionStorage prevents an
      // infinite reload loop if the crash persists after fresh code.
      if (typeof window !== 'undefined') {
        const reloadKey = 'eb_nav_reloaded'
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, '1')
          this.setState({ isReloading: true })
          window.location.reload()
          return
        }
        // Already reloaded once and still crashing — go to dashboard
        sessionStorage.removeItem(reloadKey)
      }

      setTimeout(() => window.location.replace('/dashboard'), 50)
    }
  }

  private goToDashboard() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useInspectionStore } = require('@/store/useInspectionStore')
      useInspectionStore.getState().selectJob(null)
    } catch { /* ignore */ }
    window.location.replace('/dashboard')
  }

  render() {
    // Auto-reloading — show spinner so user doesn't see a flash of error
    if (this.state.hasError && this.state.isReloading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Ładowanie...</p>
          </div>
        </div>
      )
    }

    // Submit-triggered navigation — show success screen
    if (this.state.hasError && this.state.isNavigating) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <div className="text-5xl mb-4">✅</div>
            <p className="text-xl font-bold text-green-700">
              Raport wysłany pomyślnie!
            </p>
            <p className="text-gray-500 mt-2">
              Przekierowywanie...
            </p>
          </div>
        </div>
      )
    }

    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center p-8 max-w-sm">
            <p className="text-red-600 font-bold mb-2">Wystąpił błąd</p>
            <p className="text-xs text-gray-800 bg-gray-100 rounded p-2 mb-4 break-all text-left font-mono">
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => this.goToDashboard()}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold"
            >
              Powrót do dashboardu
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
