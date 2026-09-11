import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data.db');
const rows = db.prepare('SELECT * FROM employee_earnings').all();
console.table(rows);
