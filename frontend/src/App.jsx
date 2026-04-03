import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import LandingPage from './components/LandingPage';
import AuthModal from './components/AuthModal';
import RoleSelector from './components/RoleSelector';
import SkillInput from './components/SkillInput';
import GapReport from './components/GapReport';
import KnowledgeGraph from './components/KnowledgeGraph';
import StudyPlan from './components/StudyPlan';
import {
  authMe,
  authLogout,
  deleteStudySession,
  fetchStudySessions,
  fetchStudySession,
  saveStudySession,
} from './utils/sessionApi';

const STEPS = {
  LANDING: 'landing',
  SELECT_ROLE: 'select_role',
  INPUT_SKILLS: 'input_skills',
  GAP_REPORT: 'gap_report',
  KNOWLEDGE_GRAPH: 'knowledge_graph',
  STUDY_PLAN: 'study_plan',
};

const STEP_LABELS = [
  { key: STEPS.SELECT_ROLE, label: 'Choose Role', num: 1 },
  { key: STEPS.INPUT_SKILLS, label: 'Rate Skills', num: 2 },
  { key: STEPS.GAP_REPORT, label: 'Gap Report', num: 3 },
  { key: STEPS.KNOWLEDGE_GRAPH, label: 'Knowledge Graph', num: 4 },
  { key: STEPS.STUDY_PLAN, label: 'Study Plan', num: 5 },
];

function getStepIndex(step) {
  const idx = STEP_LABELS.findIndex((s) => s.key === step);
  return idx >= 0 ? idx : -1;
}

