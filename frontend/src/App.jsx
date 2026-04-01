import { useState } from 'react';
import './App.css';
import LandingPage from './components/LandingPage';
import RoleSelector from './components/RoleSelector';
import SkillInput from './components/SkillInput';
import GapReport from './components/GapReport';
import KnowledgeGraph from './components/KnowledgeGraph';
import StudyPlan from './components/StudyPlan';

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

  const handleGetStarted = () => setStep(STEPS.SELECT_ROLE);

  const handleRoleSelected = (role, skills) => {
    setSelectedRole(role);
    setRoleSkills(skills);
    setStep(STEPS.INPUT_SKILLS);
  };

  const handleAnalysisComplete = (report) => {
    setGapReport(report);
    setStep(STEPS.GAP_REPORT);
  };

  const handleGoToGraph = () => {
    setStep(STEPS.KNOWLEDGE_GRAPH);
  };

  const handleGoToStudyPlan = (data) => {
    setStudyData(data);
    setStep(STEPS.STUDY_PLAN);
  };

  const handleBack = () => {
    if (step === STEPS.SELECT_ROLE) setStep(STEPS.LANDING);
    else if (step === STEPS.INPUT_SKILLS) setStep(STEPS.SELECT_ROLE);
    else if (step === STEPS.GAP_REPORT) setStep(STEPS.INPUT_SKILLS);
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

  const currentIdx = getStepIndex(step);
  const progressPercent = currentIdx >= 0 ? ((currentIdx + 1) / STEP_LABELS.length) * 100 : 0;

  return (
    <div className="app">
      {step !== STEPS.LANDING && (
        <div className="progress-bar">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="progress-steps">
            {STEP_LABELS.map((s) => {
              const idx = STEP_LABELS.findIndex((x) => x.key === s.key);
              const isActive = s.key === step;
              const isDone = currentIdx > idx;
              return (
                <span
                  key={s.key}
                  className={`progress-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
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
          <RoleSelector onSelect={handleRoleSelected} onBack={handleBack} />
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
          />
        )}
        {step === STEPS.KNOWLEDGE_GRAPH && (
          <KnowledgeGraph
            gapReport={gapReport}
            onStudyPlan={handleGoToStudyPlan}
            onBack={handleBack}
          />
        )}
        {step === STEPS.STUDY_PLAN && (
          <StudyPlan
            studyData={studyData}
            onBack={handleBack}
            onStartOver={handleStartOver}
          />
        )}
      </main>
    </div>
  );
}

export default App;
