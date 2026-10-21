import React, { useState, useEffect } from 'react';
import { User } from '../types/index.ts';
import { api } from '../services/api.ts';
import { ShieldCheck, UserCheck, AlertTriangle, Layers, Building2, SearchCheck, Sliders, FileText } from 'lucide-react';

interface HeaderProps {
  currentUser: User | null;
  onUserChanged: (user: User) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onUserChanged,
  activeTab,
  onSelectTab,
}) => {
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    api.getUsers().then((res) => setUsers(res.users)).catch(console.error);
  }, []);

  const handleSwitchUser = async (userId: string) => {
    try {
      const res = await api.switchUser(userId);
      onUserChanged(res.user);
      setShowSwitchModal(false);
    } catch (e) {
      console.error('Failed to switch user', e);
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'INSTITUTION':
        return 'Institution Portal';
      case 'REVIEWER':
        return 'Regulatory Reviewer';
      case 'ADMIN':
        return 'Chief Administrator';
      default:
        return 'Regulatory User';
    }
  };

  return (
    <>
      {/* Top Disclaimer Banner */}
      <div className="bg-slate-900 text-slate-300 text-xs py-1.5 px-6 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-amber-400">OFFICIAL PROTOTYPE</span>
          <span className="text-slate-500">·</span>
          <span>All India Council for Technical Education · Regulation Bureau</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">Smart Regulatory Compliance & Document Forensics</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
          <span>Synthetic Demonstration Dataset Active</span>
        </div>
      </div>

      {/* Main Top Navigation Bar (3-Zone Contract) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded bg-[#0f294a] flex items-center justify-center text-white font-bold text-sm shadow-xs">
              AICTE
            </div>
            <div className="flex flex-col">
              <a
                href="#dashboard"
                onClick={(e) => {
                  e.preventDefault();
                  onSelectTab('dashboard');
                }}
                className="text-base font-bold tracking-tight text-[#0f294a] whitespace-nowrap"
              >
                Intelligent Regulatory Validation Platform
              </a>
              <span className="text-[11px] text-slate-500 font-medium">Approval Process Compliance System</span>
            </div>
          </div>

          {/* Zone 2: 4-5 clean single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              onClick={() => onSelectTab('dashboard')}
              className={`hover:text-[#0f294a] transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeTab === 'dashboard' ? 'text-[#0f294a] font-semibold border-b-2 border-[#0f294a]' : ''
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => onSelectTab('applications')}
              className={`hover:text-[#0f294a] transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeTab === 'applications' ? 'text-[#0f294a] font-semibold border-b-2 border-[#0f294a]' : ''
              }`}
            >
              Applications
            </button>
            <button
              onClick={() => onSelectTab('inspection')}
              className={`hover:text-[#0f294a] transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeTab === 'inspection' ? 'text-[#0f294a] font-semibold border-b-2 border-[#0f294a]' : ''
              }`}
            >
              Inspection Desk
            </button>
            <button
              onClick={() => onSelectTab('forensics')}
              className={`hover:text-[#0f294a] transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeTab === 'forensics' ? 'text-[#0f294a] font-semibold border-b-2 border-[#0f294a]' : ''
              }`}
            >
              Document Forensics
            </button>
            <button
              onClick={() => onSelectTab('admin')}
              className={`hover:text-[#0f294a] transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeTab === 'admin' ? 'text-[#0f294a] font-semibold border-b-2 border-[#0f294a]' : ''
              }`}
            >
              Rules & Audit
            </button>
          </nav>

          {/* Zone 3: 1 primary action / user role control */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowSwitchModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
              title="Click to switch role between Institution, Reviewer, and Admin"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-600" />
              <span className="font-semibold text-slate-900">{currentUser?.name?.split(' ')[1] || 'User'}</span>
              <span className="text-slate-400">/</span>
              <span className="text-slate-600 font-normal">{getRoleLabel(currentUser?.role)}</span>
              <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                Switch Role
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Role Switcher Modal */}
      {showSwitchModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Switch Demonstration User</h3>
                <p className="text-xs text-slate-300">
                  Select a synthetic actor to test role-specific workflows and security boundaries.
                </p>
              </div>
              <button
                onClick={() => setShowSwitchModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
              {users.map((u) => {
                const isSelected = u.id === currentUser?.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => handleSwitchUser(u.id)}
                    className={`w-full text-left p-3 rounded-md border text-xs transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'border-[#0f294a] bg-blue-50/50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-900 flex items-center gap-2">
                        {u.name}
                        {isSelected && (
                          <span className="text-[10px] bg-[#0f294a] text-white px-1.5 py-0.2 rounded font-normal">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 text-[11px] mt-0.5">{u.email}</div>
                      <div className="text-slate-600 text-[11px] mt-0.5">
                        {u.designation} · {u.department}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                          u.role === 'INSTITUTION'
                            ? 'bg-amber-100 text-amber-800'
                            : u.role === 'REVIEWER'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {u.role}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setShowSwitchModal(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
