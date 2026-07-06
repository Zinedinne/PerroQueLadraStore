module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('URL'), // Toma la URL de https://perroqueladra.com.mx/api
  proxy: true,     // Vital para que funcione detrás de Nginx con HTTPS
  app: {
    keys: env.array('APP_KEYS'),
  },
  admin: {
    auth: {
      secret: env('ADMIN_JWT_SECRET'),
    },
    url: '/admin', // El panel de control responderá en tu-dominio.com.mx/api/admin
    serveAdminPanel: true,
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
});
