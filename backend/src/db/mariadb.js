import mysql from 'mysql2/promise'

// Pool de conexiones a la MariaDB local. Las variables llegan del docker-compose
// (DB_HOST=mariadb, etc.). En ejecución fuera de Docker caen a localhost:3308.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3308),
  user: process.env.DB_USER || 'construgest',
  password: process.env.DB_PASSWORD || 'construgest',
  database: process.env.DB_NAME || 'construgest',
  waitForConnections: true,
  connectionLimit: 10,
  // Guardamos/leemos los DATETIME como UTC (los timestamptz de Postgres eran UTC).
  timezone: 'Z',
  // MariaDB devuelve TINYINT(1) como número (0/1). Supabase devolvía booleanos,
  // y el código del backend hace comparaciones como `x === false`. Convertimos
  // TINYINT(1) -> boolean para que el comportamiento sea idéntico.
  typeCast: (field, next) => {
    if (field.type === 'TINY' && field.length === 1) {
      const v = field.string()
      return v === null ? null : v === '1'
    }
    return next()
  },
})

export default pool
