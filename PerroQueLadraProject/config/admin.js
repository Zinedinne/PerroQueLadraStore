module.exports = ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  // Forzamos a Vite a aceptar cualquier Host en desarrollo
  vite: (config) => {
    if (!config.server) {
      config.server = {};
    }
    config.server.allowedHosts = true;
    return config;
  },
});
