import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log("DATABASE_URL:", process.env.DATABASE_URL);
const users = await client.query('SELECT email, role FROM "User" ORDER BY email');
console.log("Users:", users.rows);
const alunos = await client.query('SELECT count(*) FROM "Aluno"');
console.log("Alunos count:", alunos.rows[0].count);
const linked = await client.query(`
  SELECT u.email as user_email, a.email as aluno_email, a.nome
  FROM "User" u JOIN "Aluno" a ON a.id = u."alunoId"
  WHERE u.email = 'aluno@ispc.ao'
`);
console.log("Linked aluno:", linked.rows);
await client.end();
