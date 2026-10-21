import React, { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { DashboardMetrics, User, Application } from '../types/index.ts';
import {
  FileSpreadsheet,
  AlertOctagon,
  Clock,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Award,
  AlertTriangle,
  FolderOpen,
  Filter,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { StatusBadge } from './common/StatusBadge.tsx';

interface DashboardViewProps {
  currentUser: User | null;
  onNavigateToApplications: (filterStatus?: string) => void;
  onOpenApplicationDetail: (applicationId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  onNavigateToApplications,
  onOpenApplicationDetail,
}) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [academicYearFilter, setAcademicYearFilter] = useState('2026-2027');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [mRes, aRes] = await Promise.all([
        api.getDashboardMetrics(),
        api.getApplications(),
      ]);
      setMetrics(mRes.metrics);
      setApplications(aRes.applications);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !metrics) {
    return (
      <div className="max-w-7xl mx-auto py-12 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-28 bg-slate-200 rounded-lg" />
            ))}
          </div>
          <div className="h-64 bg-slate-200 rounded-lg" />
        </div>
      </div>
    );
  }

  // Filtered applications list
  const filteredApps = applications.filter((app) => {
    if (academicYearFilter !== 'ALL' && app.academicYear !== academicYearFilter) return false;
    if (categoryFilter !== 'ALL' && app.category !== categoryFilter) return false;
    if (statusFilter !== 'ALL' && app.status !== statusFilter) return false;
    return true;
  });

  // Chart data: Applications by Status
  const statusChartData = [
    { name: 'Completed', count: metrics.applicationsByStatus.REVIEW_COMPLETED || 0, fill: '#16845B' },
    { name: 'Under Review', count: metrics.applicationsByStatus.UNDER_HUMAN_REVIEW || 0, fill: '#0F8B8D' },
    { name: 'Deficiencies', count: metrics.applicationsByStatus.DEFICIENCIES_FOUND || 0, fill: '#C03945' },
    { name: 'Submitted', count: metrics.applicationsByStatus.SUBMITTED || 0, fill: '#2563EB' },
    { name: 'Draft', count: metrics.applicationsByStatus.DRAFT || 0, fill: '#94A3B8' },
  ];

  // Chart data: Findings by Severity
  const severityChartData = [
    { name: 'Critical', count: metrics.findingsBySeverity.CRITICAL || 0, color: '#C03945' },
    { name: 'Major', count: metrics.findingsBySeverity.MAJOR || 0, color: '#EA580C' },
    { name: 'Moderate', count: metrics.findingsBySeverity.MODERATE || 0, color: '#B7791F' },
    { name: 'Minor', count: metrics.findingsBySeverity.MINOR || 0, color: '#2563EB' },
    { name: 'Info', count: metrics.findingsBySeverity.INFORMATIONAL || 0, color: '#64748B' },
  ];

  // Chart data: Verification outcomes
  const verificationChartData = [
    { name: 'Simulated Verified', value: 8, color: '#16845B' },
    { name: 'Pending Review', value: 4, color: '#B7791F' },
    { name: 'Conflict / Mismatch', value: 2, color: '#C03945' },
    { name: 'Source Unavailable', value: 1, color: '#64748B' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded uppercase tracking-wider border border-teal-200">
              National Council Monitoring Dashboard
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-mono">APH Cycle {academicYearFilter}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#15345b] mt-1">
            Regulatory Overview
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor applications, verification activities, and unresolved compliance findings.
          </p>
        </div>

        {/* Global Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={academicYearFilter}
              onChange={(e) => setAcademicYearFilter(e.target.value)}
              className="bg-transparent text-slate-700 font-medium focus:outline-hidden text-xs"
            >
              <option value="2026-2027">AY 2026-2027</option>
              <option value="ALL">All Academic Years</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2.5 py-1.5">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent text-slate-700 font-medium focus:outline-hidden text-xs"
            >
              <option value="ALL">All Categories</option>
              <option value="Extension of Approval">Extension of Approval</option>
              <option value="New Programme or Course">New Programme</option>
              <option value="Approved Intake Change">Intake Change</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2.5 py-1.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-slate-700 font-medium focus:outline-hidden text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="UNDER_HUMAN_REVIEW">Under Human Review</option>
              <option value="DEFICIENCIES_FOUND">Deficiencies Found</option>
              <option value="REVIEW_COMPLETED">Review Completed</option>
              <option value="DUPLICATE_CONFLICT_REVIEW">Duplicate Conflict</option>
              <option value="EXPIRING_TODAY">Expiring Today</option>
            </select>
          </div>

          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 6 Core KPI Cards (Section 5) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Card 1: Total Applications */}
        <div
          onClick={() => onNavigateToApplications()}
          className="bg-white border-l-4 border-l-[#15345b] border border-slate-200 rounded-lg p-3.5 shadow-xs cursor-pointer hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase">
            <span>Total Submissions</span>
            <FileSpreadsheet className="w-4 h-4 text-[#15345b]" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {metrics.totalApplications}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">10 technical institutes</div>
        </div>

        {/* Card 2: Under Human Review */}
        <div
          onClick={() => onNavigateToApplications('UNDER_HUMAN_REVIEW')}
          className="bg-white border-l-4 border-l-[#0f8b8d] border border-slate-200 rounded-lg p-3.5 shadow-xs cursor-pointer hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase">
            <span>Under Review</span>
            <Clock className="w-4 h-4 text-[#0f8b8d]" />
          </div>
          <div className="text-2xl font-bold text-[#0f8b8d] mt-1.5 tabular-nums">
            {metrics.applicationsRequiringReview}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Scrutiny desk queue</div>
        </div>

        {/* Card 3: Open Deficiencies */}
        <div
          onClick={() => onNavigateToApplications('DEFICIENCIES_FOUND')}
          className="bg-white border-l-4 border-l-rose-600 border border-slate-200 rounded-lg p-3.5 shadow-xs cursor-pointer hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase">
            <span>Open Deficiencies</span>
            <AlertOctagon className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-600 mt-1.5 tabular-nums">
            {metrics.openFindingsCount}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Unresolved findings</div>
        </div>

        {/* Card 4: Pending Verification */}
        <div
          onClick={() => onNavigateToApplications('VERIFICATION_PENDING')}
          className="bg-white border-l-4 border-l-blue-600 border border-slate-200 rounded-lg p-3.5 shadow-xs cursor-pointer hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase">
            <span>Pending Source</span>
            <FolderOpen className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-600 mt-1.5 tabular-nums">
            {metrics.applicationsByStatus.VERIFICATION_PENDING || 2}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Awaiting bank/NOC</div>
        </div>

        {/* Card 5: Potential Anomalies */}
        <div
          onClick={() => onNavigateToApplications('DEFICIENCIES_FOUND')}
          className="bg-white border-l-4 border-l-amber-600 border border-slate-200 rounded-lg p-3.5 shadow-xs cursor-pointer hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase">
            <span>Potential Anomalies</span>
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-1.5 tabular-nums">
            3
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Tampering & Hash check</div>
        </div>

        {/* Card 6: Escalations Requiring Attention */}
        <div
          onClick={() => onNavigateToApplications('EXPIRING_TODAY')}
          className="bg-white border-l-4 border-l-purple-600 border border-slate-200 rounded-lg p-3.5 shadow-xs cursor-pointer hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase">
            <span>Escalations</span>
            <AlertTriangle className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-600 mt-1.5 tabular-nums">
            2
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Same-day expiry & duplicate</div>
        </div>
      </div>

      {/* Recharts Data Visualization Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Applications by Status */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Applications by Status
            </h3>
            <span className="text-[11px] text-slate-400">AY 2026-27</span>
          </div>
          <div className="h-56 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} interval={0} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', fontSize: '11px', borderRadius: '6px' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Findings by Severity */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Findings by Severity
            </h3>
            <span className="text-[11px] text-slate-400">{metrics.openFindingsCount} Open</span>
          </div>
          <div className="h-56 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', fontSize: '11px', borderRadius: '6px' }}
                />
                <Bar dataKey="count" fill="#EA580C" radius={[4, 4, 0, 0]}>
                  {severityChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Verification Outcomes */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Verification Outcomes
            </h3>
            <span className="text-[11px] text-slate-400">Direct Sources</span>
          </div>
          <div className="h-56 w-full text-xs flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={verificationChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                >
                  {verificationChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', fontSize: '11px', borderRadius: '6px' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Table (Section 5) */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Recent Application Scrutiny Activity
            </h3>
            <span className="text-[11px] text-slate-500">
              Live updates from regulatory database
            </span>
          </div>

          <button
            onClick={() => onNavigateToApplications()}
            className="text-xs font-semibold text-[#0f8b8d] hover:text-[#0b6b6d] flex items-center gap-1 transition-colors"
          >
            <span>View All Records</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Application Reference</th>
                <th className="py-2.5 px-4">Institution Name</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Academic Year</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Last Updated</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredApps.slice(0, 6).map((app) => (
                <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {app.applicationNumber}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800 truncate max-w-[220px]">
                    {app.institutionName}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{app.category}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{app.academicYear}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                    {new Date(app.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => onOpenApplicationDetail(app.id)}
                      className="px-2.5 py-1 text-xs font-semibold text-[#15345b] hover:bg-slate-100 border border-slate-300 rounded transition-colors"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
