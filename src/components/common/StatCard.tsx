import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtext?: string;
  onClick?: () => void;
  accentColor?: 'navy' | 'teal' | 'amber' | 'rose' | 'emerald' | 'purple';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  subtext,
  onClick,
  accentColor = 'navy',
}) => {
  const getAccent = () => {
    switch (accentColor) {
      case 'teal':
        return 'border-l-[#0f8b8d] text-[#0f8b8d]';
      case 'amber':
        return 'border-l-amber-600 text-amber-600';
      case 'rose':
        return 'border-l-rose-600 text-rose-600';
      case 'emerald':
        return 'border-l-emerald-600 text-emerald-600';
      case 'purple':
        return 'border-l-purple-600 text-purple-600';
      case 'navy':
      default:
        return 'border-l-[#15345b] text-[#15345b]';
    }
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`bg-white border border-slate-200 border-l-4 ${getAccent()} rounded-lg p-4 shadow-xs transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className="p-2 rounded bg-slate-50">{icon}</div>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
      {subtext && <p className="mt-1 text-xs text-slate-500">{subtext}</p>}
    </div>
  );
};
