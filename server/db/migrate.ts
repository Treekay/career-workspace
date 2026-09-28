import { readConfig } from '../../config/runtime.js';
import { openDatabase } from './client.js';
const { sqlite } = openDatabase(readConfig().databasePath);
sqlite.close();
console.log('Database migrations applied.');
