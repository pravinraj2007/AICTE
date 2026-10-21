import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import { Application, DocumentRecord, User } from '../types/index.ts';
import {
  ShieldAlert,
  SearchCheck,
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileSearch,
  Layers,
  Info,
} from 'lucide-react';

interface ForensicsViewProps {
  currentUser: User | null;
}

export const ForensicsView: React.FC<ForensicsViewProps> = ({ currentUser }) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedAppId, setSelectedAppId] = useState('app-2');
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Infrastructure evidence gallery sample
  const samplePhotos = [
    {
      id: 'photo-1',
      title: 'Advanced AI & High Performance Computing Lab',
      roomNumber: 'Block C - Lab 304',
      carpetAreaSqM: '142 sq.m (Reported)',
      geoTag: '28.5921° N, 77.0460° E (Dwarka, New Delhi)',
      observation:
        'Preliminary observation: Visual evidence displays 40 instructional workstations and server rack configuration. Notice: Exact room dimensions, power backups, and software license compliance cannot be certified from photograph alone and require physical scrutiny inspection.',
    },
    {
      id: 'photo-2',
      title: 'Robotics & Automation Mechatronics Centre',
      roomNumber: 'Mechanical Block - Hall B',
      carpetAreaSqM: '210 sq.m (Reported)',
      geoTag: '18.5913° N, 73.7389° E (Hinjawadi, Pune)',
      observation:
        'Preliminary observation: Visual evidence exhibits 6-axis robotic arm testbeds and pneumatic workbenches. Notice: Equipment operational status, safety guarding compliance, and fire suppression access require on-site technical inspection.',
    },
    {
      id: 'photo-3',
      title: 'Central Digital Library & Reading Stacks',
      roomNumber: 'Main Building - 2nd Floor',
      carpetAreaSqM: '420 sq.m (Reported)',
      geoTag: '12.8399° N, 77.6770° E (Electronic City, Bengaluru)',
      observation:
        'Preliminary observation: Stacks and digital terminal kiosks visible. Physical book catalog inventory and subscription access verification pending.',
    },
  ];

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    if (selectedAppId) {
      loadAnomalies(selectedAppId);
    }
  }, [selectedAppId]);

  const loadApps = async () => {
    try {
      const res = await api.getApplications();
      setApplications(res.applications);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAnomalies = async (appId: string) => {
    try {
      setLoading(true);
      const res = await api.getAnomalies(appId);
      setAnomalies(res.anomalies);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f294a]">
            Document Forensics & Infrastructure Evidence Analysis
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Explainable preliminary anomaly detection, cryptographic file collisions, chronological coherence, and physical evidence scrutiny.
          </p>
        </div>

        {/* Application selector */}
        <div className="flex items-center gap-2 text-xs">
          <label className="font-medium text-slate-700">Inspect Application:</label>
          <select
            value={selectedAppId}
            onChange={(e) => setSelectedAppId(e.target.value)}
            className="p-2 border border-slate-300 rounded bg-white text-slate-800 font-semibold"
          >
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.applicationNumber} · {a.institutionName.slice(0, 30)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Forensic Legal & Technical Principles Callout */}
      <div className="bg-slate-50 border border-slate-200 p-5 rounded-lg text-xs text-slate-700 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <Info className="w-4 h-4 text-[#0f294a]" />
          <span>Forensic Evaluation Principles & Anti-Prejudice Safeguards:</span>
        </div>
        <p className="leading-relaxed">
          The forensic pipeline performs <strong>probabilistic, explainable preliminary checks</strong> only. No document is labeled as forged by automated tools. Legitimate factors such as scanning DPI, multi-generation PDF compression, OCR font substitutions, or administrative reissuance can cause metadata variances. Findings are designated as <em>"Potential Anomaly — Manual Verification Required"</em> or <em>"Inconclusive"</em>.
        </p>
      </div>

      {/* Anomaly Detection Results Grid */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SearchCheck className="w-5 h-5 text-blue-700" />
            <h2 className="text-base font-semibold text-slate-900">
              Automated Forensic Screening Report
            </h2>
          </div>
          <span className="text-xs font-semibold tabular-nums text-slate-600">
            {anomalies.length} anomaly flags
          </span>
        </div>

        {loading ? (
          <div className="text-center py-8 text-xs text-slate-400">
            Analyzing cryptographic digests and metadata chronologies...
          </div>
        ) : anomalies.length === 0 ? (
          <div className="text-center py-8 text-xs text-emerald-800 bg-emerald-50 rounded border border-emerald-200">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
            No chronological, cryptographic, or payload anomalies detected in uploaded files.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {anomalies.map((ano, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg border border-amber-200 bg-amber-50/40 text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 font-mono text-[11px]">
                    {ano.anomalyType}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900">
                    {ano.severity} PRIORITY
                  </span>
                </div>

                <div className="text-slate-900 font-medium">
                  {ano.observedEvidence}
                </div>

                <div className="text-slate-600 text-[11px]">
                  <strong>Detection Method:</strong> {ano.detectionMethod}
                </div>

                <div className="bg-white p-2.5 rounded border border-amber-200/80 text-[11px] text-slate-600">
                  <strong>Reliability & Scanning Limitation:</strong> {ano.reliabilityLimitation}
                </div>

                <div className="text-[11px] text-blue-900 font-medium pt-1">
                  <strong>Recommended Next Step:</strong> {ano.recommendedNextStep}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Infrastructure Photographic Evidence Analysis */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-teal-700" />
            <h2 className="text-base font-semibold text-slate-900">
              Infrastructure Evidence Scrutiny
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Conservative Observations & Physical Verification Mandate
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {samplePhotos.map((photo) => (
            <div
              key={photo.id}
              className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex flex-col justify-between"
            >
              {/* Simulated photo preview container */}
              <div className="h-44 bg-gradient-to-br from-slate-800 to-slate-900 p-4 text-white flex flex-col justify-between relative">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700 text-emerald-400 font-mono">
                    GEO-TAG VERIFIED
                  </span>
                  <span className="text-slate-300 font-mono text-[10px]">300 DPI COLOR</span>
                </div>
                <div className="text-center my-auto">
                  <Camera className="w-8 h-8 mx-auto text-slate-400 mb-1" />
                  <span className="text-xs font-semibold text-slate-200">{photo.title}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate">
                  {photo.geoTag}
                </div>
              </div>

              {/* Observation & Disclaimer Card */}
              <div className="p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-900">
                  <span>{photo.roomNumber}</span>
                  <span className="text-slate-500 font-normal">{photo.carpetAreaSqM}</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed bg-white p-2.5 rounded border border-slate-200">
                  {photo.observation}
                </p>
                <div className="text-[10px] text-amber-800 font-medium">
                  Status: Conservative Observation · Physical Committee Visit Recommended
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
