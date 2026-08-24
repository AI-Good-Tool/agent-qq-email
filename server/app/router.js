'use strict';

module.exports = app => {
  const { router, controller } = app;
  router.get('/health', controller.mail.health);
  router.get('/api/dashboard', controller.mail.dashboard);
  router.post('/api/auth/start', controller.mail.startAuth);
  router.get('/api/auth/status', controller.mail.authStatus);
};
