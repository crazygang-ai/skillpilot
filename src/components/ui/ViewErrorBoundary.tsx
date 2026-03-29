import React from 'react'

interface Props {
  children: React.ReactNode
  viewName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ViewErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <h3 className="text-base font-semibold text-text-primary mb-2">
              {this.props.viewName ?? 'This view'} encountered an error
            </h3>
            <p className="text-sm text-text-muted mb-4 break-words">
              {this.state.error?.message}
            </p>
            <button
              onClick={this.handleRetry}
              className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
