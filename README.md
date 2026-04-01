# 🔥 PathForge — Deterministic Career Intelligence System

A smart career planning and learning optimization platform that uses **zero LLMs** — all intelligence comes from deterministic algorithms: graph traversal, scoring systems, and scheduling.

---

## ✨ Key Features

### 1. Career Skill Gap Analysis
- Select from 6 career roles (Data Scientist, Frontend Dev, Backend Dev, etc.)
- Rate your proficiency on each required skill
- Get a **career fit score** with detailed breakdown of mastered, partial, and missing skills

### 2. Knowledge Dependency Graph
- Interactive **SVG-based DAG** showing prerequisite relationships between 75+ concepts
- Identifies **root knowledge gaps** — the foundational topics you must study first
- Drag nodes, pan, zoom, and hover for details
- Skill readiness scoring based on prerequisite mastery

### 3. Study Strategy Optimizer
- Ranks topics by: `priority = difficulty × (1 − mastery) × career_importance`
- Ensures you focus on what matters most first

### 4. Schedule Generator
- **Topological sort** respects prerequisite order
- **Greedy bin-packing** fills daily study slots
- Configurable daily hours and total days
- Visual **calendar heatmap** showing study intensity

### 5. Spaced Repetition
- **SM-2 variant** algorithm: `interval = base × (retention + 0.5)`
- Review intervals: 1d → 3d → 7d → 14d
- Day-by-day review timeline with retention tracking

---

## 🛠 Tech Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| Backend  | Python, Flask, NetworkX       |
| Frontend | React, Vite                   |
| Graphs   | SVG (vector-crisp rendering)  |
| Data     | JSON (no database needed)     |

---

## 🚀 How to Run

### Prerequisites
- Python 3.8+
- Node.js 16+

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Runs on **http://localhost:5000**

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on **http://localhost:5173**

Open http://localhost:5173 in your browser.

---

## 📁 Project Structure

```
codewiser/
├── backend/
│   ├── app.py                    # Flask API (6 endpoints)
│   ├── requirements.txt          # flask, flask-cors, networkx
│   ├── data/
│   │   ├── career_skills.json    # 6 roles with weighted skills
│   │   └── concept_graph.json    # 75+ concept DAG
│   └── engines/
│       ├── gap_analysis.py       # Module 1: Gap detection
│       ├── knowledge_graph.py    # Module 2: DAG traversal
│       └── study_optimizer.py    # Modules 3-5: Scheduling
└── frontend/
    └── src/
        ├── App.jsx               # 5-step flow
        ├── utils/api.js          # API client
        └── components/
            ├── LandingPage.jsx
            ├── RoleSelector.jsx
            ├── SkillInput.jsx
            ├── GapReport.jsx
            ├── KnowledgeGraph.jsx
            └── StudyPlan.jsx
```

---

## 🔑 Core Algorithms

| Algorithm | Used In | Purpose |
|-----------|---------|---------|
| Weighted scoring | Gap Analysis | Career fit calculation |
| BFS on DAG | Knowledge Graph | Prerequisite expansion |
| Kahn's algorithm | Knowledge Graph + Scheduler | Topological sort |
| Root gap detection | Knowledge Graph | Find foundational gaps |
| Greedy bin-packing | Schedule Generator | Fill daily time slots |
| SM-2 variant | Spaced Repetition | Optimal review intervals |

---

## 📝 License

Built for hackathon use. MIT License.
