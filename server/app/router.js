'use strict';

module.exports = app => {
  const { router, controller } = app;
  router.get('/health', controller.mail.health);
  router.post('/api/login', controller.mail.login);
  router.get('/api/session', controller.mail.session);
  router.get('/api/dashboard', controller.mail.dashboard);
  router.get('/api/messages/:id', controller.mail.messageDetail);
  router.post('/api/messages/:id/star', controller.mail.setStar);
  router.put('/api/aliases/:aliasId/labels', controller.mail.setAliasLabels);
  router.post('/api/mail/action', controller.mail.mailAction);
  router.post('/api/auth/start', controller.mail.startAuth);
  router.get('/api/auth/status', controller.mail.authStatus);
};
