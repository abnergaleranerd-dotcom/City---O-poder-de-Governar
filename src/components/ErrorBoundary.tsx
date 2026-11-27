import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Erro inesperado na simulação.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-lg p-6">
            <h1 className="font-display text-xl font-bold text-amber-400">
              CITY TYCOON 4D — Recuperação de Erro
            </h1>
            <p className="text-sm text-slate-300 mt-3 leading-relaxed">
              Ocorreu uma falha de execução: <span className="font-mono-num text-rose-300">{this.state.message}</span>
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded transition-colors"
            >
              Recarregar Cidade
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
