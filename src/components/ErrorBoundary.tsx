import React, { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorInfo: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, errorInfo: error.message };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Algo salió mal. Por favor, recarga la página.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || "");
        if (parsed.error && parsed.error.includes("insufficient permissions")) {
          displayMessage = "No tienes permisos para ver estos datos. Verifica tu cuenta.";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <div className="bg-white rounded-[32px] shadow-xl max-w-md w-full p-8 text-center space-y-4 border border-gray-100">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Error del Sistema</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              {displayMessage}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-brand text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-brand/20 active:scale-95 transition-all"
            >
              Recargar Aplicación
            </button>
            {this.state.errorInfo && (
              <details className="text-[10px] text-left text-gray-400 mt-4">
                <summary className="cursor-pointer uppercase font-bold">Ver detalles técnicos</summary>
                <pre className="mt-2 whitespace-pre-wrap bg-gray-100 p-2 rounded overflow-x-auto">
                  {this.state.errorInfo}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
