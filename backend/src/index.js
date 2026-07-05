// Boot order matters: env validation MUST run before anything else imports
// from process.env (prisma, jwt, etc).
const env = require('./config/env');
const { logger, httpLogger } = require('./utils/logger');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const prisma = require('./prisma');
const { ipAllowlist } = require('./middleware/admin');
const { requireAuth } = require('./middleware/auth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// ─────────────────────────────────────────────────────────────────────────
// CORE 平台模块（M1 鉴权 / M3 后台 / M6 反馈）—— 复用骨架，保留
// ─────────────────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const passwordResetRoutes = require('./routes/passwordReset');
const userRoutes = require('./routes/user');
const feedbackRoutes = require('./routes/feedback');
const adminAuthRoutes = require('./routes/adminAuth');
const adminUserRoutes = require('./routes/adminUsers');
const adminStatsRoutes = require('./routes/adminStats');
const adminFeedbackRoutes = require('./routes/adminFeedback');

// ─────────────────────────────────────────────────────────────────────────
// 支付模块（M2）—— 不要支付时删除本段 + 下面的 PAYMENT 挂载段 + reconcile worker
// ─────────────────────────────────────────────────────────────────────────
const wechatPayRoutes = require('./routes/payments/wechat');
const alipayRoutes = require('./routes/payments/alipay');
const stripePayRoutes = require('./routes/payments/stripe');
const payOrderRoutes = require('./routes/payments/orders');
const payProductRoutes = require('./routes/payments/products');
const payContractRoutes = require('./routes/payments/contracts');
const adminPaymentsRoutes = require('./routes/adminPayments');
const reconcile = require('./services/payments/reconcile');

// ─────────────────────────────────────────────────────────────────────────
// 业务模块:市场调研(research)
// ─────────────────────────────────────────────────────────────────────────
const researchRoutes = require('./routes/research');
const chatRoutes = require('./routes/chat');

const app = express();

app.set('trust proxy', 1);

// --- Security headers (M7) ---
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", env.FRONTEND_URL],
        mediaSrc: ["'self'", 'https:', 'blob:'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: env.IS_PROD ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: env.IS_PROD ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  })
);

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

// gzip JSON/text responses.
app.use(compression());

// Capture raw body on JSON routes — required by Stripe webhook (raw bytes) and
// the WeChat V3 notify handler (exact signed string layout).
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      req.rawBodyBuffer = buf;
      req.rawBody = buf.toString('utf8');
    },
  })
);
// Alipay async-notify is application/x-www-form-urlencoded.
app.use('/api/pay/alipay/notify', express.urlencoded({ extended: false, limit: '1mb' }));
app.use(httpLogger);

// --- Rate limiters (M7) ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please retry later' },
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin login attempts' },
});
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests' },
});
const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
const payUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests, please retry' },
});
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '提交过于频繁，请稍后再试' },
});

// --- Health (M7) ---
app.get('/api/health', async (_req, res) => {
  const health = { status: 'ok', service: 'saas-backend', ts: Date.now(), db: 'unknown' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.db = 'ok';
  } catch (e) {
    health.status = 'degraded';
    health.db = 'error';
  }
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// ═════════════════════════════════════════════════════════════════════════
// CORE 公开 API（M1 鉴权 / M6 反馈）
// ═════════════════════════════════════════════════════════════════════════
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth', passwordResetLimiter, passwordResetRoutes);
app.use('/api/user', userRoutes);
app.use('/api/feedback', feedbackLimiter, feedbackRoutes);

// ═════════════════════════════════════════════════════════════════════════
// PAYMENT API（M2）—— 删支付时整段删除
// ═════════════════════════════════════════════════════════════════════════
// Mounts both GET /products and GET /preferred-currency.
app.use('/api/pay', payProductRoutes);
// China-direct channels off by default; flip ENABLE_DIRECT_* to expose.
if (env.ENABLE_DIRECT_WECHAT) {
  app.use('/api/pay/wechat', payUserLimiter, wechatPayRoutes);
  logger.info('payments.wechat.direct.enabled');
}
if (env.ENABLE_DIRECT_ALIPAY) {
  app.use('/api/pay/alipay', payUserLimiter, alipayRoutes);
  logger.info('payments.alipay.direct.enabled');
}
app.use('/api/pay/stripe', payUserLimiter, stripePayRoutes);
app.use('/api/pay/orders', payUserLimiter, payOrderRoutes);
app.use('/api/pay/contracts', payUserLimiter, payContractRoutes);

// ═════════════════════════════════════════════════════════════════════════
// 业务 API:市场调研(research)—— 全部需登录(requireAuth)
// ═════════════════════════════════════════════════════════════════════════
app.use('/api/research', requireAuth, researchRoutes);
app.use('/api/chat', requireAuth, chatRoutes);

// ═════════════════════════════════════════════════════════════════════════
// ADMIN API（M3 后台）—— ipAllowlist 之后是各后台子路由
// ═════════════════════════════════════════════════════════════════════════
app.use('/api/admin', ipAllowlist);
app.use('/api/admin/auth', adminLoginLimiter, adminAuthRoutes);
app.use('/api/admin/users', adminApiLimiter, adminUserRoutes);
app.use('/api/admin/stats', adminApiLimiter, adminStatsRoutes);
app.use('/api/admin/feedback', adminApiLimiter, adminFeedbackRoutes);
app.use('/api/admin', adminApiLimiter, adminPaymentsRoutes);            // 支付后台（M2）

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'backend started');
  if (env.RUN_BG_WORKERS) {
    // 支付对账 worker（M2）
    reconcile.startWorker();
    // 业务 worker 在此处启动(当前纯平台,无业务)。
  } else {
    logger.info('RUN_BG_WORKERS=false — background workers not started');
  }
});

// --- Graceful shutdown (M7) ---
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'graceful shutdown initiated');
  server.close(async (err) => {
    if (err) logger.error({ err }, 'error while closing http server');
    // 业务 worker drain 在此处(当前纯平台,无业务)。
    await reconcile.stopWorker().catch((e) => {
      logger.error({ err: e }, 'reconcile.stopWorker.fail');
    });
    await prisma.disconnect();
    logger.info('shutdown complete');
    process.exit(err ? 1 : 0);
  });
  setTimeout(() => {
    logger.error('force exit after shutdown timeout');
    process.exit(1);
  }, 15000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandledRejection');
  shutdown('unhandledRejection');
});
