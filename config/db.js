const sql=require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        enableArithAbort: true
    }
    };
const pool= new sql.ConnectionPool(config);
const poolConnect = pool.connect();
module.exports = {
    sql,
    pool,
    poolConnect
};