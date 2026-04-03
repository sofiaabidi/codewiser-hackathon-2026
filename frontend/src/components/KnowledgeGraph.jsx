import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { diagnoseGaps } from '../utils/api';
import UiIcon from './UiIcon';

export default function KnowledgeGraph({ gapReport, onStudyPlan, onBack, initialMastery }) {
  const [diagnosis, setDiagnosis] = useState(null);
  const [masteryScores, setMasteryScores] = useState(() => (initialMastery && Object.keys(initialMastery).length > 0 ? { ...initialMastery } : {}));
  const [loading, setLoading] = useState(true);
  const [showMasteryInput, setShowMasteryInput] = useState(false);
  const [error, setError] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [dragNode, setDragNode] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const svgRef = useRef(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 960, h: 500 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });

  const skillIds = useMemo(
    () => [
      ...gapReport.skills.missing.map(s => s.id),
      ...gapReport.skills.partial.map(s => s.id),
    ],
    [gapReport]
  );

  const skillIdsKey = useMemo(() => skillIds.slice().sort().join(','), [skillIds]);

  const masterySyncKey = useMemo(() => {
    if (!initialMastery || Object.keys(initialMastery).length === 0) return '';
    return JSON.stringify(initialMastery);
  }, [initialMastery]);

  const layoutGraph = useCallback((graph) => {
    if (!graph) return;
    const { nodes, edges } = graph;

    const inDegree = {};
    const children = {};
    nodes.forEach(n => { inDegree[n.id] = 0; children[n.id] = []; });
    edges.forEach(e => {
      if (inDegree[e.to] !== undefined) inDegree[e.to]++;
      if (children[e.from]) children[e.from].push(e.to);
    });

    const layers = {};
    const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    queue.forEach(id => { layers[id] = 0; });
    const visited = new Set(queue);

    let qi = 0;
    while (qi < queue.length) {
      const curr = queue[qi++];
      (children[curr] || []).forEach(child => {
        layers[child] = Math.max(layers[child] || 0, layers[curr] + 1);
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
      });
    }

    nodes.forEach(n => { if (layers[n.id] === undefined) layers[n.id] = 0; });

    const layerGroups = {};
    nodes.forEach(n => {
      const layer = layers[n.id];
      if (!layerGroups[layer]) layerGroups[layer] = [];
      layerGroups[layer].push(n.id);
    });

    const maxLayer = Math.max(...Object.keys(layerGroups).map(Number), 0);
    const graphW = 960;
    const graphH = 500;
    const layerSpacing = graphH / (maxLayer + 2);

    const positionedNodes = nodes.map(n => {
      const layer = layers[n.id];
      const siblings = layerGroups[layer];
      const idx = siblings.indexOf(n.id);
      const spacing = graphW / (siblings.length + 1);
      return {
        ...n,
        x: spacing * (idx + 1),
        y: layerSpacing * (layer + 1),
        radius: n.is_root_skill ? 22 : 16,
      };
    });

    setGraphData({ nodes: positionedNodes, edges });
    setViewBox({ x: 0, y: 0, w: graphW, h: graphH });
  }, []);

  const runDiagnosis = useCallback(async (scores) => {
    if (!skillIds.length) {
      setLoading(false);
      setError('No target skills left to map — open the gap report to see your progress.');
      setDiagnosis(null);
      setGraphData({ nodes: [], edges: [] });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await diagnoseGaps(skillIds, scores);
      setDiagnosis(result);
      layoutGraph(result.graph);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [skillIds, layoutGraph]);

  useEffect(() => {
    const scores = masterySyncKey === '' ? {} : JSON.parse(masterySyncKey);
    setMasteryScores(scores);
    runDiagnosis(scores);
  }, [skillIdsKey, masterySyncKey, runDiagnosis]);

  // — Drag node —
  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    setDragNode(nodeId);
  };

  const handleSvgMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

    if (dragNode) {
      setGraphData(prev => ({
        ...prev,
        nodes: prev.nodes.map(n =>
          n.id === dragNode ? { ...n, x: svgP.x, y: svgP.y } : n
        ),
      }));
      return;
    }

    if (isPanning) {
      const dx = (e.clientX - panStart.current.x) * (viewBox.w / svg.clientWidth);
      const dy = (e.clientY - panStart.current.y) * (viewBox.h / svg.clientHeight);
      setViewBox(prev => ({
        ...prev,
        x: panStart.current.vx - dx,
        y: panStart.current.vy - dy,
      }));
    }
  };

  const handleSvgMouseUp = () => {
    setDragNode(null);
    setIsPanning(false);
  };

  const handleSvgMouseDown = (e) => {
    // Only pan if not clicking a node
    if (e.target === svgRef.current || e.target.tagName === 'line' || e.target.classList.contains('svg-bg')) {
      setIsPanning(true);
      panStart.current = {
        x: e.clientX, y: e.clientY,
        vx: viewBox.x, vy: viewBox.y,
      };
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;

    setViewBox(prev => {
      const newW = Math.max(200, Math.min(3000, prev.w * factor));
      const newH = Math.max(100, Math.min(1500, prev.h * factor));
      return {
        x: prev.x + (prev.w - newW) * mx,
        y: prev.y + (prev.h - newH) * my,
        w: newW,
        h: newH,
      };
    });
  };

  // Build node lookup
  const nodeMap = {};
  graphData.nodes.forEach(n => { nodeMap[n.id] = n; });

  // Get node color
  const getNodeColor = (node) => {
    if (node.mastery >= 0.6) return '#B0E4CC';
    if (node.mastery > 0) return '#408A71';
    if (node.is_root_gap) return '#d46b6b';
    return '#285A48';
  };

  // Mastery
  const handleMasteryChange = (conceptId, value) => {
    setMasteryScores(prev => ({ ...prev, [conceptId]: parseFloat(value) / 100 }));
  };

  const handleRediagnose = () => {
    runDiagnosis(masteryScores);
    setShowMasteryInput(false);
  };

  const handleProceedToStudy = () => {
    if (!diagnosis) return;

    // Annotate each gap with is_root_gap flag
    const allGaps = [
      ...diagnosis.root_gaps.map(g => ({ ...g, is_root_gap: true })),
      ...diagnosis.other_gaps.map(g => ({ ...g, is_root_gap: false })),
    ];

    // Build full mastery map from ALL graph nodes, then overlay user-entered scores
    const fullMastery = {};
    if (diagnosis.graph && diagnosis.graph.nodes) {
      diagnosis.graph.nodes.forEach(node => {
        fullMastery[node.id] = node.mastery || 0;
      });
    }
    // User-entered scores override graph defaults
    Object.entries(masteryScores).forEach(([id, val]) => {
      fullMastery[id] = val;
    });

    const careerWeights = {};
    [...gapReport.skills.missing, ...gapReport.skills.partial, ...gapReport.skills.mastered].forEach(s => {
      careerWeights[s.id] = s.weight;
    });
    onStudyPlan({ diagnosis, allGaps, masteryScores: fullMastery, careerWeights });
  };


  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <span className="loading-text">Building knowledge dependency graph…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  const tooltipNode = hoveredNode ? nodeMap[hoveredNode] : null;

  return (
    <div className="knowledge-graph-page">
      <button className="back-btn" onClick={onBack}>← Back to Report</button>

      <div className="section-header">
        <h2>Knowledge Dependency Graph</h2>
        <p>Explore prerequisite concepts and identify root knowledge gaps</p>
      </div>

      {/* Summary cards */}
      <div className="summary-cards stagger-children">
        <div className="summary-card total">
          <div className="card-value">{diagnosis.summary.total_concepts}</div>
          <div className="card-label">Concepts</div>
        </div>
        <div className="summary-card mastered">
          <div className="card-value">{diagnosis.summary.mastered_concepts}</div>
          <div className="card-label">Mastered</div>
        </div>
        <div className="summary-card missing">
          <div className="card-value">{diagnosis.summary.total_gaps}</div>
          <div className="card-label">Gaps</div>
        </div>
        <div className="summary-card partial">
          <div className="card-value">{diagnosis.summary.root_gaps}</div>
          <div className="card-label">Root Gaps</div>
        </div>
      </div>

      {/* Interactive SVG Graph */}
      <div className="graph-container animate-fade-in">
        <div className="graph-toolbar">
          <span className="graph-legend">
            <span className="legend-item"><span className="legend-dot" style={{ background: '#B0E4CC' }} /> Mastered</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#408A71' }} /> Partial</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#d46b6b' }} /> Root Gap</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#285A48' }} /> Unknown</span>
          </span>
          <button className="btn-small" onClick={() => setShowMasteryInput(!showMasteryInput)}>
            {showMasteryInput ? 'Close' : <><UiIcon name="edit" size={14} className="icon-inline" /> Set Mastery</>}
          </button>
        </div>

        <svg
          ref={svgRef}
          className="graph-svg"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
          onMouseDown={handleSvgMouseDown}
          onWheel={handleWheel}
        >
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="rgba(64,138,113,0.4)" />
            </marker>
            <filter id="glow-red">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor="#d46b6b" floodOpacity="0.3" />
              <feComposite in2="blur" operator="in" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-green">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feFlood floodColor="#B0E4CC" floodOpacity="0.25" />
              <feComposite in2="blur" operator="in" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Background */}
          <rect className="svg-bg" x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="transparent" />

          {/* Edges */}
          {graphData.edges.map((edge, i) => {
            const from = nodeMap[edge.from];
            const to = nodeMap[edge.to];
            if (!from || !to) return null;

            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const fromX = from.x + Math.cos(angle) * from.radius;
            const fromY = from.y + Math.sin(angle) * from.radius;
            const toX = to.x - Math.cos(angle) * (to.radius + 5);
            const toY = to.y - Math.sin(angle) * (to.radius + 5);

            return (
              <line
                key={`edge-${i}`}
                x1={fromX} y1={fromY}
                x2={toX} y2={toY}
                stroke="rgba(64,138,113,0.2)"
                strokeWidth="1.5"
                markerEnd="url(#arrowhead)"
                className="graph-edge"
              />
            );
          })}

          {/* Nodes */}
          {graphData.nodes.map(node => {
            const color = getNodeColor(node);
            const isHovered = hoveredNode === node.id;
            const isDragging = dragNode === node.id;
            const r = node.radius + (isHovered ? 3 : 0);

            return (
              <g
                key={node.id}
                className={`graph-node ${isHovered ? 'hovered' : ''} ${isDragging ? 'dragging' : ''}`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                style={{ cursor: 'grab' }}
              >
                {/* Glow ring for root gaps */}
                {node.is_root_gap && (
                  <circle
                    cx={node.x} cy={node.y} r={node.radius + 10}
                    fill="none" stroke="#d46b6b" strokeWidth="1.5"
                    opacity="0.3"
                    className="pulse-ring"
                  />
                )}

                {/* Main circle */}
                <circle
                  cx={node.x} cy={node.y} r={r}
                  fill={color + (isHovered ? '' : 'cc')}
                  stroke={isHovered ? '#fff' : color}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  filter={node.is_root_gap ? 'url(#glow-red)' : node.mastery >= 0.6 ? 'url(#glow-green)' : 'none'}
                />

                {/* Mastery arc */}
                {node.mastery > 0 && node.mastery < 1 && (() => {
                  const arcR = node.radius + 4;
                  const endAngle = -Math.PI / 2 + Math.PI * 2 * node.mastery;
                  const startAngle = -Math.PI / 2;
                  const x1 = node.x + arcR * Math.cos(startAngle);
                  const y1 = node.y + arcR * Math.sin(startAngle);
                  const x2 = node.x + arcR * Math.cos(endAngle);
                  const y2 = node.y + arcR * Math.sin(endAngle);
                  const large = node.mastery > 0.5 ? 1 : 0;
                  return (
                    <path
                      d={`M ${x1} ${y1} A ${arcR} ${arcR} 0 ${large} 1 ${x2} ${y2}`}
                      fill="none" stroke="#B0E4CC" strokeWidth="2" strokeLinecap="round"
                    />
                  );
                })()}

                {/* Label */}
                <text
                  x={node.x} y={node.y + node.radius + 14}
                  textAnchor="middle"
                  className="node-label"
                  fontSize={isHovered ? '12' : '10'}
                  fontWeight={isHovered ? '600' : '400'}
                  fill="rgba(176,228,204,0.5)"
                >
                  {node.name.length > 20 ? node.name.slice(0, 18) + '…' : node.name}
                </text>
              </g>
            );
          })}

          {/* Tooltip (rendered inside SVG for precise positioning) */}
          {tooltipNode && (
            <g className="svg-tooltip-group" style={{ pointerEvents: 'none' }}>
              <rect
                x={tooltipNode.x + tooltipNode.radius + 10}
                y={tooltipNode.y - 45}
                width="170" height="80" rx="6"
                fill="rgba(9,20,19,0.95)"
                stroke="rgba(64,138,113,0.25)"
                strokeWidth="1"
              />
              <text x={tooltipNode.x + tooltipNode.radius + 18} y={tooltipNode.y - 27} fill="#B0E4CC" fontSize="12" fontWeight="700">
                {tooltipNode.name}
              </text>
              <text x={tooltipNode.x + tooltipNode.radius + 18} y={tooltipNode.y - 12} fill="#408A71" fontSize="9" fontWeight="600" textTransform="uppercase">
                {tooltipNode.category}
              </text>
              <text x={tooltipNode.x + tooltipNode.radius + 18} y={tooltipNode.y + 4} fill="rgba(176,228,204,0.5)" fontSize="10">
                Mastery: {Math.round((tooltipNode.mastery || 0) * 100)}%  ·  Diff: {Math.round(tooltipNode.difficulty * 100)}%
              </text>
              <text x={tooltipNode.x + tooltipNode.radius + 18} y={tooltipNode.y + 20} fill="rgba(176,228,204,0.5)" fontSize="10">
                Est. {tooltipNode.estimated_hours}h study time
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Mastery Input Panel */}
      {showMasteryInput && (
        <div className="mastery-panel animate-fade-in-up">
          <h3>Set Concept Mastery Scores</h3>
          <p className="mastery-hint">Rate your knowledge of each prerequisite concept (0-100%)</p>
          <div className="mastery-grid">
            {graphData.nodes
              .filter(n => !n.is_root_skill)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(node => (
                <div key={node.id} className="mastery-item">
                  <span className="mastery-name">{node.name}</span>
                  <input
                    type="range" min="0" max="100"
                    value={Math.round((masteryScores[node.id] || 0) * 100)}
                    onChange={(e) => handleMasteryChange(node.id, e.target.value)}
                    className="proficiency-slider"
                  />
                  <span className={`slider-value ${(masteryScores[node.id] || 0) >= 0.6 ? 'high' : (masteryScores[node.id] || 0) > 0 ? 'mid' : 'zero'}`}>
                    {Math.round((masteryScores[node.id] || 0) * 100)}%
                  </span>
                </div>
              ))}
          </div>
          <button className="analyze-btn" onClick={handleRediagnose} style={{ marginTop: 24 }}>
            <UiIcon name="refresh" size={16} className="icon-inline" /> Re-diagnose with Scores
          </button>
        </div>
      )}

      {/* Root Gaps */}
      {diagnosis.root_gaps.length > 0 && (
        <div className="breakdown-section animate-fade-in-up">
          <div className="breakdown-title">
            <span className="status-dot red" />
            Root Knowledge Gaps — Study These First
          </div>
          {diagnosis.root_gaps.map(gap => (
            <div key={gap.id} className="skill-breakdown-card">
              <div className="skill-breakdown-left">
                <span className="skill-breakdown-name">{gap.name}</span>
                <span className="skill-category-badge">{gap.category}</span>
              </div>
              <div className="skill-breakdown-right">
                <span className="weight-badge">{gap.estimated_hours}h</span>
                <div className="proficiency-bar-container">
                  <div className="proficiency-bar-fill amber" style={{ width: `${gap.mastery * 100}%` }} />
                </div>
                <span className={`proficiency-percent ${gap.mastery > 0 ? 'amber' : 'red'}`}>
                  {Math.round(gap.mastery * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Skill Readiness */}
      {diagnosis.skill_readiness.length > 0 && (
        <div className="breakdown-section animate-fade-in-up" style={{ marginTop: 24 }}>
          <div className="breakdown-title">
            <span className="status-dot amber" />
            Skill Readiness (based on prerequisites)
          </div>
          {diagnosis.skill_readiness.map(skill => (
            <div key={skill.id} className="skill-breakdown-card">
              <div className="skill-breakdown-left">
                <span className="skill-breakdown-name">{skill.name}</span>
                <span className="skill-category-badge">
                  {skill.mastered_prereqs}/{skill.total_prereqs} prereqs
                </span>
              </div>
              <div className="skill-breakdown-right">
                <div className="proficiency-bar-container">
                  <div
                    className={`proficiency-bar-fill ${skill.readiness >= 0.6 ? 'green' : skill.readiness > 0 ? 'amber' : 'red'}`}
                    style={{ width: `${skill.readiness * 100}%` }}
                  />
                </div>
                <span className={`proficiency-percent ${skill.readiness >= 0.6 ? 'green' : skill.readiness > 0 ? 'amber' : 'red'}`}>
                  {Math.round(skill.readiness * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action */}
      <div className="report-actions">
        <button className="btn-primary" onClick={handleProceedToStudy}>
          <UiIcon name="calendar" size={16} className="icon-inline" /> Generate Study Plan →
        </button>
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}
