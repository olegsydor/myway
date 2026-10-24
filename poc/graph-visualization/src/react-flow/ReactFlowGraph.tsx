import {
  useCallback,
  useEffect,
  useRef,
  useState,
  Profiler,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type EdgeMouseHandler,
  type NodeChange,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";

import { Graph, layout as dagreLayout } from "@dagrejs/dagre";

import {
  findDirectedPath,
  findPathsToStart,
  findUnconnectedNodeIds,
  findBranchNodeIds,
} from "../shared/graphAlgorithms";

import type { GraphSearchResult } from "../shared/graphSearch";

import "@xyflow/react/dist/style.css";

import {
  createEdge,
  createNode,
  deleteEdge,
  deleteNode,
  fetchEdgeTypes,
  fetchNodeTypes,
  updateEdge,
  updateNode,
} from "../shared/api";

import {
  toReactFlowElements,
  type ReactFlowEdge,
  type ReactFlowNode,
} from "./adapter";

import type { EdgeType, GraphResponse, NodeType } from "../shared/types";
import { NodeSearchSelect } from './NodeSearchSelect'

import { GraphSearchPanel } from "./GraphSearchPanel";

import { usePersistentLayout } from "./usePersistentLayout";
import { LayoutControls } from "./LayoutControls";

import { MyWayNode } from "./MyWayNode";
import { MyWayEdge } from "./MyWayEdge";

import {
  reconcileGroup,
  rectanglesIntersect,
  selectGroupMembers,
  toggleGroupMember,
  translateMembers,
  type ManualGroup,
} from "../shared/manualGroups";

import {
  LayoutDiagnostics,
  layoutDiagnosticsEnabled,
} from "./layoutDiagnostics";

interface ReactFlowGraphProps {
  graph: GraphResponse;
  recoveryScope: string | null;
  onGraphChanged: () => Promise<void>;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;

type LayoutName = "grid" | "circle" | "dagre";

function positionNodes(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  layoutName: LayoutName,
): ReactFlowNode[] {
  if (layoutName === "grid") {
    const columns = Math.ceil(Math.sqrt(nodes.length));

    return nodes.map((node, index) => ({
      ...node,
      position: {
        x: (index % columns) * 200,
        y: Math.floor(index / columns) * 100,
      },
    }));
  }

  if (layoutName === "circle") {
    const nodeCount = Math.max(nodes.length, 1);
    const radius = Math.max(250, nodeCount * 25);

    return nodes.map((node, index) => {
      const angle = (2 * Math.PI * index) / nodeCount;

      return {
        ...node,
        position: {
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
        },
      };
    });
  }

  const dagreGraph = new Graph({
    multigraph: true,
  });

  dagreGraph.setGraph({
    rankdir: "LR",
    nodesep: 60,
    ranksep: 100,
    marginx: 30,
    marginy: 30,
  });

  dagreGraph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target, {}, edge.id);
  }

  dagreLayout(dagreGraph);

  return nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);

    return {
      ...node,
      position: {
        x: (dagreNode.x ?? 0) - NODE_WIDTH / 2,
        y: (dagreNode.y ?? 0) - NODE_HEIGHT / 2,
      },
    };
  });
}

const reactFlowNodeTypes = {
  myWay: MyWayNode,
};

const reactFlowEdgeTypes = {
  myWay: MyWayEdge,
};

interface ReactFlowMetrics {
  adapterMs: number;
  initializationMs: number;
  firstRenderMs: number | null;
  layoutMs: number | null;
}

interface PropertyRow {
  key: string;
  value: string;
}

function propertyRowsToObject(rows: PropertyRow[]): Record<string, unknown> {
  return Object.fromEntries(
    rows
      .map((row) => [row.key.trim(), row.value])
      .filter(([key]) => key.length > 0),
  );
}

function objectToPropertyRows(
  attributes: Record<string, unknown>,
): PropertyRow[] {
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    value: String(value),
  }));
}

interface BranchSelection {
  graph: GraphResponse;
  anchorId: string;
  nodeIds: Set<string>;
}

