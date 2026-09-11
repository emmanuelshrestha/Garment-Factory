import { Database } from 'node:sqlite';
const db = new Database('data.db');
const rows = db.prepare('SELECT * FROM employee_earnings').all();
console.table(rows);
