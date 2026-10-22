import React, { useState, useEffect } from 'react';
import { User } from './types/index.ts';
import { api } from './services/api.ts';
import { AppShell } from './components/common/AppShell.tsx';
import { ToastNotification, ToastMessage } from './components/common/ToastNotification.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { ApplicationsView } from './components/ApplicationsView.tsx';
import { InspectionDeskView } from './components/InspectionDeskView.tsx';
import { FdrVerificationView } from './components/FdrVerificationView.tsx';
import { ForensicsView } from './components/ForensicsView.tsx';
import { AdminRulesView } from './components/AdminRulesView.tsx';
import { AuditLogView } from './components/AuditLogView.tsx';
import { ReportModal } from './components/ReportModal.tsx';
import { CreateApplicationModal } from './components/CreateApplicationModal.tsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [demoRoleSwitchEnabled, setDemoRoleSwitchEnabled] = useState(false);
  const [activeNav, setActiveNav] = useState<string>('dashboard');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [reportAppId, setReportAppId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showCreateAppModal, setShowCreateAppModal] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    api
      .getMe()
      .then((res) => {
        setCurrentUser(res.user);
        setDemoRoleSwitchEnabled(res.demoRoleSwitchEnabled);
      })
      .catch((err) => {
        console.error('Failed to get current user session', err);
      });
  }, []);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleNavigateToApplications = (status?: string) => {
    setFilterStatus(status || '');
    setSelectedAppId(null);
    setActiveNav('applications');
  };

  const handleOpenApplicationDetail = (appId: string) => {
    setSelectedAppId(appId);
    setActiveNav('applications');
  };

  const handleOpenInspectionDesk = (appId: string) => {
    setSelectedAppId(appId);
    setActiveNav('inspection');
  };

  // Generate dynamic breadcrumb path
  const getBreadcrumbs = () => {
    switch (activeNav) {
      case 'dashboard':
        return ['AICTE Portal', 'Regulatory Overview', 'Dashboard'];
      case 'applications':
        return selectedAppId
          ? ['AICTE Portal', 'Applications Management', selectedAppId]
          : ['AICTE Portal', 'Applications Management', 'All Applications'];
      case 'document-repository':
        return ['AICTE Portal', 'Applications', 'Document Repository'];
      case 'validation-reports':
        return ['AICTE Portal', 'Regulatory Validation', 'Compliance Reports'];
      case 'fdr-verification':
        return ['AICTE Portal', 'Financial Verification Desk', 'FDR & Endowment Instruments'];
      case 'inspection':
        return selectedAppId
          ? ['AICTE Portal', 'Reviewer Scrutiny Desk', selectedAppId]
          : ['AICTE Portal', 'Reviewer Scrutiny Desk', 'Split-Screen Evidence'];
      case 'forensics':
        return ['AICTE Portal', 'Document Authenticity', 'Anomaly & Forensics Inspection'];
      case 'escalations':
        return ['AICTE Portal', 'Governance Oversight', 'Escalations Queue'];
      case 'audit-logs':
        return ['AICTE Portal', 'Governance Oversight', 'Statutory Audit Trail'];
      case 'admin-rules':
      case 'user-management':
        return ['AICTE Portal', 'Administration', 'Regulatory Rules & Parameters'];
      case 'notifications':
        return ['AICTE Portal', 'Regulatory Oversight', 'Notifications & Alerts'];
      default:
        return ['AICTE Portal', 'Dashboard'];
    }
  };

  return (
    <AppShell
      currentUser={currentUser}
      demoRoleSwitchEnabled={demoRoleSwitchEnabled}
      onUserChanged={(u) => {
        setCurrentUser(u);
        addToast({
          type: 'INFO',
          title: 'User Profile Switched',
          message: `Active session updated to ${u.name} (${u.role} - ${u.designation || 'Staff'}).`,
        });
      }}
      activeNav={activeNav}
      onNavigate={(navId) => {
        setActiveNav(navId);
        if (navId !== 'applications' && navId !== 'inspection') {
          setSelectedAppId(null);
        }
      }}
      breadcrumbs={getBreadcrumbs()}
      unreadNotificationCount={0}
      onOpenNewApplication={() => setShowCreateAppModal(true)}
    >
      {/* Toast Notification Container */}
      <ToastNotification toasts={toasts} onDismiss={handleDismissToast} />

      {!currentUser ? (
        <section className="mx-auto mt-16 max-w-2xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Authentication required</h1>
          <p className="mt-3 text-sm text-slate-600">
            {demoRoleSwitchEnabled
              ? 'Choose a local synthetic identity from the role selector to continue.'
              : 'Sign in through the configured identity provider to access applications and documents.'}
          </p>
        </section>
      ) : (
      <>
      {/* Primary Workspace Route Routing */}
      {activeNav === 'dashboard' && (
        <DashboardView
          currentUser={currentUser}
          onNavigateToApplications={handleNavigateToApplications}
          onOpenApplicationDetail={handleOpenApplicationDetail}
        />
      )}

      {(activeNav === 'applications' || activeNav === 'document-repository' || activeNav === 'validation-reports') && (
        <ApplicationsView
          currentUser={currentUser}
          initialFilterStatus={filterStatus}
          selectedApplicationId={selectedAppId}
          onSelectApplication={(id) => setSelectedAppId(id)}
          onOpenInspectionDesk={handleOpenInspectionDesk}
          onOpenReportModal={(id) => setReportAppId(id)}
        />
      )}

      {activeNav === 'fdr-verification' && (
        <FdrVerificationView
          currentUser={currentUser}
          onOpenApplication={handleOpenApplicationDetail}
        />
      )}

      {activeNav === 'inspection' && (
        <InspectionDeskView
          currentUser={currentUser}
          initialApplicationId={selectedAppId}
          onOpenReportModal={(id) => setReportAppId(id)}
        />
      )}

      {activeNav === 'forensics' && (
        <ForensicsView currentUser={currentUser} />
      )}

      {(activeNav === 'escalations' || activeNav === 'audit-logs' || activeNav === 'notifications') && (
        <AuditLogView
          currentUser={currentUser}
          onOpenApplication={handleOpenApplicationDetail}
        />
      )}

      {(activeNav === 'admin-rules' || activeNav === 'user-management') && (
        <AdminRulesView currentUser={currentUser} />
      )}

      {/* Printable Report Modal */}
      {reportAppId && (
        <ReportModal applicationId={reportAppId} onClose={() => setReportAppId(null)} />
      )}

      {/* Multi-Step Application Creation Modal */}
      {showCreateAppModal && (
        <CreateApplicationModal
          currentUser={currentUser}
          onClose={() => setShowCreateAppModal(false)}
          onApplicationCreated={(appId) => {
            setShowCreateAppModal(false);
            setSelectedAppId(appId);
            setActiveNav('applications');
            addToast({
              type: 'SUCCESS',
              title: 'Application Created Successfully',
              message: `Regulatory application record ${appId} created in this prototype session.`,
            });
          }}
        />
      )}
      </>
      )}
    </AppShell>
  );
}