interface SelectionRectangle {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface RectangleGesture {
  pointerId: number;
  startX: number;
  startY: number;
  additive: boolean;
}

const RECTANGLE_DRAG_THRESHOLD = 5;

export function ReactFlowGraph({
  graph: graphData,
  recoveryScope,
  onGraphChanged,
}: ReactFlowGraphProps) {
  const instanceRef = useRef<ReactFlowInstance<
    ReactFlowNode,
    ReactFlowEdge
  > | null>(null);

  const diagnosticsRef = useRef<LayoutDiagnostics | null>(null);

if (
  diagnosticsRef.current === null &&
  layoutDiagnosticsEnabled(window.location.search)
) {
  diagnosticsRef.current = new LayoutDiagnostics(1000);
}

useEffect(() => {
  const diagnostics = diagnosticsRef.current;

  if (!diagnostics) return;

  diagnostics.startLongTaskObserver();

  return () => {
    diagnostics.dispose();
    diagnosticsRef.current = null;
  };
}, []);

  const currentLayoutRef = useRef<LayoutName>("dagre");

  const [nodes, setNodes] = useNodesState<ReactFlowNode>([]);

  useEffect(() => {
  diagnosticsRef.current?.record({
    kind: "graph-render",
    atMs: performance.now(),
    nodeCount: nodes.length,
  });
});

  const [edges, setEdges, onEdgesChange] = useEdgesState<ReactFlowEdge>([]);

  const [isDeletingNode, setIsDeletingNode] = useState(false);
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [isUpdatingNode, setIsUpdatingNode] = useState(false);
  const [isCreatingEdge, setIsCreatingEdge] = useState(false);
  const [isUpdatingEdge, setIsUpdatingEdge] = useState(false);
  const [isDeletingEdge, setIsDeletingEdge] = useState(false);
  const [isRefreshingGraph, setIsRefreshingGraph] = useState(false);
  const layout = usePersistentLayout({
    nodes,
    diagnostics: diagnosticsRef.current,
    recoveryScope,
    nodeIds: graphData.nodes.map((node) => node.id),
    setNodes,
    graphBusy: isCreatingNode || isUpdatingNode || isDeletingNode ||
      isCreatingEdge || isUpdatingEdge || isDeletingEdge || isRefreshingGraph,
    fallback: () => {
      const elements = toReactFlowElements(graphData);
      return positionNodes(elements.nodes, elements.edges, "dagre");
    },
    onSwitched: () => {
      setBranchSelection(null);
      setManualGroup(null);
    },
    onRestored: () => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        void instanceRef.current?.fitView({ padding: 0.1, duration: 300 });
      }));
    },
  });

  function exportDiagnostics() {
  const diagnostics = diagnosticsRef.current;

  if (!diagnostics) return;

  const json = diagnostics.exportJson();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `myway-layout-diagnostics-${Date.now()}.json`;

  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

  async function refreshGraphForLayout() {
    if (layout.blocked || layout.isLocked()) return;
    setIsRefreshingGraph(true);
    try {
      await onGraphChanged();
      setActionMessage("Graph refreshed; working positions preserved");
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "Failed to refresh graph");
    } finally {
      setIsRefreshingGraph(false);
    }
  }


  const [selectedElement, setSelectedElement] = useState("None");
  const [selectedNodeForEdit, setSelectedNodeForEdit] =
    useState<ReactFlowNode | null>(null);
  const [selectedEdgeForEdit, setSelectedEdgeForEdit] =
    useState<ReactFlowEdge | null>(null);

  const [branchSelection, setBranchSelection] =
    useState<BranchSelection | null>(null);

  // A canonical graph refresh invalidates the previous branch.
  const activeBranch =
    branchSelection?.graph === graphData ? branchSelection : null;

  const [manualGroup, setManualGroup] =
    useState<ManualGroup | null>(null);

  const activeManualGroup =
    manualGroup && manualGroup.nodeIds.size > 0
      ? manualGroup
      : null;

  const visibleManualCount = activeManualGroup
    ? nodes.filter(
        (node) => activeManualGroup.nodeIds.has(node.id) && !node.hidden,
      ).length
    : 0;

  const rectangleGestureRef = useRef<RectangleGesture | null>(null);

  const [selectionRectangle, setSelectionRectangle] =
    useState<SelectionRectangle | null>(null);

  function handleRectanglePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (layout.isLocked() || event.button !== 0 || !event.shiftKey) {
      return;
    }

    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    // Start only on empty canvas, including its background.
    if (
      !target.closest(".react-flow__pane, .react-flow__background") ||
      target.closest(
        ".react-flow__node, .react-flow__edge, " +
        ".react-flow__controls, .react-flow__panel",
      )
    ) {
      return;
    }

    // Prevent Shift gestures from starting React Flow's own selection.
    event.preventDefault();
    event.stopPropagation();

    if (activeBranch) {
      return;
    }

    rectangleGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleRectanglePointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const gesture = rectangleGestureRef.current;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const distance = Math.hypot(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY,
    );

    if (distance < RECTANGLE_DRAG_THRESHOLD && !selectionRectangle) {
      return;
    }

    setSelectionRectangle({
      startX: gesture.startX,
      startY: gesture.startY,
      endX: event.clientX,
      endY: event.clientY,
    });
  }

  function handleRectanglePointerUp(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const gesture = rectangleGestureRef.current;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    rectangleGestureRef.current = null;
    setSelectionRectangle(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const distance = Math.hypot(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY,
    );

    if (
      activeBranch ||
      (!selectionRectangle && distance < RECTANGLE_DRAG_THRESHOLD)
    ) {
      return;
    }

    const left = Math.min(gesture.startX, event.clientX);
    const right = Math.max(gesture.startX, event.clientX);
    const top = Math.min(gesture.startY, event.clientY);
    const bottom = Math.max(gesture.startY, event.clientY);

    const visibleIds = new Set(
      nodes.filter((node) => !node.hidden).map((node) => node.id),
    );

    const capturedIds = new Set<string>();

    // Measure rendered node bounds in the same screen coordinates
    // as the pointer. This automatically accounts for pan and zoom.
    const nodeElements =
      event.currentTarget.querySelectorAll<HTMLElement>(
        ".react-flow__node[data-id]",
      );

    for (const element of nodeElements) {
      const nodeId = element.dataset.id;

      if (!nodeId || !visibleIds.has(nodeId)) {
        continue;
      }

      const bounds = element.getBoundingClientRect();

      if (
        bounds.width > 0 &&
        bounds.height > 0 &&
        rectanglesIntersect(bounds, { left, right, top, bottom })
      ) {
        capturedIds.add(nodeId);
      }
    }

    setManualGroup((currentGroup) =>
      selectGroupMembers(currentGroup, capturedIds, gesture.additive),
    );
  }

  function handleRectanglePointerCancel(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (rectangleGestureRef.current?.pointerId !== event.pointerId) {
      return;
    }

    rectangleGestureRef.current = null;
    setSelectionRectangle(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  useEffect(() => {
    const memberIds =
      activeBranch?.nodeIds ?? activeManualGroup?.nodeIds;

    if (!memberIds) {
      return;
    }

    const handleBranchKeyDown = (event: KeyboardEvent) => {
      if (layout.isLocked()) return;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (target instanceof Element && target.closest("dialog")) return;

      if (activeManualGroup) {
        if (!(target instanceof HTMLElement)) {
          return;
        }

        // Manual-group shortcuts apply only within the canvas.
        if (
          !target.closest(".react-flow-container") ||
          target.closest(
            "button, a, input, textarea, select, [role='button'], " +
            "[role='textbox'], [role='combobox'], [role='slider'], " +
            "[role='spinbutton']",
          ) ||
          target.isContentEditable
        ) {
          return;
        }

        const focusedNodeElement =
          target.closest<HTMLElement>(".react-flow__node");

        const targetNodeId = focusedNodeElement
          ? focusedNodeElement.dataset.id
          : nodes.find((node) => node.selected && !node.hidden)?.id;

        if (!targetNodeId || !memberIds.has(targetNodeId)) {
          return;
        }
      }

      if (
        target instanceof HTMLElement &&
        (
          target.isContentEditable ||
          target.closest(
            "input, textarea, select, [role='textbox'], " +
            "[role='combobox'], [role='slider'], [role='spinbutton']",
          )
        )
      ) {
        return;
      }

      const step = event.shiftKey ? 50 : 10;
      let dx = 0;
      let dy = 0;

      switch (event.key) {
        case "ArrowLeft":
          dx = -step;
          break;
        case "ArrowRight":
          dx = step;
          break;
        case "ArrowUp":
          dy = -step;
          break;
        case "ArrowDown":
          dy = step;
          break;
        default:
          return;
      }

      event.preventDefault();
      event.stopPropagation();

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (!memberIds.has(node.id)) {
            return node;
          }

          return {
            ...node,
            position: {
              x: node.position.x + dx,
              y: node.position.y + dy,
            },
          };
        }),
      );
    };

    window.addEventListener("keydown", handleBranchKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleBranchKeyDown, true);
    };
  }, [activeBranch, activeManualGroup, nodes, setNodes, layout.isLocked]);

