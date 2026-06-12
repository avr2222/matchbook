import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 px-4 text-center">
        <p className="text-lg font-medium text-white">Something went wrong</p>
        <p className="text-sm text-gray-400 max-w-md break-words">
          {this.state.error?.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#10b981] text-white hover:bg-[#10b981]/90 transition-colors"
        >
          Reload app
        </button>
      </div>
    )
  }
}
