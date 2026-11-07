/**
 * The roadmap for the site's /roadmap page: read from GitHub's milestones at build time, so closing
 * issues moves the map forward, or from roadmap.json (npm run roadmap) when GitHub can't be reached.
 */
import { fetchRoadmap } from './roadmapData.mjs';
import saved from './roadmap.json';

export interface Stop {
  /** 0.9, 1.0…; null for Later. */
  version: string | null;
  name: string;
  title: string;
  description: string;
  open: number;
  closed: number;
  url: string;
  /** Its open issues, epics and bigger ones first. */
  issues: { number: number; title: string; url: string }[];
  firstIssues: number;
}

export interface Roadmap {
  past: { version: string | null; name: string; title: string }[];
  ahead: Stop[];
}

async function load(): Promise<Roadmap> {
  try {
    return (await fetchRoadmap(process.env.GITHUB_TOKEN)) as Roadmap;
  } catch (error) {
    console.warn(`Roadmap: GitHub unreachable (${(error as Error).message}), using roadmap.json`);
    return saved as Roadmap;
  }
}

export const roadmap = await load();