const handleNodesChange = useCallback(
  (changes: NodeChange<ReactFlowNode>[]) => {
    const startedAt = performance.now();
    const diagnostics = diagnosticsRef.current;

    if (diagnostics) {
      const changeTypes: Record<string, number> = {};

      for (const change of changes) {
        changeTypes[change.type] =
          (changeTypes[change.type] ?? 0) + 1;
      }

      diagnostics.record({
        kind: "node-change-batch",
        atMs: startedAt,
        nodeCount: nodes.length,
        changeCount: changes.length,
        changeTypes,
      });
    }

    if (layout.isLocked()) {
      changes = changes.filter(
        (change) =>
          change.type === "select" ||
          change.type === "dimensions",
      );
    }
    setNodes((currentNodes) => {
      const processingStartedAt = performance.now();

      const memberIdsCountForDiagnostics =
        activeBranch?.nodeIds.size ??
        activeManualGroup?.nodeIds.size ??
        1;

      try {
        const memberIds =
          activeBranch?.nodeIds ?? activeManualGroup?.nodeIds;

        if (!memberIds) {
          return applyNodeChanges(changes, currentNodes);
        }

        const initiatorChange = changes.find(
          (change) =>
            change.type === "position" &&
            change.position !== undefined &&
            (
              activeBranch
                ? change.id === activeBranch.anchorId
                : memberIds.has(change.id)
            ),
        );

        if (
          !initiatorChange ||
          initiatorChange.type !== "position" ||
          !initiatorChange.position
        ) {
          return applyNodeChanges(changes, currentNodes);
        }

        const initiator = currentNodes.find(
          (node) => node.id === initiatorChange.id,
        );

        if (!initiator) {
          return applyNodeChanges(changes, currentNodes);
        }

        const dx = initiatorChange.position.x - initiator.position.x;
        const dy = initiatorChange.position.y - initiator.position.y;

        const originalNodes = new Map(
          currentNodes.map((node) => [node.id, node]),
        );

        const updatedNodes = applyNodeChanges(changes, currentNodes);

        const baselineNodes = updatedNodes.map((node) => {
          const original = originalNodes.get(node.id);

          return memberIds.has(node.id) && original
            ? { ...node, position: original.position }
            : node;
        });

      return translateMembers(baselineNodes, memberIds, dx, dy);
        } finally {
          diagnostics?.record({
            kind: "movement",
            atMs: processingStartedAt,
            durationMs: performance.now() - processingStartedAt,
            nodeCount: currentNodes.length,
            movedCount: memberIdsCountForDiagnostics,
          });
        }
      });
    },
    [activeBranch, activeManualGroup, setNodes, layout.isLocked],
  );

  const visibleBranchCount = activeBranch
    ? nodes.filter(
        (node) => activeBranch.nodeIds.has(node.id) && !node.hidden,
      ).length
    : 0;

  const previewNodes = activeBranch
    ? nodes.map((node) => {
        const isMember = activeBranch.nodeIds.has(node.id);
        const isAnchor = node.id === activeBranch.anchorId;

        return {
          ...node,
          selected: isAnchor,
          draggable: isAnchor,
          style: {
            ...node.style,
            opacity: isMember ? 1 : 0.2,
            border: isAnchor
              ? "4px solid #ef4444"
              : isMember
                ? "3px solid #f59e0b"
                : "2px solid #ffffff",
          },
        };
      })
    : activeManualGroup
      ? nodes.map((node) => {
          const isMember = activeManualGroup.nodeIds.has(node.id);

          return {
            ...node,
            style: {
              ...node.style,
              opacity: 1,
              border: isMember
                ? "3px solid #22c55e"
                : "2px solid #ffffff",
              boxShadow: isMember
                ? "0 0 0 2px rgba(34, 197, 94, 0.25)"
                : "none",
            },
          };
        })
      : nodes;

  const previewEdges = activeBranch
    ? edges.map((edge) => {
        const touchesBranch =
          activeBranch.nodeIds.has(edge.source) ||
          activeBranch.nodeIds.has(edge.target);

        return {
          ...edge,
          selected: false,
          style: {
            ...edge.style,
            opacity: touchesBranch ? 1 : 0.15,
          },
        };
      })
    : activeManualGroup
      ? edges.map((edge) => ({
          ...edge,
          style: {
            ...edge.style,
            opacity: 1,
          },
        }))
      : edges;

  function handleSelectBranch() {
    if (!selectedNodeForEdit || activeManualGroup) {
      return;
    }

    const nodeIds = new Set(
      findBranchNodeIds(
        graphData,
        selectedNodeForEdit.data.originalId,
      ).map((id) => `n-${id}`),
    );

    if (nodeIds.size === 0) {
      return;
    }

    setBranchSelection({
      graph: graphData,
      anchorId: selectedNodeForEdit.id,
      nodeIds,
    });
  }

  const [editEdgeSourceId, setEditEdgeSourceId] = useState("");
  const [editEdgeTargetId, setEditEdgeTargetId] = useState("");
  const [editEdgeTypeId, setEditEdgeTypeId] = useState("");
  const [editEdgeDescription, setEditEdgeDescription] = useState("");
  const [editEdgeProperties, setEditEdgeProperties] = useState<PropertyRow[]>(
    [],
  );

  const [editNodeTypeId, setEditNodeTypeId] = useState("");
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeDescription, setEditNodeDescription] = useState("");
  const [editNodeProperties, setEditNodeProperties] = useState<PropertyRow[]>(
    [],
  );

  const [metrics, setMetrics] = useState<ReactFlowMetrics>({
    adapterMs: 0,
    initializationMs: 0,
    firstRenderMs: null,
    layoutMs: null,
  });


  const [selectedNodeType, setSelectedNodeType] = useState("all");
  const [selectedEdgeType, setSelectedEdgeType] = useState("all");

  const [pathStart, setPathStart] = useState("");
  const [pathEnd, setPathEnd] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [availableNodeTypes, setAvailableNodeTypes] = useState<NodeType[]>([]);
  const [availableEdgeTypes, setAvailableEdgeTypes] = useState<EdgeType[]>([]);
  const [newNodeTypeId, setNewNodeTypeId] = useState("");
  const [newNodeProperties, setNewNodeProperties] = useState<PropertyRow[]>([]);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeDescription, setNewNodeDescription] = useState("");

  const [newEdgeSourceId, setNewEdgeSourceId] = useState("");
  const [newEdgeTargetId, setNewEdgeTargetId] = useState("");
  const [newEdgeTypeId, setNewEdgeTypeId] = useState("");
  const [newEdgeDescription, setNewEdgeDescription] = useState("");
  const [newEdgeProperties, setNewEdgeProperties] = useState<PropertyRow[]>([]);
  const nodeTypes = [
    ...new Set(graphData.nodes.map((node) => node.type)),
  ].sort();
  const edgeTypes = [
    ...new Set(graphData.edges.map((edge) => edge.type)),
  ].sort();

  const resetHighlighting = useCallback(() => {
    setBranchSelection(null);
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        selected: false,
        style: {
          ...node.style,
          opacity: 1,
          border: "2px solid #ffffff",
        },
      })),
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({
        ...edge,
        selected: false,
        style: {
          ...edge.style,
          opacity: 1,
          stroke: "#94a3b8",
          strokeWidth: 2,
        },
        markerEnd:
          typeof edge.markerEnd === "object"
            ? {
                ...edge.markerEnd,
                color: "#94a3b8",
              }
            : edge.markerEnd,
      })),
    );

    setSelectedElement("None");
    setSelectedNodeForEdit(null);
    setSelectedEdgeForEdit(null);
    setActionMessage("");
  }, [setEdges, setNodes]);

  function fitNodeIds(nodeIds: Set<string>) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const instance = instanceRef.current;

        if (!instance) {
          return;
        }

        const matchingNodes = instance
          .getNodes()
          .filter((node) => nodeIds.has(node.id));

        if (matchingNodes.length > 0) {
          void instance.fitView({
            nodes: matchingNodes,
            padding: 0.2,
            duration: 300,
          });
        }
      });
    });
  }

  function restoreAllElements() {
    setBranchSelection(null);
    setSelectedNodeType("all");
    setSelectedEdgeType("all");
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        hidden: false,
        selected: false,
        style: {
          ...node.style,
          opacity: 1,
          border: "2px solid #ffffff",
        },
      })),
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({
        ...edge,
        hidden: false,
        selected: false,
        style: {
          ...edge.style,
          opacity: 1,
          stroke: "#94a3b8",
          strokeWidth: 2,
        },
        markerEnd:
          typeof edge.markerEnd === "object"
            ? {
                ...edge.markerEnd,
                color: "#94a3b8",
              }
            : edge.markerEnd,
      })),
    );

    setSelectedElement("None");
    setSelectedNodeForEdit(null);
    setSelectedEdgeForEdit(null);
  }
  const handleNodeClick: NodeMouseHandler<ReactFlowNode> = useCallback(

    (event, selectedNode) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();

        if (branchSelection?.graph === graphData) {
          return;
        }

        setManualGroup((currentGroup) =>
          toggleGroupMember(currentGroup, selectedNode.id),
        );

        return;
      }
      if (
        branchSelection?.graph === graphData &&
        selectedNode.id === branchSelection.anchorId
      ) {
        return;
      }

      setBranchSelection(null);

      const connectedEdgeIds = new Set(
        graphData.edges
          .filter(
            (edge) =>
              `n-${edge.source}` === selectedNode.id ||
              `n-${edge.target}` === selectedNode.id,
          )
          .map((edge) => `e-${edge.id}`),
      );

      const neighbourNodeIds = new Set<string>([selectedNode.id]);

      for (const edge of graphData.edges) {
        if (`n-${edge.source}` === selectedNode.id) {
          neighbourNodeIds.add(`n-${edge.target}`);
        }

        if (`n-${edge.target}` === selectedNode.id) {
          neighbourNodeIds.add(`n-${edge.source}`);
        }
      }

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const highlighted = neighbourNodeIds.has(node.id);

          return {
            ...node,
            selected: node.id === selectedNode.id,
            style: {
              ...node.style,
              opacity: highlighted ? 1 : 0.12,
              border: highlighted ? "3px solid #ef4444" : "2px solid #ffffff",
            },
          };
        }),
      );

      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          const highlighted = connectedEdgeIds.has(edge.id);

          return {
            ...edge,
            selected: false,
            style: {
              ...edge.style,
              opacity: highlighted ? 1 : 0.1,
              stroke: highlighted ? "#ef4444" : "#cbd5e1",
              strokeWidth: highlighted ? 4 : 1,
            },
            markerEnd:
              typeof edge.markerEnd === "object"
                ? {
                    ...edge.markerEnd,
                    color: highlighted ? "#ef4444" : "#cbd5e1",
                  }
                : edge.markerEnd,
          };
        }),
      );
      setSelectedEdgeForEdit(null);
      setSelectedNodeForEdit(selectedNode);

      const selectedGraphNode = graphData.nodes.find(
        (node) => `n-${node.id}` === selectedNode.id,
      );

      const selectedNodeType = availableNodeTypes.find(
        (type) => type.code === selectedNode.data.nodeType,
      );

      setEditNodeTypeId(selectedNodeType ? String(selectedNodeType.id) : "");

      setEditNodeName(
        selectedGraphNode?.label ?? String(selectedNode.data.label),
      );

      setEditNodeDescription(selectedGraphNode?.description ?? "");

      setEditNodeProperties(
        objectToPropertyRows(selectedGraphNode?.attributes ?? {}),
      );

      setSelectedElement(`Node: ${String(selectedNode.data.label)}`);
    },
    [graphData, branchSelection, availableNodeTypes, setEdges, setNodes],
  );

  const handleEdgeClick: EdgeMouseHandler<ReactFlowEdge> = useCallback(
    (_event, selectedEdge) => {
      setBranchSelection(null);

      setSelectedNodeForEdit(null);
      setSelectedEdgeForEdit(selectedEdge);
      const selectedGraphEdge = graphData.edges.find(
        (edge) => `e-${edge.id}` === selectedEdge.id,
      );

      const selectedEdgeType = availableEdgeTypes.find(
        (type) => type.code === selectedEdge.data?.edgeType,
      );

      setEditEdgeSourceId(
        selectedGraphEdge ? String(selectedGraphEdge.source) : "",
      );

      setEditEdgeTargetId(
        selectedGraphEdge ? String(selectedGraphEdge.target) : "",
      );

      setEditEdgeTypeId(selectedEdgeType ? String(selectedEdgeType.id) : "");

      setEditEdgeDescription(selectedGraphEdge?.description ?? "");

      setEditEdgeProperties(
        objectToPropertyRows(selectedGraphEdge?.attributes ?? {}),
      );

      const connectedNodeIds = new Set([
        selectedEdge.source,
        selectedEdge.target,
      ]);

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const highlighted = connectedNodeIds.has(node.id);

          return {
            ...node,
            selected: false,
            style: {
              ...node.style,
              opacity: highlighted ? 1 : 0.12,
              border: highlighted ? "3px solid #ef4444" : "2px solid #ffffff",
            },
          };
        }),
      );

      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          const highlighted = edge.id === selectedEdge.id;

          return {
            ...edge,
            selected: highlighted,
            style: {
              ...edge.style,
              opacity: highlighted ? 1 : 0.1,
              stroke: highlighted ? "#ef4444" : "#cbd5e1",
              strokeWidth: highlighted ? 4 : 1,
            },
            markerEnd:
              typeof edge.markerEnd === "object"
                ? {
                    ...edge.markerEnd,
                    color: highlighted ? "#ef4444" : "#cbd5e1",
                  }
                : edge.markerEnd,
          };
        }),
      );

      setSelectedElement(`Edge: ${String(selectedEdge.label)}`);
    },
    [graphData.edges, availableEdgeTypes, setEdges, setNodes],
  );

  function handleSearchResult(result: GraphSearchResult) {
    setBranchSelection(null);

    const selectedNodeIds =
      result.kind === "node"
        ? new Set([`n-${result.id}`])
        : new Set([`n-${result.source}`, `n-${result.target}`]);

    const selectedEdgeId =
      result.kind === "edge" ? `e-${result.id}` : null;

    setSelectedNodeType("all");
    setSelectedEdgeType("all");
    setSelectedNodeForEdit(null);
    setSelectedEdgeForEdit(null);

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const isSelectedNode =
          result.kind === "node" && selectedNodeIds.has(node.id);

        const isEndpoint =
          result.kind === "edge" && selectedNodeIds.has(node.id);

        return {
          ...node,
          hidden: false,
          selected: isSelectedNode,
          style: {
            ...node.style,
            opacity: 1,
            border: isSelectedNode
              ? "3px solid #ef4444"
              : isEndpoint
                ? "3px solid #f59e0b"
                : "2px solid #ffffff",
          },
        };
      }),
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const isSelectedEdge = edge.id === selectedEdgeId;

        return {
          ...edge,
          hidden: false,
          selected: isSelectedEdge,
          style: {
            ...edge.style,
            opacity: 1,
            stroke: isSelectedEdge ? "#ef4444" : "#94a3b8",
            strokeWidth: isSelectedEdge ? 4 : 2,
          },
          markerEnd:
            typeof edge.markerEnd === "object"
              ? {
                  ...edge.markerEnd,
                  color: isSelectedEdge ? "#ef4444" : "#94a3b8",
                }
              : edge.markerEnd,
        };
      }),
    );

    if (result.kind === "node") {
      const flowNodeId = `n-${result.id}`;

      setSelectedElement(`Node: ${result.title}`);
      setActionMessage(`Found ${result.detail}`);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const instance = instanceRef.current;
          const flowNode = instance?.getNode(flowNodeId);

          if (!instance || !flowNode) {
            return;
          }

          void instance.setCenter(
            flowNode.position.x + NODE_WIDTH / 2,
            flowNode.position.y + NODE_HEIGHT / 2,
            {
              zoom: 1.5,
              duration: 300,
            },
          );
        });
      });

      return;
    }

    setSelectedElement(`Edge: ${result.title}`);
    setActionMessage(`Found ${result.detail}`);
    fitNodeIds(selectedNodeIds);
  }

  function applyTypeFilters(nodeType: string, edgeType: string) {
    setBranchSelection(null);

    const visibleNodeIds = new Set(
      graphData.nodes
        .filter((node) => nodeType === "all" || node.type === nodeType)
        .map((node) => `n-${node.id}`),
    );

    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        hidden: !visibleNodeIds.has(node.id),
        selected: false,
        style: {
          ...node.style,
          opacity: 1,
          border: "2px solid #ffffff",
        },
      })),
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const endpointsVisible =
          visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target);

        const typeVisible =
          edgeType === "all" || edge.data?.edgeType === edgeType;

        return {
          ...edge,
          hidden: !endpointsVisible || !typeVisible,
          selected: false,
          style: {
            ...edge.style,
            opacity: 1,
            stroke: "#94a3b8",
            strokeWidth: 2,
          },
          markerEnd:
            typeof edge.markerEnd === "object"
              ? {
                  ...edge.markerEnd,
                  color: "#94a3b8",
                }
              : edge.markerEnd,
        };
      }),
    );

    setSelectedElement("None");

    if (nodeType === "all" && edgeType === "all") {
      setActionMessage("Showing all Node and Edge types");
    } else {
      const nodeMessage =
        nodeType === "all" ? "all Node types" : `Node type: ${nodeType}`;

      const edgeMessage =
        edgeType === "all" ? "all Edge types" : `Edge type: ${edgeType}`;

      setActionMessage(`Showing ${nodeMessage}; ${edgeMessage}`);
    }

    fitNodeIds(visibleNodeIds);
  }

  function handleNodeTypeFilter(nodeType: string) {
    setSelectedNodeType(nodeType);
    applyTypeFilters(nodeType, selectedEdgeType);
  }

  function handleEdgeTypeFilter(edgeType: string) {
    setSelectedEdgeType(edgeType);
    applyTypeFilters(selectedNodeType, edgeType);
  }

  async function handleUpdateEdge() {
    if (layout.isLocked()) return;
    if (!selectedEdgeForEdit) {
      return;
    }

    if (!selectedEdgeForEdit.data) {
      setActionMessage("Selected Edge has no data");
      return;
    }

    const sourceNodeId = Number(editEdgeSourceId);
    const targetNodeId = Number(editEdgeTargetId);
    const edgeTypeId = Number(editEdgeTypeId);

    if (!Number.isInteger(sourceNodeId) || sourceNodeId <= 0) {
      setActionMessage("Select a valid source Node");
      return;
    }

    if (!Number.isInteger(targetNodeId) || targetNodeId <= 0) {
      setActionMessage("Select a valid target Node");
      return;
    }

    if (!Number.isInteger(edgeTypeId) || edgeTypeId <= 0) {
      setActionMessage("Select a valid Edge type");
      return;
    }

    const properties = propertyRowsToObject(editEdgeProperties);

    setIsUpdatingEdge(true);

    try {
      await updateEdge(selectedEdgeForEdit.data.originalId, {
        source_node_id: sourceNodeId,
        target_node_id: targetNodeId,
        edge_type_id: edgeTypeId,
        description: editEdgeDescription.trim() || null,
        properties,
      });

      await onGraphChanged();

      setSelectedEdgeForEdit(null);
      setActionMessage("Edge updated");
    } catch (updateError) {
      setActionMessage(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update Edge",
      );
    } finally {
      setIsUpdatingEdge(false);
    }
  }

  async function handleDeleteEdge() {
    if (layout.isLocked()) return;
    if (!selectedEdgeForEdit?.data) {
      return;
    }

    const edgeId = selectedEdgeForEdit.data.originalId;

    setIsDeletingEdge(true);

    try {
      await deleteEdge(edgeId);

      await onGraphChanged();

      setSelectedEdgeForEdit(null);
      setSelectedElement("None");
      setActionMessage("Edge deleted");
    } catch (deleteError) {
      setActionMessage(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete Edge",
      );
    } finally {
      setIsDeletingEdge(false);
    }
  }

  function handleShowFreeNodes() {
    setBranchSelection(null);

    const freeNodeIds = new Set(
      findUnconnectedNodeIds(graphData).map(
        (nodeId) => `n-${nodeId}`,
      ),
    );

    setSelectedNodeType("all");
    setSelectedEdgeType("all");
    setSelectedNodeForEdit(null);
    setSelectedEdgeForEdit(null);

    if (freeNodeIds.size === 0) {
      restoreAllElements();
      setActionMessage("No free Nodes found");
      return;
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const isFreeNode = freeNodeIds.has(node.id);

        return {
          ...node,
          hidden: false,
          selected: false,
          style: {
            ...node.style,
            opacity: isFreeNode ? 1 : 0.08,
            border: isFreeNode
              ? "4px solid #16a34a"
              : "2px solid #ffffff",
          },
        };
      }),
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({
        ...edge,
        hidden: false,
        selected: false,
        style: {
          ...edge.style,
          opacity: 0.08,
          stroke: "#cbd5e1",
          strokeWidth: 1,
        },
        markerEnd:
          typeof edge.markerEnd === "object"
            ? {
                ...edge.markerEnd,
                color: "#cbd5e1",
              }
            : edge.markerEnd,
      })),
    );

    setSelectedElement(`Free Nodes: ${freeNodeIds.size}`);

    setActionMessage(
      `${freeNodeIds.size} free Node${freeNodeIds.size === 1 ? "" : "s"} found`,
    );

    fitNodeIds(freeNodeIds);
  }

  function handleHighlightPathsToStart() {
    setBranchSelection(null);

    if (!selectedNodeForEdit) {
      setActionMessage("Select a Node first");
      return;
    }

    const selectedNodeId = selectedNodeForEdit.data.originalId;

    const ancestorSubgraph = findPathsToStart(
      graphData,
      selectedNodeId,
    );

    if (!ancestorSubgraph) {
      setActionMessage(`Node not found: ${selectedNodeId}`);
      return;
    }

    const ancestorNodeIds = new Set(
      ancestorSubgraph.nodeIds.map((nodeId) => `n-${nodeId}`),
    );

    const ancestorEdgeIds = new Set(
      ancestorSubgraph.edgeIds.map((edgeId) => `e-${edgeId}`),
    );

    const rootNodeIds = new Set(
      ancestorSubgraph.rootNodeIds.map((nodeId) => `n-${nodeId}`),
    );

    const selectedFlowNodeId = `n-${selectedNodeId}`;

    setSelectedNodeType("all");
    setSelectedEdgeType("all");
    setSelectedEdgeForEdit(null);

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const isInPath = ancestorNodeIds.has(node.id);
        const isSelectedNode = node.id === selectedFlowNodeId;
        const isRootNode = rootNodeIds.has(node.id);

        let border = "2px solid #ffffff";

        if (isInPath) {
          border = "3px solid #f59e0b";
        }

        if (isRootNode) {
          border = "3px solid #16a34a";
        }

        if (isSelectedNode) {
          border = "4px solid #ef4444";
        }

        return {
          ...node,
          hidden: false,
          selected: isSelectedNode,
          style: {
            ...node.style,
            opacity: isInPath ? 1 : 0.08,
            border,
          },
        };
      }),
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const isInPath = ancestorEdgeIds.has(edge.id);

        return {
          ...edge,
          hidden: false,
          selected: false,
          style: {
            ...edge.style,
            opacity: isInPath ? 1 : 0.08,
            stroke: isInPath ? "#ef4444" : "#cbd5e1",
            strokeWidth: isInPath ? 4 : 1,
          },
          markerEnd:
            typeof edge.markerEnd === "object"
              ? {
                  ...edge.markerEnd,
                  color: isInPath ? "#ef4444" : "#cbd5e1",
                }
              : edge.markerEnd,
        };
      }),
    );

    setSelectedElement(
      `Paths to start: ${String(selectedNodeForEdit.data.label)}`,
    );

    const rootMessage =
      ancestorSubgraph.rootNodeIds.length === 0
        ? "no root Node found"
        : `${ancestorSubgraph.rootNodeIds.length} root Node${
            ancestorSubgraph.rootNodeIds.length === 1 ? "" : "s"
          }`;

    setActionMessage(
      `Paths to start: ${ancestorSubgraph.nodeIds.length} Nodes, ` +
        `${ancestorSubgraph.edgeIds.length} Edges, ${rootMessage}`,
    );

    fitNodeIds(ancestorNodeIds);
  }

  function handleHighlightPath() {
    setBranchSelection(null);

    const startValue = pathStart.trim();
    const endValue = pathEnd.trim();

    if (!startValue || !endValue) {
      setActionMessage("Enter both path Node IDs");
      return;
    }

    const startNodeId = Number(startValue);
    const endNodeId = Number(endValue);

    if (!Number.isInteger(startNodeId) || !Number.isInteger(endNodeId)) {
      setActionMessage("Path Node IDs must be integers");
      return;
    }

    const path = findDirectedPath(graphData, startNodeId, endNodeId);

    setSelectedNodeType("all");
    setSelectedEdgeType("all");

    if (!path) {
      /*
       * A failed valid search must clear the previous
       * path so stale highlighting is not misleading.
       */
      restoreAllElements();

      setActionMessage(`No directed path from ${startNodeId} to ${endNodeId}`);

      return;
    }

    const pathNodeIds = new Set(path.nodeIds.map((nodeId) => `n-${nodeId}`));

    const pathEdgeIds = new Set(path.edgeIds.map((edgeId) => `e-${edgeId}`));

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const highlighted = pathNodeIds.has(node.id);

        return {
          ...node,
          hidden: false,
          selected: false,
          style: {
            ...node.style,
            opacity: highlighted ? 1 : 0.08,
            border: highlighted ? "3px solid #ef4444" : "2px solid #ffffff",
          },
        };
      }),
    );

    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const highlighted = pathEdgeIds.has(edge.id);

        return {
          ...edge,
          hidden: false,
          selected: false,
          style: {
            ...edge.style,
            opacity: highlighted ? 1 : 0.06,
            stroke: highlighted ? "#ef4444" : "#cbd5e1",
            strokeWidth: highlighted ? 4 : 1,
          },
          markerEnd:
            typeof edge.markerEnd === "object"
              ? {
                  ...edge.markerEnd,
                  color: highlighted ? "#ef4444" : "#cbd5e1",
                }
              : edge.markerEnd,
        };
      }),
    );

    const startNodeLabel =
      graphData.nodes.find((node) => node.id === startNodeId)?.label ??
      String(startNodeId);

    const endNodeLabel =
      graphData.nodes.find((node) => node.id === endNodeId)?.label ??
      String(endNodeId);

    setSelectedElement(`Path: ${startNodeLabel} → ${endNodeLabel}`);

    setActionMessage(
      `Path found: ${path.nodeIds.length} nodes, ${path.edgeIds.length} edges`,
    );

    fitNodeIds(pathNodeIds);
  }

  const runLayout = useCallback(
    (layoutName: LayoutName) => {
      if (layout.isLocked() || layout.blocked) return;
      if (layout.dirty && !window.confirm(
        "This will replace the current unsaved node arrangement. Continue?",
      )) return;
      setBranchSelection(null);

      const layoutStartedAt = performance.now();

      currentLayoutRef.current = layoutName;

      const positionedNodes = positionNodes(nodes, edges, layoutName);

      setNodes(positionedNodes);

      setMetrics((current) => ({
        ...current,
        layoutMs: performance.now() - layoutStartedAt,
      }));

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void instanceRef.current?.fitView({
            padding: 0.1,
            duration: 300,
          });
        });
      });
    },
    [edges, nodes, setNodes, layout.isLocked, layout.blocked, layout.dirty],
  );

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      fetchNodeTypes(controller.signal),
      fetchEdgeTypes(controller.signal),
    ])
      .then(([nodeTypes, edgeTypes]) => {
        setAvailableNodeTypes(nodeTypes);
        setAvailableEdgeTypes(edgeTypes);

        if (nodeTypes.length > 0) {
          setNewNodeTypeId(String(nodeTypes[0].id));
        }

        if (edgeTypes.length > 0) {
          setNewEdgeTypeId(String(edgeTypes[0].id));
        }
      })
      .catch((loadError) => {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setActionMessage(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load graph types",
        );
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const adapterStartedAt = performance.now();
    const elements = toReactFlowElements(graphData);
    const adapterMs = performance.now() - adapterStartedAt;

    const initializationStartedAt = performance.now();
    const renderStartedAt = performance.now();

    setNodes((currentNodes) => {
      // Initial load: apply the selected automatic layout.
      if (currentNodes.length === 0) {
        return positionNodes(
          elements.nodes,
          elements.edges,
          currentLayoutRef.current,
        );
      }

      const previousById = new Map(
        currentNodes.map((node) => [node.id, node]),
      );

      const newNodes = elements.nodes.filter(
        (node) => !previousById.has(node.id),
      );

      // Place new nodes to the right without rearranging existing ones.
      const rightEdge = Math.max(
        ...currentNodes.map(
          (node) =>
            node.position.x +
            (node.measured?.width ?? NODE_WIDTH),
        ),
      );

      const topEdge = Math.min(
        ...currentNodes.map((node) => node.position.y),
      );

      const newPositions = new Map(
        newNodes.map((node, index) => [
          node.id,
          {
            x: rightEdge + 100 + (index % 4) * 220,
            y: topEdge + Math.floor(index / 4) * 120,
          },
        ]),
      );

      return elements.nodes.map((node) => {
        const previous = previousById.get(node.id);

        return {
          ...node,
          position:
            previous?.position ??
            newPositions.get(node.id) ??
            node.position,
        };
      });
    });

    const existingNodeIds = new Set(
      elements.nodes.map((node) => node.id),
    );

    setManualGroup((currentGroup) =>
      reconcileGroup(currentGroup, existingNodeIds),
    );

    setEdges(elements.edges);
    setSelectedElement("None");
    setSelectedNodeForEdit(null);
    setSelectedEdgeForEdit(null);
    setSelectedNodeType("all");
    setSelectedEdgeType("all");

    setMetrics({
      adapterMs,
      initializationMs: performance.now() - initializationStartedAt,
      firstRenderMs: null,
      layoutMs: null,
    });

    let secondFrame: number | null = null;

    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setMetrics((current) => ({
          ...current,
          firstRenderMs: performance.now() - renderStartedAt,
        }));
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);

      if (secondFrame !== null) {
        cancelAnimationFrame(secondFrame);
      }
    };
  }, [graphData, setEdges, setNodes]);

  async function handleCreateNode() {
    if (layout.isLocked()) return;
    const name = newNodeName.trim();
    const nodeTypeId = Number(newNodeTypeId);

    if (!name) {
      setActionMessage("Node name is required");
      return;
    }

    if (!Number.isInteger(nodeTypeId) || nodeTypeId <= 0) {
      setActionMessage("Select a valid Node type");
      return;
    }

    const properties = propertyRowsToObject(newNodeProperties);

    setIsCreatingNode(true);

    try {
      await createNode({
        node_type_id: nodeTypeId,
        display_name: name,
        description: newNodeDescription.trim() || null,
        properties,
      });

      await onGraphChanged();

      setNewNodeName("");
      setNewNodeDescription("");
      setNewNodeProperties([]);
      setActionMessage(`Node created: ${name}`);
    } catch (createError) {
      setActionMessage(
        createError instanceof Error
          ? createError.message
          : "Failed to create Node",
      );
    } finally {
      setIsCreatingNode(false);
    }
  }

  async function handleCreateEdge() {
    if (layout.isLocked()) return;
    const sourceNodeId = Number(newEdgeSourceId);
    const targetNodeId = Number(newEdgeTargetId);
    const edgeTypeId = Number(newEdgeTypeId);

    if (!Number.isInteger(sourceNodeId) || sourceNodeId <= 0) {
      setActionMessage("Select a valid source Node");
      return;
    }

    if (!Number.isInteger(targetNodeId) || targetNodeId <= 0) {
      setActionMessage("Select a valid target Node");
      return;
    }

    if (!Number.isInteger(edgeTypeId) || edgeTypeId <= 0) {
      setActionMessage("Select a valid Edge type");
      return;
    }

    const properties = propertyRowsToObject(newEdgeProperties);

    setIsCreatingEdge(true);

    try {
      await createEdge({
        source_node_id: sourceNodeId,
        target_node_id: targetNodeId,
        edge_type_id: edgeTypeId,
        description: newEdgeDescription.trim() || null,
        properties,
      });

      await onGraphChanged();

      setNewEdgeSourceId("");
      setNewEdgeTargetId("");
      setNewEdgeDescription("");
      setNewEdgeProperties([]);

      setActionMessage("Edge created");
    } catch (createError) {
      setActionMessage(
        createError instanceof Error
          ? createError.message
          : "Failed to create Edge",
      );
    } finally {
      setIsCreatingEdge(false);
    }
  }

  async function handleUpdateNode() {
    if (layout.isLocked()) return;
    if (!selectedNodeForEdit) {
      return;
    }

    const name = editNodeName.trim();
    const nodeTypeId = Number(editNodeTypeId);

    if (!name) {
      setActionMessage("Node name is required");
      return;
    }

    if (!Number.isInteger(nodeTypeId) || nodeTypeId <= 0) {
      setActionMessage("Select a valid Node type");
      return;
    }

    const properties = propertyRowsToObject(editNodeProperties);

    setIsUpdatingNode(true);

    try {
      await updateNode(selectedNodeForEdit.data.originalId, {
        node_type_id: nodeTypeId,
        display_name: name,
        description: editNodeDescription.trim() || null,
        properties,
      });

      await onGraphChanged();

      setSelectedNodeForEdit(null);
      setActionMessage(`Node updated: ${name}`);
    } catch (updateError) {
      setActionMessage(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update Node",
      );
    } finally {
      setIsUpdatingNode(false);
    }
  }

  async function handleDeleteNode() {
    if (layout.isLocked()) return;
    if (!selectedNodeForEdit) {
      return;
    }

    const nodeId = selectedNodeForEdit.data.originalId;

    setIsDeletingNode(true);

    try {
      await deleteNode(nodeId);

      await onGraphChanged();

      setSelectedNodeForEdit(null);
      setSelectedElement("None");
      setActionMessage("Node deleted");
    } catch (deleteError) {
      setActionMessage(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete Node",
      );
    } finally {
      setIsDeletingNode(false);
    }
  }

