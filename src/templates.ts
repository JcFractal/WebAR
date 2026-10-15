import type { ExperienceConfig, TemplateId } from './config';

export type MountTemplate = (container: HTMLElement, config: ExperienceConfig) => () => void;

export const templateRegistry: Record<TemplateId, () => Promise<MountTemplate>> = {
  swarm: () => import('./placeholder').then((m) => m.mountPlaceholder),
};
