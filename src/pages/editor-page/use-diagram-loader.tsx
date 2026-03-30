import { useChartDB } from '@/hooks/use-chartdb';
import { useConfig } from '@/hooks/use-config';
import { useDialog } from '@/hooks/use-dialog';
import { useFullScreenLoader } from '@/hooks/use-full-screen-spinner';
import { useRedoUndoStack } from '@/hooks/use-redo-undo-stack';
import { useStorage } from '@/hooks/use-storage';
import type { Diagram } from '@/lib/domain/diagram';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const DEFAULT_DIAGRAM_PATH = '/ChartDB-data-store.json';
const DEFAULT_DIAGRAM_ID = '0';

// Resets to false on every browser page refresh (module re-evaluation).
// Stays true within the same page load to prevent double-seeding across
// React re-renders or effect re-runs.
let isSeedFresh = false;

export const useDiagramLoader = () => {
    const [initialDiagram, setInitialDiagram] = useState<Diagram | undefined>();
    const { diagramId } = useParams<{ diagramId: string }>();
    const { config } = useConfig();
    const { loadDiagram, currentDiagram } = useChartDB();
    const { resetRedoStack, resetUndoStack } = useRedoUndoStack();
    const { showLoader, hideLoader } = useFullScreenLoader();
    const { openCreateDiagramDialog, openOpenDiagramDialog } = useDialog();
    const navigate = useNavigate();
    const { listDiagrams, addDiagram, updateConfig, deleteDiagram } =
        useStorage();

    const currentDiagramLoadingRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!config) {
            return;
        }

        if (currentDiagram?.id === diagramId) {
            return;
        }

        const loadDefaultDiagram = async () => {
            // On every page refresh, wipe and reload from the source JSON so
            // the diagram always reflects the latest data from the file.
            if (!isSeedFresh) {
                isSeedFresh = true;
                showLoader();
                try {
                    await deleteDiagram(DEFAULT_DIAGRAM_ID);
                    const response = await fetch(DEFAULT_DIAGRAM_PATH);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const raw = await response.json();
                    const diagram: Diagram = {
                        ...raw,
                        createdAt: new Date(raw.createdAt),
                        updatedAt: new Date(raw.updatedAt),
                    };
                    await addDiagram({ diagram });
                    await updateConfig({ defaultDiagramId: diagram.id });
                    resetRedoStack();
                    resetUndoStack();
                    const freshDiagram = await loadDiagram(diagram.id);
                    setInitialDiagram(freshDiagram ?? undefined);
                    hideLoader();
                    navigate(`/diagrams/${diagram.id}`);
                    return;
                } catch {
                    // Re-seed failed (e.g. JSON not found) — fall through and
                    // load whatever is already in IndexedDB
                    hideLoader();
                }
            }

            if (diagramId) {
                setInitialDiagram(undefined);
                showLoader();
                resetRedoStack();
                resetUndoStack();
                const diagram = await loadDiagram(diagramId);
                if (!diagram) {
                    openOpenDiagramDialog({ canClose: false });
                    hideLoader();
                    return;
                }

                setInitialDiagram(diagram);
                hideLoader();

                return;
            } else if (!diagramId && config.defaultDiagramId) {
                const diagram = await loadDiagram(config.defaultDiagramId);
                if (diagram) {
                    navigate(`/diagrams/${config.defaultDiagramId}`);

                    return;
                }
            }
            const diagrams = await listDiagrams();

            if (diagrams.length > 0) {
                openOpenDiagramDialog({ canClose: false });
            } else {
                // No diagrams — try to seed the default diagram before
                // falling back to the "Create Diagram" dialog
                showLoader();
                try {
                    const response = await fetch(DEFAULT_DIAGRAM_PATH);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const raw = await response.json();
                    const diagram: Diagram = {
                        ...raw,
                        createdAt: new Date(raw.createdAt),
                        updatedAt: new Date(raw.updatedAt),
                    };
                    await addDiagram({ diagram });
                    await updateConfig({ defaultDiagramId: diagram.id });
                    hideLoader();
                    navigate(`/diagrams/${diagram.id}`);
                    return;
                } catch {
                    // Seed failed — fall through to the normal create dialog
                }
                hideLoader();
                openCreateDiagramDialog();
            }
        };

        if (
            currentDiagramLoadingRef.current === (diagramId ?? '') &&
            currentDiagramLoadingRef.current !== undefined
        ) {
            return;
        }
        currentDiagramLoadingRef.current = diagramId ?? '';

        loadDefaultDiagram();
    }, [
        diagramId,
        openCreateDiagramDialog,
        config,
        navigate,
        listDiagrams,
        addDiagram,
        updateConfig,
        deleteDiagram,
        loadDiagram,
        resetRedoStack,
        resetUndoStack,
        hideLoader,
        showLoader,
        currentDiagram?.id,
        openOpenDiagramDialog,
    ]);

    return { initialDiagram };
};
