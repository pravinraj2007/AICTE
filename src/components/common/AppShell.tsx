import React, { useState } from 'react';
import {
  ShieldCheck,
  LayoutDashboard,
  FileText,
  FileCheck2,
  FolderOpen,
  Award,
  AlertTriangle,
  Clock,
  Settings,
  Users,
  ShieldAlert,
  History,
  Menu,
  X,
  Bell,
  Search,
  ChevronRight,
  LogOut,
  UserCheck,
  CheckCircle2,
  PlusCircle,
  Building2,
  Lock,
} from 'lucide-react';
import { User, UserRole } from '../../types/index.ts';

interface AppShellProps {
  currentUser: User | null;
  onUserChanged: (u: User) => void;
  activeNav: string;
  onNavigate: (navId: string) => void;
  breadcrumbs?: string[];
  unreadNotificationCount?: number;
  onOpenNewApplication?: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentUser,
  onUserChanged,
  activeNav,
  onNavigate,
  breadcrumbs = ['AICTE Portal', 'Dashboard'],
  unreadNotificationCount = 3,
  onOpenNewApplication,
  children,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sample quick users for demonstration / evaluation
  const quickUsers: Array<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
    designation: string;
    canApprove: boolean;
  }> = [
    {
      id: 'usr-inst-1',
      name: 'Dr. Rajesh Sharma',
      email: 'principal@dits-delhi.edu.in',
      role: 'INSTITUTION',
      designation: 'Principal / Institutional Head',
      canApprove: false,
    },
    {
      id: 'usr-reviewer-1',
      name: 'Dr. Sunil K. Mehta',
      email: 'scrutiny.officer@aicte.gov.in',
      role: 'REVIEWER',
      designation: 'Senior Scrutiny Officer (Authorized Approver)',
      canApprove: true,
    },
    {
      id: 'usr-reviewer-2',
      name: 'Er. Pooja Verma',
      email: 'assistant.reviewer@aicte.gov.in',
      role: 'REVIEWER',
      designation: 'Technical Scrutineer (Scrutiny Only / No Approval)',
      canApprove: false,
    },
    {
      id: 'usr-admin-1',
      name: 'Smt. Shailaja R.',
      email: 'director.approval@aicte.gov.in',
      role: 'ADMIN',
      designation: 'Director (Regulation Bureau)',
      canApprove: true,
    },
  ];

  const handleSwitchUser = async (u: typeof quickUsers[0]) => {
    try {
      const res = await fetch('/api/v1/auth/switch-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id }),
      });
      if (res.ok) {
        const data = await res.json();
        onUserChanged(data.user);
      }
    } catch (err) {
      console.error('Failed to switch user role', err);
    } finally {
      setRoleSwitcherOpen(false);
    }
  };

  // Role-aware navigation configuration
  const role = currentUser?.role || 'REVIEWER';

  interface NavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    roles: UserRole[];
    badgeCount?: number;
  }

  interface NavSection {
    title: string;
    items: NavItem[];
  }

  const navSections: NavSection[] = [
    {
      title: 'OVERVIEW',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: <LayoutDashboard className="w-4 h-4" />,
          roles: ['INSTITUTION', 'REVIEWER', 'ADMIN'],
        },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: <Bell className="w-4 h-4" />,
          roles: ['INSTITUTION', 'REVIEWER', 'ADMIN'],
          badgeCount: unreadNotificationCount,
        },
      ],
    },
    {
      title: 'APPLICATIONS',
      items: [
        {
          id: 'applications',
          label: 'All Applications',
          icon: <FileText className="w-4 h-4" />,
          roles: ['INSTITUTION', 'REVIEWER', 'ADMIN'],
        },
        {
          id: 'document-repository',
          label: 'Document Repository',
          icon: <FolderOpen className="w-4 h-4" />,
          roles: ['INSTITUTION', 'REVIEWER', 'ADMIN'],
        },
        {
          id: 'validation-reports',
          label: 'Validation Reports',
          icon: <FileCheck2 className="w-4 h-4" />,
          roles: ['INSTITUTION', 'REVIEWER', 'ADMIN'],
        },
      ],
    },
    {
      title: 'VERIFICATION',
      items: [
        {
          id: 'fdr-verification',
          label: 'FDR & Financial Check',
          icon: <Award className="w-4 h-4" />,
          roles: ['REVIEWER', 'ADMIN'],
        },
        {
          id: 'inspection',
          label: 'Reviewer Scrutiny Desk',
          icon: <CheckCircle2 className="w-4 h-4" />,
          roles: ['REVIEWER', 'ADMIN'],
        },
        {
          id: 'forensics',
          label: 'Anomaly Review',
          icon: <ShieldAlert className="w-4 h-4" />,
          roles: ['REVIEWER', 'ADMIN'],
        },
      ],
    },
    {
      title: 'REVIEW OPERATIONS',
      items: [
        {
          id: 'escalations',
          label: 'Escalations Queue',
          icon: <AlertTriangle className="w-4 h-4" />,
          roles: ['REVIEWER', 'ADMIN'],
          badgeCount: 2,
        },
        {
          id: 'audit-logs',
          label: 'Audit & Review History',
          icon: <History className="w-4 h-4" />,
          roles: ['REVIEWER', 'ADMIN'],
        },
      ],
    },
    {
      title: 'ADMINISTRATION',
      items: [
        {
          id: 'admin-rules',
          label: 'Regulatory Rules',
          icon: <Settings className="w-4 h-4" />,
          roles: ['ADMIN'],
        },
        {
          id: 'user-management',
          label: 'User Management',
          icon: <Users className="w-4 h-4" />,
          roles: ['ADMIN'],
        },
      ],
    },
  ];

  const handleNavClick = (id: string) => {
    onNavigate(id);
    setMobileDrawerOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col font-sans text-[#172b4d]">
      {/* Universal Institutional Topbar */}
      <header className="bg-[#15345b] text-white border-b border-[#0b1f3a] sticky top-0 z-40 shadow-xs">
        <div className="px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
          {/* Left: Brand & Mobile Menu Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (window.innerWidth >= 1024) {
                  setSidebarCollapsed(!sidebarCollapsed);
                } else {
                  setMobileDrawerOpen(!mobileDrawerOpen);
                }
              }}
              className="p-1.5 rounded text-slate-200 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-white"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Emblem & Brand Title */}
            <div
              onClick={() => onNavigate('dashboard')}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <div className="w-8 h-8 rounded bg-[#0f8b8d] flex items-center justify-center text-white shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                  <span>AICTE Regulatory Intelligence</span>
                  <span className="hidden sm:inline-block text-[10px] font-normal uppercase tracking-wider bg-white/10 px-1.5 py-0.5 rounded text-teal-200">
                    Official Scrutiny Portal
                  </span>
                </div>
                <div className="text-[10px] text-slate-300 hidden md:block">
                  Regulation Bureau · Approval Process Handbook Compliance
                </div>
              </div>
            </div>
          </div>

          {/* Center: Search Field */}
          <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Application No, Institute PID, FDR Ref..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    onNavigate('applications');
                  }
                }}
                className="w-full bg-[#0b1f3a]/80 text-xs text-white placeholder-slate-400 pl-9 pr-3 py-1.5 rounded border border-white/10 focus:border-[#0f8b8d] focus:outline-hidden transition-colors"
              />
            </div>
          </div>

          {/* Right: Quick Role Switcher, Notifications, and Current User Profile */}
          <div className="flex items-center gap-3">
            {/* Quick Action: New Application (if institution) */}
            {role === 'INSTITUTION' && onOpenNewApplication && (
              <button
                onClick={onOpenNewApplication}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0f8b8d] hover:bg-[#0c7274] text-white rounded shadow-xs transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New Application</span>
              </button>
            )}

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-1.5 rounded text-slate-200 hover:text-white hover:bg-white/10 relative transition-colors focus-visible:outline-white"
                aria-label="View notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>

              {/* Notifications Dropdown */}
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 text-slate-900 z-50 animate-in fade-in-50">
                  <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Regulatory Notifications</span>
                    <span className="text-[10px] text-slate-500">3 Unread Alerts</span>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    <div
                      onClick={() => {
                        onNavigate('fdr-verification');
                        setNotificationsOpen(false);
                      }}
                      className="p-3 hover:bg-slate-50 cursor-pointer space-y-1"
                    >
                      <div className="font-semibold text-rose-700 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Duplicate FDR Conflict Detected</span>
                      </div>
                      <p className="text-slate-600 text-[11px]">
                        FDR #SBIFDR991024 is simultaneously pledged in Delhi and Bangalore submissions.
                      </p>
                    </div>
                    <div
                      onClick={() => {
                        onNavigate('fdr-verification');
                        setNotificationsOpen(false);
                      }}
                      className="p-3 hover:bg-slate-50 cursor-pointer space-y-1"
                    >
                      <div className="font-semibold text-amber-700 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>FDR Expires Today</span>
                      </div>
                      <p className="text-slate-600 text-[11px]">
                        Jaipur Institute FDR matures on 2026-10-21. Rollover certificate required.
                      </p>
                    </div>
                    <div
                      onClick={() => {
                        onNavigate('inspection');
                        setNotificationsOpen(false);
                      }}
                      className="p-3 hover:bg-slate-50 cursor-pointer space-y-1"
                    >
                      <div className="font-semibold text-blue-700 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 shrink-0" />
                        <span>Statutory Approval Authority Check</span>
                      </div>
                      <p className="text-slate-600 text-[11px]">
                        Server-side RBAC and optimistic concurrency locks active.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Role Switcher Button */}
            <div className="relative">
              <button
                onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/15 text-white text-xs transition-colors border border-white/10"
                aria-expanded={roleSwitcherOpen}
                aria-label="Switch demonstration user role"
              >
                <div className="w-6 h-6 rounded bg-[#0f8b8d] flex items-center justify-center font-bold text-xs uppercase">
                  {currentUser?.name ? currentUser.name[0] : 'U'}
                </div>
                <div className="hidden lg:block text-left">
                  <div className="font-medium text-xs truncate max-w-[140px] leading-tight">
                    {currentUser?.name || 'Authorized Officer'}
                  </div>
                  <div className="text-[10px] text-teal-200 truncate leading-tight">
                    {currentUser?.role} · {currentUser?.canApproveApplications ? 'Approver' : 'Scrutiny Only'}
                  </div>
                </div>
              </button>

              {/* Role Switcher Dropdown */}
              {roleSwitcherOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 text-slate-900 z-50 p-2">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <div className="text-xs font-bold text-slate-800">Switch Evaluation Profile</div>
                    <div className="text-[11px] text-slate-500">
                      Instantly test multi-role authorization and statutory approvals:
                    </div>
                  </div>
                  <div className="py-1 space-y-1">
                    {quickUsers.map((u) => {
                      const isCurrent = currentUser?.id === u.id;
                      return (
                        <button
                          key={u.id}
                          onClick={() => handleSwitchUser(u)}
                          className={`w-full text-left p-2 rounded text-xs transition-colors flex items-start gap-2.5 ${
                            isCurrent
                              ? 'bg-slate-100 border border-slate-300 font-semibold text-slate-900'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                              u.role === 'ADMIN'
                                ? 'bg-purple-100 text-purple-700'
                                : u.role === 'REVIEWER'
                                ? u.canApprove
                                  ? 'bg-teal-100 text-teal-700'
                                  : 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {u.role[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 flex items-center justify-between">
                              <span>{u.name}</span>
                              {isCurrent && <span className="text-[10px] text-emerald-600 font-bold">Active</span>}
                            </div>
                            <div className="text-[11px] text-slate-500 leading-tight">{u.designation}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Body: Sidebar + Viewport */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Collapsible Sidebar */}
        <aside
          className={`hidden lg:flex flex-col bg-[#0b1f3a] text-slate-300 border-r border-[#15345b] transition-all duration-300 shrink-0 select-none ${
            sidebarCollapsed ? 'w-16' : 'w-64'
          }`}
        >
          {/* Navigation Groups */}
          <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
            {navSections.map((sec, idx) => {
              const visibleItems = sec.items.filter((item) => item.roles.includes(role));
              if (visibleItems.length === 0) return null;

              return (
                <div key={idx} className="space-y-1">
                  {!sidebarCollapsed && (
                    <div className="px-3 text-[10px] font-semibold text-slate-400 tracking-wider uppercase">
                      {sec.title}
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = activeNav === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNavClick(item.id)}
                          title={sidebarCollapsed ? item.label : undefined}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs transition-colors ${
                            isActive
                              ? 'bg-[#15345b] text-white font-semibold shadow-xs border-l-2 border-[#0f8b8d]'
                              : 'text-slate-300 hover:text-white hover:bg-white/5'
                          } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                        >
                          <span className={isActive ? 'text-[#0f8b8d]' : 'text-slate-400'}>{item.icon}</span>
                          {!sidebarCollapsed && (
                            <span className="flex-1 text-left truncate">{item.label}</span>
                          )}
                          {!sidebarCollapsed && item.badgeCount !== undefined && item.badgeCount > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 tabular-nums">
                              {item.badgeCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Institutional Integrity Stamp at bottom of sidebar */}
          {!sidebarCollapsed && (
            <div className="p-3 m-2 rounded bg-white/5 border border-white/10 text-[11px] text-slate-400 space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0f8b8d]" />
                <span>Regulatory Hardened</span>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-400">
                All statutory decisions require atomic OCC commits and auditable justification.
              </p>
            </div>
          )}
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative w-72 bg-[#0b1f3a] text-slate-300 flex flex-col h-full shadow-2xl p-4 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded bg-[#0f8b8d] flex items-center justify-center text-white">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-sm text-white">AICTE Regulatory</span>
                </div>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto space-y-4">
                {navSections.map((sec, idx) => {
                  const visibleItems = sec.items.filter((item) => item.roles.includes(role));
                  if (visibleItems.length === 0) return null;

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="px-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        {sec.title}
                      </div>
                      <div className="space-y-0.5">
                        {visibleItems.map((item) => {
                          const isActive = activeNav === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleNavClick(item.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs ${
                                isActive
                                  ? 'bg-[#15345b] text-white font-semibold'
                                  : 'text-slate-300 hover:bg-white/5'
                              }`}
                            >
                              <span className={isActive ? 'text-[#0f8b8d]' : 'text-slate-400'}>
                                {item.icon}
                              </span>
                              <span className="flex-1 text-left">{item.label}</span>
                              {item.badgeCount !== undefined && item.badgeCount > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500 text-slate-950">
                                  {item.badgeCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Primary Viewport */}
        <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
          {/* Breadcrumbs Sub-Header */}
          <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-1.5 flex-wrap">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                  <span
                    className={
                      idx === breadcrumbs.length - 1
                        ? 'font-semibold text-slate-800'
                        : 'text-slate-500 hover:text-slate-700'
                    }
                  >
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </div>

            {/* Quick Session Indicator */}
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Live Regulatory Database Connected</span>
              <span>·</span>
              <span className="font-mono">Academic Year 2026-27</span>
            </div>
          </div>

          {/* Child Viewport Content */}
          <main className="flex-1 p-4 lg:p-6">{children}</main>

          {/* Standard Regulatory Footer */}
          <footer className="bg-white border-t border-slate-200 py-4 px-6 text-slate-500 text-xs">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="font-semibold text-slate-800">
                  All India Council for Technical Education (AICTE)
                </span>
                <span>·</span>
                <span>Regulation Bureau</span>
                <span>·</span>
                <span>Document Authentication & Regulatory Verification Engine</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>Synthetic Demonstration Environment</span>
                <span>·</span>
                <span>No Official Endorsement Implied</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};