function App() {
  const [step, setStep] = useState(STEPS.LANDING);
  const [selectedRole, setSelectedRole] = useState(null);
  const [roleSkills, setRoleSkills] = useState(null);
  const [gapReport, setGapReport] = useState(null);
  const [studyData, setStudyData] = useState(null);

  const [user, setUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [sessions, setSessions] = useState([]);
  const saveTimerRef = useRef(null);
  const furthestStepRef = useRef(STEPS.LANDING);
  // Keep auth callback result stable across StrictMode double effects.
  const authCallbackRef = useRef(new URLSearchParams(window.location.search).get('auth'));

  const canPersist = useMemo(
    () => Boolean(user && selectedRole && step !== STEPS.LANDING),
    [user, selectedRole, step]
  );

  const persistState = async (nextStepKey) => {
    if (!user || !selectedRole) return;
    if (!nextStepKey || nextStepKey === STEPS.LANDING) return;

    const roleId = selectedRole.id;
    const roleTitle = selectedRole.title;

    const state = {
      selectedRole,
      roleSkills,
      gapReport,
      studyData,
    };

    const session_id = await saveStudySession({
      roleId,
      roleTitle,
      stepKey: nextStepKey,
      state,
    });
    return session_id;
  };

  const queuePersistState = (nextStepKey) => {
    if (!canPersist) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistState(nextStepKey ?? step);
    }, 600);
  };

  useEffect(() => {
    if (!canPersist) return;
    queuePersistState(furthestStepRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPersist, step, selectedRole, roleSkills, gapReport, studyData]);

  useEffect(() => {
    if (step === STEPS.LANDING) {
      furthestStepRef.current = STEPS.LANDING;
      return;
    }
    const currIdx = getStepIndex(step);
    const bestIdx = getStepIndex(furthestStepRef.current);
    if (currIdx > bestIdx) furthestStepRef.current = step;
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const authFlag = authCallbackRef.current;
        if (authFlag) {
          // Clean the query string (avoid repeated auth triggers).
          window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        }

        const u = await authMe();
        if (cancelled) return;
        setUser(u);

        // After successful OAuth callback, move to role selection immediately.
        if (u && step === STEPS.LANDING) {
          setStep(STEPS.SELECT_ROLE);
        }

        if (authFlag === 'error') {
          window.alert('Authentication failed. Please try signing in again.');
        }
      } catch {
        if (!cancelled) setUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    // Refresh session list whenever the user lands on role selection.
    if (step === STEPS.SELECT_ROLE) {
      fetchStudySessions()
        .then((s) => setSessions(s))
        .catch(() => setSessions([]));
    }
  }, [user, step]);

  const handleGetStarted = () => {
    if (user) setStep(STEPS.SELECT_ROLE);
    else setAuthModalOpen(true);
  };

  const handleRoleSelected = (role, skills) => {
    setSelectedRole(role);
    setRoleSkills(skills);
    setGapReport(null);
    setStudyData(null);
    furthestStepRef.current = STEPS.INPUT_SKILLS;
    setStep(STEPS.INPUT_SKILLS);
  };

  const handleAnalysisComplete = (report) => {
    setGapReport(report);
    setStudyData(null);
    setStep(STEPS.GAP_REPORT);
  };

  const handleGoToGraph = () => {
    setStep(STEPS.KNOWLEDGE_GRAPH);
  };

  const handleGoToStudyPlan = (data) => {
    if (studyData?.studyPlan) {
      return;
    }
    setStudyData(data);
    setStep(STEPS.STUDY_PLAN);
  };

  const handleViewGapReportFromStudy = () => {
    setStep(STEPS.GAP_REPORT);
  };

  const handleUpdateStudyData = (updates) => {
    setStudyData(prev => prev ? { ...prev, ...updates } : prev);
  };

  const handleBack = () => {
    if (step === STEPS.SELECT_ROLE) setStep(STEPS.LANDING);
    else if (step === STEPS.INPUT_SKILLS) setStep(STEPS.SELECT_ROLE);
    else if (step === STEPS.GAP_REPORT) setStep(studyData ? STEPS.KNOWLEDGE_GRAPH : STEPS.INPUT_SKILLS);
    else if (step === STEPS.KNOWLEDGE_GRAPH) setStep(STEPS.GAP_REPORT);
    else if (step === STEPS.STUDY_PLAN) setStep(STEPS.KNOWLEDGE_GRAPH);
  };

  const handleStartOver = () => {
    setStep(STEPS.LANDING);
    setSelectedRole(null);
    setRoleSkills(null);
    setGapReport(null);
    setStudyData(null);
  };

  const canNavigateTo = (targetStepKey) => {
    if (!user && targetStepKey !== STEPS.SELECT_ROLE) return false;
    if (targetStepKey === STEPS.LANDING) return true;
    if (targetStepKey === STEPS.SELECT_ROLE) return true;

    if (!selectedRole) return false;
    if (targetStepKey === STEPS.INPUT_SKILLS) return Boolean(roleSkills) && !studyData;
    if (targetStepKey === STEPS.GAP_REPORT) return Boolean(gapReport);
    if (targetStepKey === STEPS.KNOWLEDGE_GRAPH) return Boolean(gapReport);
    if (targetStepKey === STEPS.STUDY_PLAN) return Boolean(studyData);
    return false;
  };

  const handleContinueSession = async (sessionId) => {
    try {
      const s = await fetchStudySession(sessionId);
      setSelectedRole(s.state?.selectedRole ?? null);
      setRoleSkills(s.state?.roleSkills ?? null);
      setGapReport(s.state?.gapReport ?? null);
      setStudyData(s.state?.studyData ?? null);
      setAuthModalOpen(false);
      const nextStep = s.step_key || STEPS.SELECT_ROLE;
      furthestStepRef.current = nextStep;
      setStep(nextStep);
    } catch {
      // If session load fails, keep the user on role selection.
      setStep(STEPS.SELECT_ROLE);
    }
  };

  const handleLogout = async () => {
    try {
      await authLogout();
    } finally {
      setUser(null);
      setSessions([]);
      setStep(STEPS.LANDING);
      setSelectedRole(null);
      setRoleSkills(null);
      setGapReport(null);
      setStudyData(null);
      setAuthModalOpen(false);
    }
  };

  const handleDeleteSession = async (sessionRow) => {
    const ok = window.confirm(
      `Delete saved progress for "${sessionRow.role_title}"? This cannot be undone.`
    );
    if (!ok) return;

    try {
      await deleteStudySession(sessionRow.id);
      const next = await fetchStudySessions();
      setSessions(next);
    } catch {
      window.alert('Failed to delete saved progress. Please try again.');
    }
  };

  const currentIdx = getStepIndex(step);
  const baseSegment = 100 / STEP_LABELS.length;
  const progressPercent = (() => {
    if (currentIdx < 0) return 0;
    // Within Study Plan, progress reflects completed days (instead of jumping to 100%).
    if (
      step === STEPS.STUDY_PLAN &&
      studyData?.studyPlan?.summary?.total_days &&
      Array.isArray(studyData?.completedDays)
    ) {
      const totalDays = studyData.studyPlan.summary.total_days || 0;
      const daysDone = studyData.completedDays.length;
      const ratio = totalDays > 0 ? Math.min(1, daysDone / totalDays) : 0;
      // Modules 1-4 fill 80%, then study plan day completion fills the last 20%.
      return currentIdx * baseSegment + ratio * baseSegment;
    }
    return ((currentIdx + 1) / STEP_LABELS.length) * 100;
  })();

  return (
    <div className="app">
      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
      {step !== STEPS.LANDING && (
        <div className="progress-bar">
          <div className="progress-actions">
            {user && (
              <button type="button" className="logout-btn" onClick={handleLogout}>
                Logout
              </button>
            )}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="progress-steps">
            {STEP_LABELS.map((s) => {
              const idx = STEP_LABELS.findIndex((x) => x.key === s.key);
              const isActive = s.key === step;
              const isDone = currentIdx > idx;
              const enabled = canNavigateTo(s.key);
              return (
                <span
                  key={s.key}
                  className={`progress-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${!enabled ? 'disabled' : ''}`}
                  role="button"
                  tabIndex={enabled ? 0 : -1}
                  aria-disabled={!enabled}
                  onClick={() => {
                    if (!enabled) return;
                    if (s.key === step) return;
                    setStep(s.key);
                  }}
                  onKeyDown={(e) => {
                    if (!enabled) return;
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    if (s.key === step) return;
                    setStep(s.key);
                  }}
                >
                  <span className="step-num">{s.num}</span> {s.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <main className="main-content">
        {step === STEPS.LANDING && <LandingPage onStart={handleGetStarted} />}
        {step === STEPS.SELECT_ROLE && (
          <RoleSelector
            onSelect={handleRoleSelected}
            onBack={handleBack}
            sessions={sessions}
            onContinueSession={handleContinueSession}
            onDeleteSession={handleDeleteSession}
          />
        )}
        {step === STEPS.INPUT_SKILLS && (
          <SkillInput
            role={selectedRole}
            skills={roleSkills}
            onAnalyze={handleAnalysisComplete}
            onBack={handleBack}
          />
        )}
        {step === STEPS.GAP_REPORT && (
          <GapReport
            report={gapReport}
            onBack={handleBack}
            onStartOver={handleStartOver}
            onExploreGraph={handleGoToGraph}
            lockSkillEditing={Boolean(studyData)}
          />
        )}
        {step === STEPS.KNOWLEDGE_GRAPH && (
          <KnowledgeGraph
            gapReport={gapReport}
            onStudyPlan={handleGoToStudyPlan}
            onBack={handleBack}
            initialMastery={studyData ? studyData.masteryScores : null}
            hasStudyPlanGenerated={Boolean(studyData?.studyPlan)}
          />
        )}
        {step === STEPS.STUDY_PLAN && (
          <StudyPlan
            studyData={studyData}
            gapReport={gapReport}
            onBack={handleBack}
            onStartOver={handleStartOver}
            onUpdateGapReport={setGapReport}
            onUpdateStudyData={handleUpdateStudyData}
            onViewGapReport={handleViewGapReportFromStudy}
          />
        )}
      </main>
    </div>
  );
}

export default App;
