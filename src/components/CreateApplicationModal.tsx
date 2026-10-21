import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Building,
  GraduationCap,
  FileText,
  Upload,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { ApplicationCategory, Institution, User } from '../types/index.ts';
import { api } from '../services/api.ts';

interface CreateApplicationModalProps {
  currentUser: User | null;
  onClose: () => void;
  onApplicationCreated: (appId: string) => void;
}

export const CreateApplicationModal: React.FC<CreateApplicationModalProps> = ({
  currentUser,
  onClose,
  onApplicationCreated,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [institutionName, setInstitutionName] = useState('Delhi Institute of Technology & Science');
  const [permanentId, setPermanentId] = useState('1-109283741');
  const [state, setState] = useState('Delhi');
  const [district] = useState('South West Delhi');
  const [category, setCategory] = useState<ApplicationCategory>('Extension of Approval');
  const [academicYear] = useState('2026-2027');
  const [proposedProgramme, setProposedProgramme] = useState('B.Tech in Artificial Intelligence & Data Science');
  const [proposedIntake, setProposedIntake] = useState<number>(120);
  const [notes, setNotes] = useState('Annual extension application with compliance to APH 2026-27 norms.');

  const categories: ApplicationCategory[] = [
    'Extension of Approval',
    'New Programme or Course',
    'Approved Intake Change',
    'Institution Information Update',
    'Faculty Information Update',
    'Infrastructure Information Update',
    'Other Approval-Related Changes',
  ];

  const handleNextStep = () => {
    setError(null);
    if (currentStep === 1) {
      if (!institutionName.trim() || !permanentId.trim()) {
        setError('Please fill in required institution name and AICTE Permanent ID.');
        return;
      }
    }
    if (currentStep === 2) {
      if (!category) {
        setError('Please select an application category.');
        return;
      }
    }
    if (currentStep === 3) {
      if (proposedIntake <= 0) {
        setError('Proposed intake must be greater than zero.');
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, 6));
  };

  const handlePrevStep = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (submitForValidation: boolean) => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.createApplication({
        category,
        proposedIntake,
        proposedProgramme,
        notes,
        academicYear,
      });

      if (res.success && res.application) {
        if (submitForValidation) {
          await api.submitApplication(res.application.id);
        }
        onApplicationCreated(res.application.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create application');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { number: 1, label: 'Institution Info' },
    { number: 2, label: 'Category' },
    { number: 3, label: 'Programme & Intake' },
    { number: 4, label: 'Document Checklist' },
    { number: 5, label: 'Review Details' },
    { number: 6, label: 'Submit / Draft' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in-50 zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 bg-[#15345b] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#0f8b8d] flex items-center justify-center text-white">
              <Building className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Create Regulatory Approval Application</h2>
              <div className="text-[11px] text-teal-200">
                Academic Year {academicYear} · Approval Process Handbook (APH)
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[500px]">
            {steps.map((st) => {
              const isPassed = currentStep > st.number;
              const isCurrent = currentStep === st.number;

              return (
                <div key={st.number} className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isPassed
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-[#15345b] text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isPassed ? <CheckCircle2 className="w-4 h-4" /> : st.number}
                  </div>
                  <span
                    className={`text-xs ${
                      isCurrent ? 'font-bold text-slate-900' : 'text-slate-500'
                    }`}
                  >
                    {st.label}
                  </span>
                  {st.number < steps.length && (
                    <div className="w-6 h-0.5 bg-slate-200 ml-2" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 text-xs text-slate-700">
          {/* Step 1: Institution Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Step 1: Institutional Identification</h3>
                <p className="text-slate-500 mt-0.5">
                  Confirm the permanent AICTE identifier and official registered institution name.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    AICTE Permanent Institute ID (PID) *
                  </label>
                  <input
                    type="text"
                    value={permanentId}
                    onChange={(e) => setPermanentId(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded font-mono text-xs focus:border-[#15345b] focus:outline-hidden"
                    placeholder="e.g. 1-109283741"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Must match the PID endorsed in previous Extension of Approvals.
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Registered Institution Name *
                  </label>
                  <input
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded text-xs focus:border-[#15345b] focus:outline-hidden"
                    placeholder="e.g. Delhi Institute of Technology & Science"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">State / UT</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded text-xs focus:border-[#15345b] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">District</label>
                  <input
                    type="text"
                    value={district}
                    disabled
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded text-xs text-slate-600"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Application Category */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Step 2: Select Regulatory Approval Category</h3>
                <p className="text-slate-500 mt-0.5">
                  Select the specific approval type sought under the Approval Process Handbook.
                </p>
              </div>

              <div className="space-y-2">
                {categories.map((cat) => (
                  <label
                    key={cat}
                    className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors ${
                      category === cat
                        ? 'border-[#0f8b8d] bg-teal-50/50 font-semibold text-slate-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="appCategory"
                      checked={category === cat}
                      onChange={() => setCategory(cat)}
                      className="text-[#0f8b8d] focus:ring-[#0f8b8d]"
                    />
                    <div>
                      <div className="text-xs">{cat}</div>
                      <div className="text-[11px] text-slate-500 font-normal">
                        {cat === 'Extension of Approval'
                          ? 'Annual continuation for existing approved technical programs.'
                          : cat === 'New Programme or Course'
                          ? 'Addition of new UG/PG specialization or branch.'
                          : 'Administrative / infrastructure regulatory modification.'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Programme & Intake Details */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Step 3: Programme & Intake Specification</h3>
                <p className="text-slate-500 mt-0.5">
                  Specify the academic programme and student intake ceiling.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Proposed / Continued Programme Name *
                  </label>
                  <input
                    type="text"
                    value={proposedProgramme}
                    onChange={(e) => setProposedProgramme(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded text-xs focus:border-[#15345b] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Proposed Intake Capacity (Seats) *
                  </label>
                  <input
                    type="number"
                    value={proposedIntake}
                    onChange={(e) => setProposedIntake(parseInt(e.target.value, 10) || 0)}
                    className="w-full p-2.5 border border-slate-300 rounded text-xs font-mono focus:border-[#15345b] focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Student-to-faculty ratio requirement: Minimum 1 faculty per 20 students.
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Application Scrutiny Notes & Justification
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded text-xs focus:border-[#15345b] focus:outline-hidden"
                    placeholder="Enter any additional representations for the scrutiny committee..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Supporting Documents Checklist */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Step 4: Statutory Document Checklist</h3>
                <p className="text-slate-500 mt-0.5">
                  Confirm mandatory documents that will be verified during automated scrutiny.
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                {[
                  {
                    type: 'Fire Safety NOC',
                    status: 'Mandatory',
                    desc: 'Issued by State Fire Directorate with forward validity',
                  },
                  {
                    type: 'Building Occupancy Certificate',
                    status: 'Mandatory',
                    desc: 'Sanctioned by competent town planning authority',
                  },
                  {
                    type: 'Fixed Deposit Receipt (FDR / Endowment)',
                    status: 'Mandatory',
                    desc: 'Joint unencumbered deposit with AICTE Regional Office',
                  },
                  {
                    type: 'Faculty Cadre & Ratio List',
                    status: 'Mandatory',
                    desc: 'Certified faculty roster conforming to statutory cadre ratio',
                  },
                  {
                    type: 'Affiliation Letter',
                    status: 'Mandatory',
                    desc: 'Annual or permanent affiliation by affiliating university',
                  },
                ].map((doc, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between bg-white">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-800">{doc.type}</div>
                      <div className="text-[11px] text-slate-500">{doc.desc}</div>
                    </div>
                    <span className="text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded text-[11px]">
                <strong>Note on Document Uploads:</strong> Files can be uploaded in PDF format immediately after saving this application draft. Each file will undergo SHA-256 integrity hashing and OCR extraction.
              </div>
            </div>
          )}

          {/* Step 5: Review Entered Information */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Step 5: Review Application Summary</h3>
                <p className="text-slate-500 mt-0.5">
                  Please verify all submitted institutional details prior to dispatching to the regulatory queue.
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-slate-500 block">AICTE Permanent ID:</span>
                    <span className="font-mono font-bold text-slate-800">{permanentId}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Institution Name:</span>
                    <span className="font-semibold text-slate-800">{institutionName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Approval Category:</span>
                    <span className="font-medium text-slate-800">{category}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Academic Year:</span>
                    <span className="font-medium text-slate-800">{academicYear}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Programme Name:</span>
                    <span className="font-medium text-slate-800">{proposedProgramme}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Proposed Intake:</span>
                    <span className="font-mono font-bold text-slate-800">{proposedIntake} Seats</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-800">Scrutiny Representation:</span> {notes}
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Submit / Draft Confirmation */}
          {currentStep === 6 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-teal-50 text-[#0f8b8d] flex items-center justify-center mx-auto border border-teal-200">
                <ShieldCheck className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900">Ready to Persist Application Record</h3>
                <p className="text-slate-500 max-w-md mx-auto mt-1">
                  Choose whether to save as an editable draft or immediately queue for automated regulatory rule validation.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                <button
                  disabled={loading}
                  onClick={() => handleSubmit(false)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded border border-slate-300 hover:bg-slate-50 font-semibold text-slate-700 transition-colors"
                >
                  Save as Draft Only
                </button>
                <button
                  disabled={loading}
                  onClick={() => handleSubmit(true)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded bg-[#0f8b8d] hover:bg-[#0c7274] text-white font-semibold shadow-xs transition-colors"
                >
                  {loading ? 'Submitting...' : 'Submit & Trigger Validation Engine'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            disabled={currentStep === 1 || loading}
            onClick={handlePrevStep}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-slate-300 bg-white transition-colors ${
              currentStep === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <div className="text-[11px] text-slate-400">
            Step {currentStep} of {steps.length}
          </div>

          {currentStep < 6 && (
            <button
              type="button"
              onClick={handleNextStep}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-[#15345b] hover:bg-[#0b1f3a] text-white transition-colors"
            >
              <span>Next</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
