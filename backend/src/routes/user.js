const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../prisma');
const { requireAuth, requireVerifiedEmail } = require('../middleware/auth');
const passwordPolicy = require('../utils/passwordPolicy');
const { revokeAllForUser } = require('../services/refreshTokens');
const { getTrialStatusForUser, startTrial } = require('../services/trial');
const { effectivePlan } = require('../middleware/requirePlan');

const router = express.Router();

// 业务相关的用户端点(练习配额 / 进度 / 预测 / 错题本)随 DELF 示例移除。
// 换业务时在此处按需新增,业务数据查询走各自的 Prisma 模型。

// GET /api/user/trial/status — trial eligibility + remaining days for logged-in user.
router.get('/trial/status', requireAuth, async (req, res, next) => {
  try {
    const trial = await getTrialStatusForUser(req.userId);
    res.json({ trial });
  } catch (e) { next(e); }
});

// POST /api/user/trial/start — manual trial activation (pricing page fallback).
router.post('/trial/start', requireAuth, requireVerifiedEmail, async (req, res, next) => {
  try {
    const result = await startTrial(req.userId, { source: 'manual' });
    res.status(201).json(result);
  } catch (e) {
    if (e.code) {
      return res.status(e.status || 400).json({ error: e.message, code: e.code });
    }
    next(e);
  }
});

// GET /api/user/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [user, activeContract] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          subscriptionEnd: true,
          trialUsedAt: true,
          createdAt: true,
        },
      }),
      prisma.payContract.findFirst({
        where: { userId: req.userId, status: 'ACTIVE' },
        select: { id: true, provider: true, nextChargeAt: true },
      }),
    ]);
    // requireAuth elevates req.userPlan for free-country visitors; honour it
    // so the UI shows their effective (free) access.
    const effective = req.userPlan || effectivePlan(user);
    const trial = await getTrialStatusForUser(req.userId);
    res.json({
      user: {
        ...user,
        effectivePlan: effective,
        freeCountry: Boolean(req.freeCountry),
        autoRenewActive: !!activeContract,
        autoRenew: activeContract
          ? { provider: activeContract.provider, nextChargeAt: activeContract.nextChargeAt }
          : null,
        trial,
      },
    });
  } catch (e) { next(e); }
});

// POST /api/user/change-password  { oldPassword, newPassword }
const changePwdSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10)
    .max(100)
    .refine((p) => passwordPolicy.validate(p).ok, (p) => ({
      message: passwordPolicy.validate(p).reasons.join('; ') || 'Weak password',
    })),
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = changePwdSchema.parse(req.body);

    const me = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
        role: true,
      },
    });
    if (!me || me.status !== 'ACTIVE' || me.deletedAt) {
      return res.status(403).json({ error: '账户不可用' });
    }
    if (me.role === 'ADMIN' || me.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: '管理员账户请在管理后台修改密码' });
    }

    const ok = await bcrypt.compare(oldPassword, me.passwordHash);
    if (!ok) return res.status(401).json({ error: '旧密码错误' });

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null },
    });

    try { await revokeAllForUser(me.id, { reason: 'PASSWORD_CHANGE' }); } catch { /* ignore */ }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
