import { getActiveBusinessMembership } from "../db/businessQueries.js";

export function sessionPermissions(membership, platformRole) {
  const role = membership?.role;

  return {
    canManageInventory: ["owner", "manager"].includes(role),
    canDeleteInventory: role === "owner",
    canManageMembers: role === "owner",
    isSuperAdmin: platformRole === "super_admin"
  };
}

export function serializeActiveBusiness(activeMembership) {
  return {
    id: activeMembership.id,
    name: activeMembership.name,
    slug: activeMembership.slug,
    currency: activeMembership.currency,
    timezone: activeMembership.timezone,
    status: activeMembership.status
  };
}

export function serializeMembership(activeMembership) {
  return {
    role: activeMembership.role,
    status: activeMembership.membership_status
  };
}

function sessionData(user) {
  if (!user) {
    return {
      authenticated: false,
      user: null,
      activeBusiness: null,
      membership: null,
      permissions: sessionPermissions(null, null)
    };
  }

  return {
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      platformRole: user.platformRole
    },
    activeBusiness: null,
    membership: null,
    permissions: sessionPermissions(null, user.platformRole)
  };
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function getCsrfToken(req, res) {
  res.status(200).json({
    data: {
      csrfToken: req.csrfToken()
    }
  });
}

export async function getSession(req, res, next) {
  const user = req.session.user;
  const data = sessionData(user);

  if (!user) {
    return res.status(200).json({ data });
  }

  const activeBusinessId = req.session.activeBusinessId;

  if (activeBusinessId === undefined || activeBusinessId === null) {
    return res.status(200).json({ data });
  }

  const businessId = Number(activeBusinessId);

  try {
    if (!Number.isInteger(businessId) || businessId < 1) {
      delete req.session.activeBusinessId;
      await saveSession(req);
      return res.status(200).json({ data });
    }

    const activeMembership = await getActiveBusinessMembership(user.id, businessId);

    if (!activeMembership) {
      delete req.session.activeBusinessId;
      await saveSession(req);
      return res.status(200).json({ data });
    }

    data.activeBusiness = serializeActiveBusiness(activeMembership);
    data.membership = serializeMembership(activeMembership);
    data.permissions = sessionPermissions(data.membership, user.platformRole);

    return res.status(200).json({ data });
  } catch (error) {
    return next(error);
  }
}