return (
  <section className="react-flow-panel">
    <aside className="react-flow-sidebar">
      <div className="react-flow-header">
        <strong>My Way tools</strong>
      </div>

      <div className="react-flow-sidebar__content">
        <div className="react-flow-toolbar">
        <LayoutControls layout={layout} onRefreshGraph={refreshGraphForLayout} />
        {diagnosticsRef.current && (
          <button
            type="button"
            onClick={exportDiagnostics}
          >
            Export diagnostics
          </button>
        )}
        <div>
          <strong>Create Node</strong>
          <label>
            Type{" "}
            <select
              value={newNodeTypeId}
              onChange={(event) => setNewNodeTypeId(event.target.value)}
              disabled={layout.locked || isCreatingNode || availableNodeTypes.length === 0}
            >
              {availableNodeTypes.map((nodeType) => (
                <option key={nodeType.id} value={nodeType.id}>
                  {nodeType.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Name{" "}
            <input
              type="text"
              value={newNodeName}
              onChange={(event) => setNewNodeName(event.target.value)}
              disabled={isCreatingNode}
            />
          </label>

          <label>
            Description{" "}
            <input
              type="text"
              value={newNodeDescription}
              onChange={(event) => setNewNodeDescription(event.target.value)}
              disabled={isCreatingNode}
            />
          </label>

          <div className="react-flow-properties">
            <strong>Properties</strong>

            {newNodeProperties.map((row, index) => (
              <div key={index}>
                <input
                  type="text"
                  placeholder="Key"
                  value={row.key}
                  onChange={(event) => {
                    const value = event.target.value;

                    setNewNodeProperties((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: value } : item,
                      ),
                    );
                  }}
                  disabled={isCreatingNode}
                />

                <input
                  type="text"
                  placeholder="Value"
                  value={row.value}
                  onChange={(event) => {
                    const value = event.target.value;

                    setNewNodeProperties((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value } : item,
                      ),
                    );
                  }}
                  disabled={isCreatingNode}
                />

                <button
                  type="button"
                  onClick={() =>
                    setNewNodeProperties((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  disabled={isCreatingNode}
                >
                  Remove
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setNewNodeProperties((current) => [
                  ...current,
                  { key: "", value: "" },
                ])
              }
              disabled={isCreatingNode}
            >
              Add property
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleCreateNode()}
            disabled={layout.locked || isCreatingNode || availableNodeTypes.length === 0}
          >
            {isCreatingNode ? "Creating…" : "Add Node"}
          </button>
        </div>

        <div>
          <strong>Create Edge</strong>

          <NodeSearchSelect
            nodes={graphData.nodes}
            value={newEdgeSourceId}
            placeholder="Source Node"
            disabled={isCreatingEdge}
            onChange={setNewEdgeSourceId}
          />

          <NodeSearchSelect
            nodes={graphData.nodes}
            value={newEdgeTargetId}
            placeholder="Target Node"
            disabled={isCreatingEdge}
            onChange={setNewEdgeTargetId}
          />

          <select
            value={newEdgeTypeId}
            onChange={(event) => setNewEdgeTypeId(event.target.value)}
            disabled={isCreatingEdge}
          >
            {availableEdgeTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Description"
            value={newEdgeDescription}
            onChange={(event) => setNewEdgeDescription(event.target.value)}
            disabled={isCreatingEdge}
          />

          <div className="react-flow-properties">
            <strong>Properties</strong>

            {newEdgeProperties.map((row, index) => (
              <div key={index}>
                <input
                  type="text"
                  placeholder="Key"
                  value={row.key}
                  onChange={(event) => {
                    const value = event.target.value;

                    setNewEdgeProperties((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: value } : item,
                      ),
                    );
                  }}
                  disabled={isCreatingEdge}
                />

                <input
                  type="text"
                  placeholder="Value"
                  value={row.value}
                  onChange={(event) => {
                    const value = event.target.value;

                    setNewEdgeProperties((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value } : item,
                      ),
                    );
                  }}
                  disabled={isCreatingEdge}
                />

                <button
                  type="button"
                  onClick={() =>
                    setNewEdgeProperties((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  disabled={isCreatingEdge}
                >
                  Remove
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setNewEdgeProperties((current) => [
                  ...current,
                  { key: "", value: "" },
                ])
              }
              disabled={isCreatingEdge}
            >
              Add property
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleCreateEdge()}
            disabled={
              layout.locked || isCreatingEdge ||
              graphData.nodes.length === 0 ||
              availableEdgeTypes.length === 0
            }
          >
            {isCreatingEdge ? "Creating..." : "Add Edge"}
          </button>
        </div>

        <div>
          <strong>Arrange nodes</strong>
          <button type="button" disabled={layout.blocked} onClick={() => runLayout("grid")}>
            Grid
          </button>

          <button type="button" disabled={layout.blocked} onClick={() => runLayout("circle")}>
            Circle
          </button>

          <button type="button" disabled={layout.blocked} onClick={() => runLayout("dagre")}>
            Dagre
          </button>

          <button
            type="button"
            onClick={() => {
              void instanceRef.current?.fitView({
                padding: 0.1,
                duration: 300,
              });
            }}
          >
            Fit
          </button>

          <button type="button" onClick={resetHighlighting}>
            Reset selection
          </button>
        </div>
      </div>

      <div className="react-flow-product-controls">
        <GraphSearchPanel
          graph={graphData}
          onSelect={handleSearchResult}
        />

        <div className="react-flow-control-group">
          <label htmlFor="react-flow-node-type">Node type</label>

          <select
            id="react-flow-node-type"
            value={selectedNodeType}
            onChange={(event) => {
              handleNodeTypeFilter(event.target.value);
            }}
          >
            <option value="all">All types</option>

            {nodeTypes.map((nodeType) => (
              <option key={nodeType} value={nodeType}>
                {nodeType}
              </option>
            ))}
          </select>
        </div>

        <div className="react-flow-control-group">
          <label htmlFor="react-flow-edge-type">Edge type</label>

          <select
            id="react-flow-edge-type"
            value={selectedEdgeType}
            onChange={(event) => {
              handleEdgeTypeFilter(event.target.value);
            }}
          >
            <option value="all">All types</option>

            {edgeTypes.map((edgeType) => (
              <option key={edgeType} value={edgeType}>
                {edgeType}
              </option>
            ))}
          </select>
        </div>



        <div className="react-flow-control-group react-flow-path-controls">

          <label>From</label>

            <NodeSearchSelect
              nodes={graphData.nodes}
              value={pathStart}
              placeholder="Start Node"
              onChange={setPathStart}
            />

          <label>To</label>

            <NodeSearchSelect
              nodes={graphData.nodes}
              value={pathEnd}
              placeholder="End Node"
              onChange={setPathEnd}
            />

          <button type="button" onClick={handleHighlightPath}>
            Find path
          </button>
        </div>

        <div className="react-flow-control-group">
          <label>Navigation</label>

          <button
            type="button"
            onClick={handleSelectBranch}
            disabled={!selectedNodeForEdit || Boolean(activeManualGroup)}
            title={
              activeManualGroup
                ? "Clear the manual group before selecting a branch"
                : selectedNodeForEdit
                  ? "Select this Node and all its descendants"
                  : "Select a Node first"
            }
          >
            Select branch
          </button>

          <span>
            Manual group: Ctrl/Cmd + click to add or remove a Node.
            <br />
            Shift + drag: replace; Ctrl/Cmd + Shift + drag: add.
            {activeBranch && (
              <> Clear branch selection before selecting manual members.</>
            )}
          </span>

          {activeManualGroup && (
            <>
              <button
                type="button"
                onClick={() => setManualGroup(null)}
              >
                Clear group
              </button>

              <span>
                Manual group: {activeManualGroup.nodeIds.size} selected;{" "}
                {visibleManualCount} visible,{" "}
                {activeManualGroup.nodeIds.size - visibleManualCount} hidden
                <br />
                Drag any member to move the group.
                <br />
                Focus a member: Arrow keys move 10;
                Shift + Arrow moves 50.
              </span>
            </>
          )}

          <button
            type="button"
            disabled={!activeBranch}
            onClick={() => {
              if (!activeBranch) {
                return;
              }

              setManualGroup({
                nodeIds: new Set(activeBranch.nodeIds),
              });

              setBranchSelection(null);
            }}
          >
            Convert to manual group
          </button>

          <button
            type="button"
            onClick={() => setBranchSelection(null)}
            disabled={!activeBranch}
          >
            Cancel branch selection
          </button>

          {activeBranch && (
            <span>
              Selected branch: {activeBranch.nodeIds.size} of{" "}
              {graphData.nodes.length} Nodes; {visibleBranchCount} visible,{" "}
              {activeBranch.nodeIds.size - visibleBranchCount} hidden
              <br />
              Arrow keys: move 10; Shift + Arrow: move 50
            </span>
          )}

          <button
            type="button"
            onClick={handleHighlightPathsToStart}
            disabled={!selectedNodeForEdit}
            title={
              selectedNodeForEdit
                ? "Show every incoming path to this Node"
                : "Select a Node first"
            }
          >
            Paths to start
          </button>

          <button
            type="button"
            onClick={handleShowFreeNodes}
            title="Show Nodes without incoming or outgoing Edges"
          >
            Show free Nodes
          </button>
        </div>

        {actionMessage && (
          <span className="react-flow-action-message">{actionMessage}</span>
        )}
      </div>

          <div className="react-flow-edit-panel">
        {selectedNodeForEdit && (
          <div>
            <strong>Edit Node</strong>

            <select
              value={editNodeTypeId}
              onChange={(event) => setEditNodeTypeId(event.target.value)}
            >
              {availableNodeTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={editNodeName}
              onChange={(event) => setEditNodeName(event.target.value)}
              placeholder="Name"
            />

            <input
              type="text"
              value={editNodeDescription}
              onChange={(event) => setEditNodeDescription(event.target.value)}
              placeholder="Description"
            />

            <div>
              <strong>Properties</strong>

              {editNodeProperties.map((row, index) => (
                <div key={index}>
                  <input
                    type="text"
                    value={row.key}
                    placeholder="Key"
                    onChange={(event) => {
                      const value = event.target.value;

                      setEditNodeProperties((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, key: value } : item,
                        ),
                      );
                    }}
                  />

                  <input
                    type="text"
                    value={row.value}
                    placeholder="Value"
                    onChange={(event) => {
                      const value = event.target.value;

                      setEditNodeProperties((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, value } : item,
                        ),
                      );
                    }}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setEditNodeProperties((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setEditNodeProperties((current) => [
                    ...current,
                    { key: "", value: "" },
                  ])
                }
              >
                Add property
              </button>
              <button
                type="button"
                onClick={() => void handleUpdateNode()}
                disabled={layout.locked || isUpdatingNode || isDeletingNode}
              >
                {isUpdatingNode ? "Saving..." : "Save Node"}
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteNode()}
                disabled={layout.locked || isUpdatingNode || isDeletingNode}
              >
                {isDeletingNode ? "Deleting..." : "Delete Node"}
              </button>
            </div>
          </div>
        )}
        {selectedEdgeForEdit && (
          <div>
            <strong>Edit Edge</strong>

            <select
              value={editEdgeSourceId}
              onChange={(event) => setEditEdgeSourceId(event.target.value)}
            >
              {graphData.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>

            <select
              value={editEdgeTargetId}
              onChange={(event) => setEditEdgeTargetId(event.target.value)}
            >
              {graphData.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>

            <select
              value={editEdgeTypeId}
              onChange={(event) => setEditEdgeTypeId(event.target.value)}
            >
              {availableEdgeTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={editEdgeDescription}
              onChange={(event) => setEditEdgeDescription(event.target.value)}
              placeholder="Description"
            />

            <div>
              <strong>Properties</strong>

              {editEdgeProperties.map((row, index) => (
                <div key={index}>
                  <input
                    type="text"
                    value={row.key}
                    placeholder="Key"
                    onChange={(event) => {
                      const value = event.target.value;

                      setEditEdgeProperties((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, key: value } : item,
                        ),
                      );
                    }}
                  />

                  <input
                    type="text"
                    value={row.value}
                    placeholder="Value"
                    onChange={(event) => {
                      const value = event.target.value;

                      setEditEdgeProperties((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, value } : item,
                        ),
                      );
                    }}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setEditEdgeProperties((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setEditEdgeProperties((current) => [
                    ...current,
                    { key: "", value: "" },
                  ])
                }
              >
                Add property
              </button>

              <button
                type="button"
                onClick={() => void handleUpdateEdge()}
                disabled={layout.locked || isUpdatingEdge || isDeletingEdge}
              >
                {isUpdatingEdge ? "Saving..." : "Save Edge"}
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteEdge()}
                disabled={layout.locked || isUpdatingEdge || isDeletingEdge}
              >
                {isDeletingEdge ? "Deleting..." : "Delete Edge"}
              </button>
            </div>
          </div>
        )}
      </div>

      </div>
    </aside>

    <div className="react-flow-workspace">


      <div className="react-flow-metrics">
        <span>Adapter: {metrics.adapterMs.toFixed(2)} ms</span>

        <span>Initialization: {metrics.initializationMs.toFixed(2)} ms</span>

        <span>
          First render:{" "}
          {metrics.firstRenderMs === null
            ? "—"
            : `${metrics.firstRenderMs.toFixed(2)} ms`}
        </span>

        <span>
          Layout:{" "}
          {metrics.layoutMs === null
            ? "—"
            : `${metrics.layoutMs.toFixed(2)} ms`}
        </span>

        <span>Selected: {selectedElement}</span>
      </div>

      {!layout.startupReady ? (
        <div
          className="react-flow-container"
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
        {layout.phase === "recovery" && layout.recoveryOffer ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <h3>Unsaved layout recovery found</h3>

            <p>
              My Way found locally saved node positions from a
              previous session.
            </p>

            <p>
              Restore them, or discard the recovery and continue
              with the server layout.
            </p>

            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                disabled={layout.recoveryBusy}
                onClick={layout.restoreRecovery}
              >
                Restore
              </button>

              <button
                type="button"
                disabled={layout.recoveryBusy}
                onClick={() => void layout.discardRecovery()}
              >
                {layout.recoveryBusy ? "Discarding…" : "Discard"}
              </button>
            </div>

            {layout.error && (
              <p className="error" role="alert">
                {layout.error}
              </p>
            )}
          </div>
        ) : layout.phase === "load-error" ? (
          "Graph layout could not be loaded. Use Retry loading layout."
        ) : (
          "Loading graph and layout…"
        )}
        </div>
      ) : (

      <div
        className="react-flow-container"
        style={{ position: "relative" }}
        onPointerDownCapture={handleRectanglePointerDown}
        onPointerMoveCapture={handleRectanglePointerMove}
        onPointerUpCapture={handleRectanglePointerUp}
        onPointerCancelCapture={handleRectanglePointerCancel}
        onLostPointerCapture={handleRectanglePointerCancel}
      >
        <Profiler
          id="MyWayReactFlow"
          onRender={(
            _id,
            phase,
            actualDuration,
            baseDuration,
            _startTime,
            commitTime,
          ) => {
            diagnosticsRef.current?.record({
              kind: "react-commit",
              atMs: commitTime,
              durationMs: actualDuration,
              baseDurationMs: baseDuration,
              commitTimeMs: commitTime,
              nodeCount: nodes.length,
              phase,
            });
          }}
        >
        <ReactFlow<ReactFlowNode, ReactFlowEdge>
          nodes={layout.locked ? previewNodes.map((node) => ({ ...node, draggable: false })) : previewNodes}
          nodesDraggable={!layout.locked}
          edges={previewEdges}
          nodeTypes={reactFlowNodeTypes}
          edgeTypes={reactFlowEdgeTypes}
          onNodesChange={handleNodesChange}
          autoPanOnNodeDrag
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={resetHighlighting}
          onInit={(instance) => {
            instanceRef.current = instance;
          }}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.05}
          maxZoom={4}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
          selectionKeyCode={null}
          selectionOnDrag={false}
          onlyRenderVisibleElements
          elevateEdgesOnSelect
        >
          <Background />
          <Controls />
        </ReactFlow>
      </Profiler>
        {selectionRectangle && (
          <div
            style={{
              position: "fixed",
              left: Math.min(
                selectionRectangle.startX,
                selectionRectangle.endX,
              ),
              top: Math.min(
                selectionRectangle.startY,
                selectionRectangle.endY,
              ),
              width: Math.abs(
                selectionRectangle.endX - selectionRectangle.startX,
              ),
              height: Math.abs(
                selectionRectangle.endY - selectionRectangle.startY,
              ),
              border: "1px solid #22c55e",
              background: "rgba(34, 197, 94, 0.12)",
              pointerEvents: "none",
              zIndex: 1000,
            }}
          />
        )}
      </div>
      )}

      </div>


    </section>
  );
}
