import type { ExperienceConfig } from './config';

export type Dispose = () => void;
export type MountExperience = (container: HTMLElement) => Dispose;

/** Lazily loads the experience's template module and binds it to the validated config. */
export async function loadTemplate(config: ExperienceConfig): Promise<MountExperience> {
  switch (config.template) {
    case 'swarm': {
      const { mountSwarm } = await import('./swarm/mount');
      return (container) => mountSwarm(container, config);
    }
    case 'video': {
      const { mountVideo } = await import('./video/mount');
      return (container) => mountVideo(container, config);
    }
  }
}
