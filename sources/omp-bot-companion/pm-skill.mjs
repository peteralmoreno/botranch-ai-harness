import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const skillPath=fileURLToPath(new URL('./skills/bot-ranch-pm/SKILL.md',import.meta.url));
const cliPath=fileURLToPath(new URL('./ranch-cli.mjs',import.meta.url));
export function readPmSkill(){return {name:'bot-ranch-pm',description:'Manage botRanch tickets, assignments, dependencies and work through the local companion.',path:skillPath,text:fs.readFileSync(skillPath,'utf8')};}
export function pmAgentInstructions(){return [
 'botRanch management skill: '+skillPath,
 'Local CLI module (run with Node; quote the literal path): '+cliPath,
 'For board management, read the skill and run the CLI catalog and board commands. The skill command prints the bundled skill even when the companion is offline.',
 'Pipeyard tracks external workflows independently of bot ownership. Use pipeyard catalog and pipeyard snapshot to discover runs and scoped limits; save-template creates templates for configured platforms, register attaches existing external IDs with metadata, and update-run edits verified connections; pipeyard action --file JSON operates them under AI Sync permissions. Use check-due or refresh to fetch progress; inspect progressResponse and use review-progress with its response ID to save a local interpretation. Clear hides a run without cancelling external work. Local notes do not message the platform. Never retry an uncertain submission with a new request ID.',
 'The companion is the authoritative writer. Use its CLI/API to create, assign and manage tasks; do not edit exported task JSON or credentials. Follow the user\'s delegated scope and the current AI Sync access mode.',
].join('\n');}
