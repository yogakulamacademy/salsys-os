'use server';
import * as actions from './actions';
import { asResult } from '@/lib/action-result';
export async function createExperimentFromCandidate(fd: FormData) { return asResult(() => actions.createExperimentFromCandidate(fd), 'Experiment created.', ['/seo']); }
export async function approveExperiment(fd: FormData) { return asResult(() => actions.approveExperiment(fd), 'Experiment approved.', ['/seo']); }
export async function startExperimentWithBaseline(fd: FormData) { return asResult(() => actions.startExperimentWithBaseline(fd), 'Experiment baseline saved.', ['/seo']); }
export async function proposeOptimizationFromExperiment(fd: FormData) { return asResult(() => actions.proposeOptimizationFromExperiment(fd), 'Optimization proposal created.', ['/seo']); }
export async function reviewOptimizationAction(fd: FormData) { return asResult(() => actions.reviewOptimizationAction(fd), 'Optimization review saved.', ['/seo']); }
export async function recordManualOptimizationState(fd: FormData) { return asResult(() => actions.recordManualOptimizationState(fd), 'Optimization state saved.', ['/seo']); }
