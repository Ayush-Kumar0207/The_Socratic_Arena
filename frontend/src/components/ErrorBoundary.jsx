import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isChunkLoadError: false };
  }

  static getDerivedStateFromError(error) {
    // Detect if this is a Vite-specific chunk load error
    const isChunkLoadError = 
      error.name === 'ChunkLoadError' || 
      /loading chunk/i.test(error.message) ||
      error.message?.includes('Failed to fetch dynamically imported module');
      
    return { hasError: true, error, isChunkLoadError };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Global Error Boundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, isChunkLoadError: false });
    window.location.reload();
  };

  handleRetryChunk = () => {
    // For chunk load errors, we can often just try to re-render
    this.setState({ hasError: false, error: null, isChunkLoadError: false });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, isChunkLoadError: false });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const { isChunkLoadError } = this.state;
      
      return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-950 p-6 text-center">
          <div className="relative mb-8">
            <div className="absolute inset-0 animate-pulse rounded-full bg-red-500/20 blur-2xl" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 border border-red-500/30">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
          </div>

          <h1 className="mb-3 text-3xl font-black tracking-tight text-slate-100 sm:text-4xl">
            {isChunkLoadError ? 'Connection Interrupted' : 'Arena Malfunction'}
          </h1>
          
          <p className="mb-8 max-w-md text-lg text-slate-400">
            {isChunkLoadError 
              ? 'The network dropped while loading this part of the arena. Your current battle state is still preserved.'
              : 'A cognitive spike caused a temporary disruption. Your progress and Elo are safe.'}
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            {isChunkLoadError ? (
              <button
                onClick={this.handleRetryChunk}
                className="group flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-bold text-slate-950 transition-all hover:bg-emerald-400"
              >
                <RefreshCw className="h-5 w-5" />
                Retry Loading Module
              </button>
            ) : (
              <button
                onClick={this.handleReset}
                className="group flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-6 py-3 font-bold text-slate-950 transition-all hover:bg-cyan-400"
              >
                <RefreshCw className="h-5 w-5 transition-transform group-hover:rotate-180" />
                Re-initialize Arena
              </button>
            )}
            <button
              onClick={this.handleGoHome}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-6 py-3 font-bold text-slate-300 transition-all hover:bg-slate-800 hover:text-slate-100"
            >
              <Home className="h-5 w-5" />
              Return to Neutral Zone
            </button>
          </div>

          <div className="mt-12 text-[10px] uppercase tracking-[0.2em] text-slate-600 font-mono">
            Error Signature: {this.state.error?.message || 'Unknown Protocol Failure'}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
