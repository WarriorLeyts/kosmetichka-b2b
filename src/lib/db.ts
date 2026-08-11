import pg from "pg";

export const db = new pg.Pool({
host: "localhost",
port: 5432,
database: "kosmetichka",
user: "postgres",
password: "12345678",
});