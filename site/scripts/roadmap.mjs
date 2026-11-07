// Saves the roadmap from GitHub's milestones to src/roadmap.json, the copy the site uses when
// GitHub can't be reached during a build: npm run roadmap --prefix site (GITHUB_TOKEN optional).
import { writeFileSync } from 'node:fs';
import { fetchRoadmap } from '../src/roadmapData.mjs';

const roadmap = await fetchRoadmap(process.env.GITHUB_TOKEN);
const file = new URL('../src/roadmap.json', import.meta.url);
writeFileSync(file, JSON.stringify(roadmap, null, 2) + '\n');
console.log(`Wrote ${file.pathname}: ${roadmap.past.length} done, ${roadmap.ahead.length} ahead`);
