import { readFile } from 'node:fs/promises';
import { EUROPE_ID, EUROPE_VERSION } from '../../src/game/europeScenario.ts';
import { benchmarkStrategicLand } from './bench_mil00.ts';

const read = (name: string) => readFile(new URL(`../../scenarios/${EUROPE_ID}/${EUROPE_VERSION}/${name}`, import.meta.url));
for (const heavy of [false, true]) console.log(JSON.stringify(await benchmarkStrategicLand(read, heavy)));
