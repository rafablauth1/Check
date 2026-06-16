'use client'
import React from 'react'

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(e: Error): State { return { error: e } }
  componentDidCatch(e: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', e, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', color: '#f87171', background: '#0B0E14', minHeight: '100vh' }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Erro de Renderização</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#fca5a5', marginBottom: 16 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: '1px solid #3b82f6', borderRadius: 8, cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
