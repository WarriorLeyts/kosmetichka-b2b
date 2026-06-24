import { Pool } from "pg";

const db = new Pool({
host: "localhost",
port: 5432,
database: "postgres",
user: "postgres",
password: "12345678",
});

async function main() {
const result = await db.query("SELECT NOW()");
console.log(result.rows[0]);
await db.end();
}

main();