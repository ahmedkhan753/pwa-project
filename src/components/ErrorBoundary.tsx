"use client"
import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  isNavigating: boolean
  isReloading: boolean
  isSoftRetrying: boolean
  errorMessage: string
  retryCount: number
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      isNavigating: false,
      isReloading: false,
      isSoftRetrying: false,
      errorMessage: '',
      retryCount: 0,
    }
  }

  private static isNavDomError(msg: string | undefined): boolean {
    if (!msg) return false
    return (
      msg.includes('removeChild') ||
      msg.includes('not a child') ||
      msg.includes('NotFoundError') ||
      msg.includes('Failed to execute') ||
      msg.includes('cannot be found') ||
      msg.includes('insertBefore')
    )
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const isNav = ErrorBoundary.isNavDomError(error.message)
    return {
      hasError: true,
      isNavigating: isNav,
      isReloading: false,
      isSoftRetrying: false,
      errorMessage: error?.message || 'unknown',
    }
  }

  componentDidCatch(error: Error, _info: React.ErrorInfo) {
    console.warn('ErrorBoundary caught:', error.message)

    const isNavError = ErrorBoundary.isNavDomError(error.message)

    if (isNavError) {
      // Submit in progress — don't interfere at all, let it finish
      if (typeof window !== 'undefined' && (window as any).__submitInProgress) {
        console.warn('ErrorBoundary: submit in progress — showing success screen')
        return
      }

      // ── Strategy: soft retry → reload → show retry UI ──
      // NEVER clear inspection data or call selectJob(null).
      // The Zustand store persists in localStorage; a reload or
      // soft reset should recover gracefully without data loss.

      if (typeof window !== 'undefined') {
        const softKey = 'eb_soft_retry'
        const reloadKey = 'eb_nav_reloaded'

        // Phase 1: Soft retry — just reset error state so React re-renders
        if (!sessionStorage.getItem(softKey)) {
          sessionStorage.setItem(softKey, '1')
          console.warn('ErrorBoundary: attempting soft retry (reset error state)')
          // Delay briefly to let the DOM settle, then clear error
          setTimeout(() => {
            this.setState({
              hasError: false,
              isNavigating: false,
              isSoftRetrying: true,
              retryCount: this.state.retryCount + 1,
            })
          }, 100)
          return
        }

        // Phase 2: Hard reload — Zustand rehydrates from localStorage
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, '1')
          sessionStorage.removeItem(softKey)
          console.warn('ErrorBoundary: soft retry failed, doing hard reload')
          this.setState({ isReloading: true })
          window.location.reload()
          return
        }

        // Phase 3: Both failed — show non-destructive retry UI
        // Clean up session keys for next attempt
        sessionStorage.removeItem(softKey)
        sessionStorage.removeItem(reloadKey)
        console.warn('ErrorBoundary: all retries exhausted — showing manual retry UI')
        // Fall through to render() which shows the retry screen
      }
    }
  }

  /**
   * Retry WITHOUT destroying data — just reload the page.
   * Zustand data is in localStorage and will survive.
   */
  private handleRetry() {
    if (typeof window !== 'undefined') {
      // Clear retry keys so the retry cycle can start fresh
      sessionStorage.removeItem('eb_soft_retry')
      sessionStorage.removeItem('eb_nav_reloaded')
    }
    window.location.reload()
  }

  /**
   * Nuclear option — user explicitly wants to go to dashboard.
   * Still does NOT clear inspection data (selectJob). The inspector
   * can re-enter the deal from the dashboard card.
   */
  private goToDashboard() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('eb_soft_retry')
      sessionStorage.removeItem('eb_nav_reloaded')
    }
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

    // Submit-triggered navigation — show success screen, NOT an error
    if (this.state.hasError && this.state.isNavigating &&
        typeof window !== 'undefined' && (window as any).__submitInProgress) {
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

    // DOM navigation error after retries — show non-destructive UI
    if (this.state.hasError && this.state.isNavigating) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8 max-w-sm">
            <div className="text-4xl mb-3">🔄</div>
            <p className="text-gray-800 font-bold mb-2">Odśwież stronę</p>
            <p className="text-xs text-gray-500 mb-4">
              Wystąpił tymczasowy problem z wyświetlaniem. Twoje dane są bezpieczne.
            </p>
            <button
              onClick={() => this.handleRetry()}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold w-full mb-2"
            >
              🔄 Odśwież
            </button>
            <button
              onClick={() => this.goToDashboard()}
              className="text-gray-400 text-xs underline"
            >
              Wróć do dashboardu
            </button>
          </div>
        </div>
      )
    }

    // Generic non-navigation error
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center p-8 max-w-sm">
            <p className="text-red-600 font-bold mb-2">Wystąpił błąd</p>
            <p className="text-xs text-gray-800 bg-gray-100 rounded p-2 mb-4 break-all text-left font-mono">
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => this.handleRetry()}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold w-full mb-2"
            >
              🔄 Spróbuj ponownie
            </button>
            <button
              onClick={() => this.goToDashboard()}
              className="text-gray-400 text-xs underline"
            >
              Wróć do dashboardu
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
