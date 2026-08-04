import AppError from "../utils/AppError.js";
import {
  getActiveBusinessesForUser,
  getActiveBusinessMembership
} from "../db/businessQueries.js";

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function showBusinessSelector(req, res, next) {
  try {
    const businesses = await getActiveBusinessesForUser(req.session.user.id);

    if (businesses.length === 0) {
      return res.redirect("/businesses/no-access");
    }

    if (businesses.length === 1) {
      req.session.activeBusinessId = businesses[0].id;
      await saveSession(req);
      return res.redirect("/");
    }

    res.render("businesses/select", {
      title: "Seleccionar negocio",
      businesses,
      error: null
    });
  } catch (error) {
    next(error);
  }
}

export async function selectBusiness(req, res, next) {
  const businessId = Number(req.body.businessId);

  if (!Number.isInteger(businessId) || businessId < 1) {
    return next(new AppError("Selecciona un negocio válido.", 400));
  }

  try {
    const membership = await getActiveBusinessMembership(
      req.session.user.id,
      businessId
    );

    if (!membership) {
      return next(new AppError("No tienes acceso al negocio seleccionado.", 403));
    }

    req.session.activeBusinessId = membership.id;
    await saveSession(req);
    res.redirect("/");
  } catch (error) {
    next(error);
  }
}

export async function showNoBusinessAccess(req, res, next) {
  try {
    const businesses = await getActiveBusinessesForUser(req.session.user.id);

    if (businesses.length === 1) {
      req.session.activeBusinessId = businesses[0].id;
      await saveSession(req);
      return res.redirect("/");
    }

    if (businesses.length > 1) {
      return res.redirect("/businesses/select");
    }

    res.render("businesses/no-access", {
      title: "Acceso pendiente"
    });
  } catch (error) {
    next(error);
  }
}
