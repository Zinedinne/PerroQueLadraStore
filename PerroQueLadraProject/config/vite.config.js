module.exports = ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  // Add or extend the vite configuration block below:
  vite: (config) => {
    return {
      ...config,
      server: {
        ...config.server,
        allowedHosts: [
          'perroqueladra.com.mx',
          'www.perroqueladra.com.mx'
        ]
      }
    };
  }
});

