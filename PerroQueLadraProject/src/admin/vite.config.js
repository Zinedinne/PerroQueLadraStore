export default (config) => {
  config.server = {
    ...config.server,
    allowedHosts: ['themaisonbleue.com'],
  };
  return config;
};
