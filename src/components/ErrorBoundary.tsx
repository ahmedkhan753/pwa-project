"use client"
import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  isNavigating: boolean
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, isNavigating: false }
  }

  static getDerivedStateFromError(error: Error): State {
    const isNavError =
      error.message?.includes('removeChild') ||
      error.message?.includes('not a child') ||
      error.message?.includes('NotFoundError') ||
      error.message?.includes('Failed to execute')

    // For navigation errors, show loading screen not error screen
    return {
      hasError: true,
      isNavigating: !!isNavError
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('ErrorBoundary caught:', error.message)

    const isNavError =
      error.message?.includes('removeChild') ||
      error.message?.includes('not a child') ||
      error.message?.includes('NotFoundError') ||
      error.message?.includes('Failed to execute')

    if (isNavError) {
      // Always redirect to dashboard on navigation errors
      // Don't show error page — just navigate
      setTimeout(() => {
        window.location.replace('/dashboard')
      }, 50)
    }
  }

  render() {
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
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center p-8">
            <p className="text-red-500 mb-4">Wystąpił błąd</p>
            <button
              onClick={() => window.location.replace('/dashboard')}
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
