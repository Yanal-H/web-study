import { lazy } from 'react';
import type { LazyExoticComponent, ComponentType } from 'react';

type Loader = () => Promise<{ default: ComponentType }>;

export interface RouteDef {
  path: string; // route path (no leading slash except index '')
  label: string; // sidebar label
  load: Loader; // dynamic import factory (reused for lazy() and offline prefetch)
  Component: LazyExoticComponent<ComponentType>;
  hidden?: boolean; // not shown in nav or the command palette (param/detail routes)
}

function route(path: string, label: string, load: Loader, hidden = false): RouteDef {
  return { path, label, load, Component: lazy(load), hidden };
}

// Every view is code-split via React.lazy so each becomes its own chunk. The same
// loader is reused to prefetch all chunks after first paint, so the service worker
// can cache them and the whole app works offline (see prefetchRoutes).
export const ROUTES: RouteDef[] = [
  route('', 'Dashboard', () => import('../features/dashboard/DashboardView')),
  route('study', 'Study', () => import('../features/study/StudyView')),
  route('study/:id', 'Reader', () => import('../features/study/ReaderView'), true),
  route('subjects', 'Subjects', () => import('../features/subjects/SubjectsView')),
  route('flashcards', 'Flashcards', () => import('../features/flashcards/FlashcardsView')),
  route('qbank', 'Question Bank', () => import('../features/qbank/QbankView')),
  route('planner', 'Planner', () => import('../features/planner/PlannerView')),
  route('notes', 'Notes', () => import('../features/notes/NotesView')),
  route('calculators', 'Calculators', () => import('../features/calculators/CalculatorsView')),
  route('mnemonics', 'Mnemonics', () => import('../features/mnemonics/MnemonicsView')),
  route('resources', 'Resources', () => import('../features/resources/ResourcesView')),
  route('settings', 'Settings', () => import('../features/settings/SettingsView')),
];

/** Warm every route chunk so the offline cache holds the whole app after one visit. */
export function prefetchRoutes() {
  for (const r of ROUTES) {
    r.load().catch(() => {});
  }
}
