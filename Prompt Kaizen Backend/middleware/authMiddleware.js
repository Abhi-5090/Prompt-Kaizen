const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { istMidnightToday, istDayDiff } = require('../utils/dailyChallenge');
const { unauthorized, forbidden } = require('../utils/asyncHandler');

const MAX_FREEZES = 3;
const FREEZE_EARN_EVERY = 7; // earn one freeze every 7-day streak milestone

/**
 * Updates the user's daily-login streak and streak-freeze inventory. Called
 * fire-and-forget once per authenticated request, but only writes when the
 * IST calendar day has actually changed — so each user incurs at most one
 * write per IST day.
 *
 * Operates on a freshly-fetched copy of the user document and persists with
 * `User.updateOne` (not `req.user.save()`), so it never races with the
 * controller's own save on the same in-memory document. Uses optimistic
 * concurrency (match on the previous `lastActiveDate`) so two concurrent
 * requests can't both bump the streak.
 *
 * Streak freezes are earned automatically: every time the streak crosses a
 * multiple of 7, one freeze is added (capped at MAX_FREEZES). If the user
 * misses exactly one day and has at least one freeze, the freeze is auto-spent
 * and the streak continues unbroken. Missing more than one day always resets.
 */
async function bumpDailyStreak(userId) {
  const today = istMidnightToday();

  const fresh = await User.findById(userId)
    .select('lastActiveDate dailyStreak bestDailyStreak streakFreezes')
    .lean();
  if (!fresh) return null;

  const last = fresh.lastActiveDate ? new Date(fresh.lastActiveDate) : null;
  const diff = last ? istDayDiff(last, today) : null;
  // Already counted today (or clock skew) — return the unchanged values so
  // callers can refresh their in-memory state without a second DB read.
  if (diff !== null && diff <= 0) {
    return {
      dailyStreak: fresh.dailyStreak || 0,
      bestDailyStreak: fresh.bestDailyStreak || 0,
      streakFreezes: fresh.streakFreezes || 0,
      lastActiveDate: fresh.lastActiveDate,
    };
  }

  let newStreak = fresh.dailyStreak || 0;
  let newFreezes = fresh.streakFreezes || 0;

  if (!last) {
    newStreak = 1;
  } else if (diff === 1) {
    newStreak = newStreak + 1;
  } else if (diff === 2 && newFreezes > 0) {
    // Auto-spend one freeze to save the streak.
    newFreezes -= 1;
    newStreak = newStreak + 1;
  } else {
    newStreak = 1;
  }

  // Earn a freeze every 7th day milestone (7, 14, 21, ...).
  if (newStreak > 0 && newStreak % FREEZE_EARN_EVERY === 0 && newFreezes < MAX_FREEZES) {
    newFreezes += 1;
  }

  const newBest = Math.max(fresh.bestDailyStreak || 0, newStreak);

  // Optimistic concurrency: only update if lastActiveDate is still what we
  // read. Two concurrent calls both reach this point; only the first matches
  // and writes, the second's matchedCount is 0 (silently OK).
  await User.updateOne(
    { _id: userId, lastActiveDate: fresh.lastActiveDate },
    {
      $set: {
        dailyStreak: newStreak,
        bestDailyStreak: newBest,
        streakFreezes: newFreezes,
        lastActiveDate: today,
      },
    }
  );

  return {
    dailyStreak: newStreak,
    bestDailyStreak: newBest,
    streakFreezes: newFreezes,
    lastActiveDate: today,
  };
}

const protect = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return next(unauthorized('Not authorized, no token provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(unauthorized('Not authorized, user not found'));
    }

    // Token revocation. `tokenVersion` increments whenever the password
    // changes (user reset, admin reset), so every token minted before that
    // point stops working immediately instead of remaining valid for the
    // rest of its 7-day life. Tokens issued before this field existed carry
    // no `tv` claim; treat those as version 0 so existing sessions survive
    // the deploy rather than logging everyone out at once.
    const tokenVersion = typeof decoded.tv === 'number' ? decoded.tv : 0;
    if (tokenVersion !== (user.tokenVersion || 0)) {
      return next(unauthorized('Session expired, please sign in again.'));
    }

    // A locked account must not be able to keep using a token it obtained
    // before the lock was applied.
    if (typeof user.isLocked === 'function' && user.isLocked()) {
      return next(forbidden('This account is temporarily locked.'));
    }

    req.user = user;
    // Await the streak bump so the very first request of a new IST day shows
    // the freshly-bumped value (previously it returned yesterday's count on
    // the first request of the day, then the second request reflected the
    // increment). Steady-state cost is one small projection-only read per
    // authenticated request; the write only fires at the IST day boundary.
    // Errors are non-fatal — log and proceed so a transient DB hiccup doesn't
    // lock the user out of every authenticated endpoint.
    try {
      const bumped = await bumpDailyStreak(user._id);
      if (bumped) {
        req.user.dailyStreak = bumped.dailyStreak;
        req.user.bestDailyStreak = bumped.bestDailyStreak;
        req.user.streakFreezes = bumped.streakFreezes;
        req.user.lastActiveDate = bumped.lastActiveDate;
      }
    } catch (e) {
      console.error('streak update failed:', e.message);
    }
    next();
  } catch (err) {
    return next(unauthorized('Not authorized, token failed'));
  }
};

module.exports = { protect, MAX_FREEZES };
