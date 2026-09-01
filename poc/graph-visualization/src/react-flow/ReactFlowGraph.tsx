import { useCallback, useEffect, useRef, useState } from "react";

import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";

import { Graph, layout as dagreLayout } from "@dagrejs/dagre";

import { findDirectedPath } from "../shared/graphAlgorithms";

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

import { MyWayNode } from "./MyWayNode";
import { MyWayEdge } from "./MyWayEdge";

interface ReactFlowGraphProps {
  graph: GraphResponse;
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

export function ReactFlowGraph({
  graph: graphData,
  onGraphChanged,
}: ReactFlowGraphProps) {
  const instanceRef = useRef<ReactFlowInstance<
    ReactFlowNode,
    ReactFlowEdge
  > | null>(null);

  const currentLayoutRef = useRef<LayoutName>("dagre");

  const [nodes, setNodes, onNodesChange] = useNodesState<ReactFlowNode>([]);
  const [isDeletingNode, setIsDeletingNode] = useState(false);

  const [edges, setEdges, onEdgesChange] = useEdgesState<ReactFlowEdge>([]);

  const [selectedElement, setSelectedElement] = useState("None");
  const [selectedNodeForEdit, setSelectedNodeForEdit] =
    useState<ReactFlowNode | null>(null);
  const [selectedEdgeForEdit, setSelectedEdgeForEdit] =
    useState<ReactFlowEdge | null>(null);

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

  const [nodeSearch, setNodeSearch] = useState("");
  const [selectedNodeType, setSelectedNodeType] = useState("all");

  const [pathStart, setPathStart] = useState("");
  const [pathEnd, setPathEnd] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [availableNodeTypes, setAvailableNodeTypes] = useState<NodeType[]>([]);
  const [availableEdgeTypes, setAvailableEdgeTypes] = useState<EdgeType[]>([]);
  const [newNodeTypeId, setNewNodeTypeId] = useState("");
  const [newNodeProperties, setNewNodeProperties] = useState<PropertyRow[]>([]);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeDescription, setNewNodeDescription] = useState("");
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [isUpdatingNode, setIsUpdatingNode] = useState(false);

  const [newEdgeSourceId, setNewEdgeSourceId] = useState("");
  const [newEdgeTargetId, setNewEdgeTargetId] = useState("");
  const [newEdgeTypeId, setNewEdgeTypeId] = useState("");
  const [newEdgeDescription, setNewEdgeDescription] = useState("");
  const [newEdgeProperties, setNewEdgeProperties] = useState<PropertyRow[]>([]);
  const [isCreatingEdge, setIsCreatingEdge] = useState(false);
  const [isUpdatingEdge, setIsUpdatingEdge] = useState(false);
  const [isDeletingEdge, setIsDeletingEdge] = useState(false);
  const nodeTypes = [
    ...new Set(graphData.nodes.map((node) => node.type)),
  ].sort();

  const resetHighlighting = useCallback(() => {
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
    (_event, selectedNode) => {
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
    [graphData.edges, graphData.nodes, availableNodeTypes, setEdges, setNodes],
  );

  const handleEdgeClick: EdgeMouseHandler<ReactFlowEdge> = useCallback(
    (_event, selectedEdge) => {
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

  function handleFindNode() {
    const searchValue = nodeSearch.trim();

    if (!searchValue) {
      setActionMessage("Enter a Node ID or label");
      return;
    }

    const normalizedSearch = searchValue.toLowerCase();

    const matchingNode = graphData.nodes.find(
      (node) =>
        String(node.id) === searchValue ||
        node.label.toLowerCase().includes(normalizedSearch),
    );

    if (!matchingNode) {
      setActionMessage(`Node not found: ${searchValue}`);
      return;
    }

    const flowNodeId = `n-${matchingNode.id}`;

    setSelectedNodeType("all");

    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        hidden: false,
        selected: node.id === flowNodeId,
        style: {
          ...node.style,
          opacity: 1,
          border:
            node.id === flowNodeId ? "3px solid #ef4444" : "2px solid #ffffff",
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

    setSelectedElement(`Node: ${matchingNode.label}`);

    setActionMessage(`Found Node ${matchingNode.id}: ${matchingNode.label}`);

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
  }

  function handleNodeTypeFilter(nodeType: string) {
    setSelectedNodeType(nodeType);

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
        const visible =
          visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target);

        return {
          ...edge,
          hidden: !visible,
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

    setActionMessage(
      nodeType === "all"
        ? "Showing all Node types"
        : `Showing only type: ${nodeType}`,
    );

    fitNodeIds(visibleNodeIds);
  }

  async function handleUpdateEdge() {
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

  function handleHighlightPath() {
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
    [edges, nodes, setNodes],
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

    const positionedNodes = positionNodes(
      elements.nodes,
      elements.edges,
      currentLayoutRef.current,
    );

    setNodes(positionedNodes);
    setEdges(elements.edges);
    setSelectedElement("None");
    setSelectedNodeForEdit(null);
    setSelectedEdgeForEdit(null);

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
        <div className="react-flow-header">
  <strong>React Flow 12.11.5</strong>
</div>
      <div className="react-flow-toolbar">
        <div>
          <strong>Create Node</strong>
          <label>
            Type{" "}
            <select
              value={newNodeTypeId}
              onChange={(event) => setNewNodeTypeId(event.target.value)}
              disabled={isCreatingNode || availableNodeTypes.length === 0}
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
            disabled={isCreatingNode || availableNodeTypes.length === 0}
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
              isCreatingEdge ||
              graphData.nodes.length === 0 ||
              availableEdgeTypes.length === 0
            }
          >
            {isCreatingEdge ? "Creating..." : "Add Edge"}
          </button>
        </div>

        <div>
          <strong>Layout</strong>
          <button type="button" onClick={() => runLayout("grid")}>
            Grid
          </button>

          <button type="button" onClick={() => runLayout("circle")}>
            Circle
          </button>

          <button type="button" onClick={() => runLayout("dagre")}>
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
        <div className="react-flow-control-group">
          <label htmlFor="react-flow-node-search">Find Node</label>

          <input
            id="react-flow-node-search"
            type="search"
            value={nodeSearch}
            placeholder="ID or label"
            onChange={(event) => {
              setNodeSearch(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleFindNode();
              }
            }}
          />

          <button type="button" onClick={handleFindNode}>
            Find
          </button>
        </div>

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

        {actionMessage && (
          <span className="react-flow-action-message">{actionMessage}</span>
        )}
      </div>

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

      <div className="react-flow-container">
        <ReactFlow<ReactFlowNode, ReactFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={reactFlowNodeTypes}
          edgeTypes={reactFlowEdgeTypes}
          onNodesChange={onNodesChange}
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
          onlyRenderVisibleElements
          elevateEdgesOnSelect
        >
          <Background />
          <Controls />
        </ReactFlow>
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
                disabled={isUpdatingNode || isDeletingNode}
              >
                {isUpdatingNode ? "Saving..." : "Save Node"}
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteNode()}
                disabled={isUpdatingNode || isDeletingNode}
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
                disabled={isUpdatingEdge || isDeletingEdge}
              >
                {isUpdatingEdge ? "Saving..." : "Save Edge"}
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteEdge()}
                disabled={isUpdatingEdge || isDeletingEdge}
              >
                {isDeletingEdge ? "Deleting..." : "Delete Edge"}
              </button>
            </div>
          </div>
        )}
      </div>


    </section>
  );
}
