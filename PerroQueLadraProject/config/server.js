module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port:  1337,
  url: env('URL'), // URL base para la API
  proxy: true,
  app: {
    keys: env.array('APP_KEYS'),
  },
  admin: {
    url: '/admin', // Esto hace que el admin responda en :1337/admin
    serveAdminPanel: true,
  },
});
