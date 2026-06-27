/** @type {import('kanel').Config} */
module.exports = {
  connection: {
    connectionString: process.env.DATABASE_URL || 'postgresql://adityasingh@localhost:5432/school_sis',
  },
  preDeleteOutputFolder: true,
  outputPath: './src/lib/db/types',
  customTypeMap: {
    'pg_catalog.tsvector': 'string',
    'pg_catalog.bpchar': 'string',
  },
};
