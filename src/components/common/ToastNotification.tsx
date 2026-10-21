import React from 'react';
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, Lock, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'SUCCESS' | 'ERROR' | 'WARNING' | 'INFO' | 'UNAUTHORIZED' | 'CONFLICT';
  title: string;
  message: string;
  correlationId?: string;
}

interface ToastNotificationProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none"
    >
      {toasts.map((toast) => {
        const getStyles = () => {
          switch (toast.type) {
            case 'SUCCESS':
              return {
                bg: 'bg-emerald-50 border-emerald-300 text-emerald-950',
                icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
              };
            case 'UNAUTHORIZED':
              return {
                bg: 'bg-rose-50 border-rose-300 text-rose-950',
                icon: <Lock className="w-5 h-5 text-rose-600 shrink-0" />,
              };
            case 'CONFLICT':
              return {
                bg: 'bg-amber-50 border-amber-300 text-amber-950',
                icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
              };
            case 'ERROR':
              return {
                bg: 'bg-rose-50 border-rose-300 text-rose-950',
                icon: <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0" />,
              };
            case 'WARNING':
              return {
                bg: 'bg-amber-50 border-amber-300 text-amber-950',
                icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
              };
            case 'INFO':
            default:
              return {
                bg: 'bg-blue-50 border-blue-300 text-blue-950',
                icon: <Info className="w-5 h-5 text-blue-600 shrink-0" />,
              };
          }
        };

        const { bg, icon } = getStyles();

        return (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto p-4 rounded-lg border shadow-lg ${bg} transition-all duration-200 animate-in slide-in-from-bottom-2 flex items-start gap-3`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-xs tracking-tight">{toast.title}</div>
              <p className="text-xs mt-0.5 text-slate-700 leading-relaxed break-words">{toast.message}</p>
              {toast.correlationId && (
                <div className="font-mono text-[10px] text-slate-500 mt-1">
                  Audit CID: {toast.correlationId}
                </div>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
