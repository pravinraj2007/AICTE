import React from 'react';
import { ApplicationStatus, FindingSeverity, FindingStatus } from '../../types/index.ts';

interface StatusBadgeProps {
  status: ApplicationStatus | string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  // Format readable label
  const readable = status.replace(/_/g, ' ');

  // Semantic styling with zero-pill discipline: unboxed clean text with a subtle dot indicator
  const getColorClass = (s: string) => {
    switch (s) {
      case 'REVIEW_COMPLETED':
        return 'text-emerald-700 font-semibold';
      case 'UNDER_HUMAN_REVIEW':
        return 'text-amber-800 font-semibold';
      case 'DEFICIENCIES_FOUND':
        return 'text-rose-700 font-semibold';
      case 'DUPLICATE_CONFLICT_REVIEW':
        return 'text-rose-800 font-bold';
      case 'EXPIRING_TODAY':
        return 'text-orange-700 font-bold';
      case 'VERIFICATION_PENDING':
      case 'VALIDATION_IN_PROGRESS':
        return 'text-blue-700 font-medium';
      case 'CLARIFICATION_REQUESTED':
        return 'text-purple-700 font-medium';
      case 'SUBMITTED':
        return 'text-slate-800 font-medium';
      case 'DRAFT':
      default:
        return 'text-slate-500 font-medium';
    }
  };

  const getDotClass = (s: string) => {
    switch (s) {
      case 'REVIEW_COMPLETED':
        return 'bg-emerald-600';
      case 'UNDER_HUMAN_REVIEW':
        return 'bg-amber-500';
      case 'DEFICIENCIES_FOUND':
        return 'bg-rose-500';
      case 'DUPLICATE_CONFLICT_REVIEW':
        return 'bg-rose-600 animate-pulse';
      case 'EXPIRING_TODAY':
        return 'bg-orange-500 animate-pulse';
      case 'VERIFICATION_PENDING':
      case 'VALIDATION_IN_PROGRESS':
        return 'bg-blue-500';
      case 'CLARIFICATION_REQUESTED':
        return 'bg-purple-500';
      case 'SUBMITTED':
        return 'bg-slate-600';
      case 'DRAFT':
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${getColorClass(status)} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${getDotClass(status)}`} aria-hidden="true" />
      <span className="capitalize">{readable.toLowerCase()}</span>
    </span>
  );
};

interface SeverityBadgeProps {
  severity: FindingSeverity | string;
  className?: string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, className = '' }) => {
  const getSeverityStyle = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return {
          textColor: 'text-rose-700',
          dotColor: 'bg-rose-600',
          bgTint: 'bg-rose-50 border-rose-200',
        };
      case 'MAJOR':
        return {
          textColor: 'text-orange-700',
          dotColor: 'bg-orange-500',
          bgTint: 'bg-orange-50 border-orange-200',
        };
      case 'MODERATE':
        return {
          textColor: 'text-amber-700',
          dotColor: 'bg-amber-500',
          bgTint: 'bg-amber-50 border-amber-200',
        };
      case 'MINOR':
        return {
          textColor: 'text-blue-700',
          dotColor: 'bg-blue-500',
          bgTint: 'bg-blue-50 border-blue-200',
        };
      case 'INFORMATIONAL':
      default:
        return {
          textColor: 'text-slate-600',
          dotColor: 'bg-slate-400',
          bgTint: 'bg-slate-50 border-slate-200',
        };
    }
  };

  const style = getSeverityStyle(severity);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium border rounded ${style.bgTint} ${style.textColor} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dotColor}`} aria-hidden="true" />
      <span>{severity}</span>
    </span>
  );
};
