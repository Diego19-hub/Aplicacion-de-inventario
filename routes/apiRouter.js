import { Router } from "express";

import {
  getCsrfToken,
  getSession
} from "../controllers/apiSessionController.js";
import {
  login,
  register,
  logout
} from "../controllers/apiAuthController.js";
import {
  listBusinesses,
  selectActiveBusiness
} from "../controllers/apiBusinessController.js";
import { createOnboardingBusiness } from "../controllers/apiOnboardingController.js";
import { getDashboard } from "../controllers/apiDashboardController.js";
import { changeApiMemberRole, getMembers, reactivateApiMember, removeApiMember, suspendApiMember } from "../controllers/apiMembersController.js";
import {
  createInvitation,
  revokeInvitation
} from "../controllers/apiInvitationsController.js";
import {
  acceptPublicInvitation,
  getPublicInvitation
} from "../controllers/apiInvitationAcceptanceController.js";
import {
  createCategory,
  getCategoryDetails,
  getCategoryForEdit,
  removeCategory,
  updateCategory,
  listCategories
} from "../controllers/apiCategoriesController.js";
import {
  getLocationDetails,
  listLocations
} from "../controllers/apiLocationsController.js";
import {
  createLocation,
  getLocationForEdit,
  updateLocation
} from "../controllers/apiLocationMutationsController.js";
import {
  deactivateLocation,
  makeDefaultLocation,
  reactivateLocation
} from "../controllers/apiLocationTransitionsController.js";
import {
  createSupplier,
  deactivateSupplier,
  getSupplierForEdit,
  getSupplierDetails,
  listSuppliers,
  reactivateSupplier,
  updateSupplier
} from "../controllers/apiSuppliersController.js";
import {
  archiveProduct,
  createProduct,
  getProductForEdit,
  getProductFormOptions,
  listProducts,
  updateProduct
} from "../controllers/apiProductsController.js";
import { getProductDetails } from "../controllers/apiProductDetailsController.js";
import { confirmProductImport, downloadProductImportTemplate, previewProductImport } from "../controllers/apiProductImportController.js";
import { rateLimit } from "express-rate-limit";
import { handleProductImportUploadError, productImportUpload } from "../middleware/productImportUpload.js";
import {
  createProductMovement,
  getProductMovementFormOptions,
  getProductMovements
} from "../controllers/apiProductMovementsController.js";
import {
  createTransfer,
  getTransferDetails,
  getTransferFormOptions,
  listTransfers
} from "../controllers/apiTransfersController.js";
import {
  getArchivedProductDetails,
  listArchivedProducts,
  restoreArchivedProduct
} from "../controllers/apiArchivedProductsController.js";
import { apiRegisterValidation, loginValidation } from "../middleware/authValidation.js";
import { requireApiAuth } from "../middleware/apiAuthMiddleware.js";
import { requireApiActiveBusiness } from "../middleware/apiActiveBusinessMiddleware.js";
import { requireApiBusinessRole } from "../middleware/apiAuthorizationMiddleware.js";
import { requireApiSuperAdmin } from "../middleware/apiAuthorizationMiddleware.js";
import {
  businesses as adminBusinesses,
  changeOwner as changeAdminBusinessOwner,
  create as createAdminBusiness,
  dashboard as adminDashboard,
  detail as adminBusinessDetail,
  formOptions as adminBusinessFormOptions,
  getEdit as getAdminBusinessEdit,
  ownerOptions as adminBusinessOwnerOptions,
  transition as transitionAdminBusiness,
  update as updateAdminBusiness
} from "../controllers/apiAdminController.js";
import {
  apiArchiveItemValidation,
  apiItemUpdateValidation,
  apiItemValidation,
  apiMovementValidation
} from "../middleware/itemValidation.js";
import { apiTransferValidation } from "../middleware/transferValidation.js";
import { apiCategoryValidation } from "../middleware/categoryValidation.js";
import { apiLocationValidation } from "../middleware/locationValidation.js";
import { apiSupplierValidation } from "../middleware/supplierValidation.js";
import { onboardingBusinessValidation } from "../middleware/adminValidation.js";
import { listStockAlerts, reviewStockAlert } from "../controllers/apiAlertsController.js";
import { getThresholds, removeThreshold, saveThreshold } from "../controllers/apiThresholdsController.js";
import { apiThresholdValidation } from "../middleware/alertValidation.js";
import { inventoryCsvApi, inventoryReportApi, movementCsvApi, movementReportApi } from "../controllers/apiReportsController.js";
import {
  apiInvitationActionValidation,
  apiInvitationValidation,
  apiMemberActionValidation,
  apiMemberRoleValidation
} from "../middleware/memberValidation.js";
import { authLimiter, invitationLimiter } from "../middleware/securityMiddleware.js";
import { googleCallback, startGoogleAuth } from "../controllers/apiGoogleAuthController.js";
import { createSale, getPosFormOptionsController, getPosProductsController, getSaleDetailsController, listSales } from "../controllers/apiSaleController.js";
import { apiSaleValidation } from "../middleware/saleValidation.js";
import { getBreakEven } from "../controllers/apiBreakEvenController.js";
import { breakEvenValidation } from "../middleware/breakEvenValidation.js";
import { createRecipeController, getRecipeController, listRecipesController, produceRecipeController, recipeOptions, updateRecipeController, updateRecipeStatusController } from "../controllers/apiRecipeController.js";
import { recipeProductionValidation, recipeStatusValidation, recipeValidation } from "../middleware/recipeValidation.js";
import { getTransactionController, listTransactionsController, transactionOptions } from "../controllers/apiTransactionsController.js";
import { inventoryCenterApi, inventoryCenterCsvApi, inventoryCenterExcelApi } from "../controllers/apiInventoryCenterController.js";
import { createAdjustment, createEntry } from "../controllers/apiInventoryTransactionsController.js";
import { inventoryAdjustmentValidation, inventoryEntryValidation } from "../middleware/inventoryTransactionValidation.js";
import {
  closeCashSessionController,
  createCashMovementController,
  createCashRegisterController,
  getCurrentCashSessionController,
  listCashSessionMovements,
  listCashSessions,
  listCashRegisters,
  openCashSessionController
} from "../controllers/apiCashController.js";
import {
  cashMovementValidation,
  cashRegisterValidation,
  cashSessionCloseValidation,
  cashSessionOpenValidation
} from "../middleware/cashValidation.js";
import {
  createBusinessCostController,
  listBusinessCosts,
  updateBusinessCostController,
  updateBusinessCostStatusController
} from "../controllers/apiBusinessCostController.js";
import {
  businessCostStatusValidation,
  businessCostValidation
} from "../middleware/businessCostValidation.js";
import { customerValidation, customerStatusValidation, chargeValidation, chargeStatusValidation, paymentValidation, cancellationValidation } from "../middleware/customerCollectionsValidation.js";
import { listCustomers, createCustomer, getCustomer, updateCustomer, setCustomerStatus, listCharges, createCharge, getCharge, updateCharge, updateChargeStatus, listPayments, getPayment, createPayment, cancelPayment, accountStatement, balance, collectionsSummary, collectionAlerts, receipt } from "../controllers/apiCustomerCollectionsController.js";

const apiRouter = Router();

apiRouter.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

apiRouter.get("/csrf-token", getCsrfToken);
apiRouter.get("/session", getSession);
apiRouter.get("/auth/google", startGoogleAuth);
apiRouter.get("/auth/google/callback", googleCallback);
apiRouter.get("/invitations/:token", invitationLimiter, getPublicInvitation);
apiRouter.post("/invitations/:token/accept", invitationLimiter, requireApiAuth, acceptPublicInvitation);
apiRouter.post("/auth/register", apiRegisterValidation, authLimiter, register);
apiRouter.post("/auth/login", loginValidation, authLimiter, login);
apiRouter.post("/auth/logout", logout);
apiRouter.get("/businesses", requireApiAuth, listBusinesses);
apiRouter.put("/session/active-business", requireApiAuth, selectActiveBusiness);
apiRouter.get("/dashboard", requireApiAuth, requireApiActiveBusiness, getDashboard);
apiRouter.get("/break-even", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), breakEvenValidation, getBreakEven);
apiRouter.get("/pos/products", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), getPosProductsController);
apiRouter.get("/pos/form-options", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), getPosFormOptionsController);
apiRouter.post("/sales", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), apiSaleValidation, createSale);
apiRouter.get("/sales", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listSales);
apiRouter.get("/sales/:saleId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), getSaleDetailsController);
apiRouter.get("/business-costs", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listBusinessCosts);
apiRouter.post("/business-costs", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), businessCostValidation, createBusinessCostController);
apiRouter.put("/business-costs/:costId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), businessCostValidation, updateBusinessCostController);
apiRouter.patch("/business-costs/:costId/status", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), businessCostStatusValidation, updateBusinessCostStatusController);
apiRouter.get("/recipes", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listRecipesController);
apiRouter.get("/recipes/options", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), recipeOptions);
apiRouter.post("/recipes", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), recipeValidation, createRecipeController);
apiRouter.get("/recipes/:recipeId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), getRecipeController);
apiRouter.put("/recipes/:recipeId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), recipeValidation, updateRecipeController);
apiRouter.patch("/recipes/:recipeId/status", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), recipeStatusValidation, updateRecipeStatusController);
apiRouter.post("/recipes/:recipeId/produce", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), recipeProductionValidation, produceRecipeController);
apiRouter.get("/transactions", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listTransactionsController);
apiRouter.get("/transactions/options", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), transactionOptions);
apiRouter.get("/transactions/:transactionId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), getTransactionController);
apiRouter.get("/reports/inventory-center", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), inventoryCenterApi);
apiRouter.get("/reports/inventory-center.csv", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), inventoryCenterCsvApi);
apiRouter.get("/reports/inventory-center.xlsx", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), inventoryCenterExcelApi);
apiRouter.post("/transactions/entries", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), inventoryEntryValidation, createEntry);
apiRouter.post("/transactions/adjustments", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), inventoryAdjustmentValidation, createAdjustment);
apiRouter.get("/customers", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listCustomers);
apiRouter.post("/customers", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), customerValidation, createCustomer);
apiRouter.get("/customers/:customerId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), getCustomer);
apiRouter.put("/customers/:customerId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), customerValidation, updateCustomer);
apiRouter.patch("/customers/:customerId/status", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), customerStatusValidation, setCustomerStatus);
apiRouter.get("/customer-charges", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listCharges);
apiRouter.post("/customer-charges", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), chargeValidation, createCharge);
apiRouter.get("/customer-charges/:chargeId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), getCharge);
apiRouter.put("/customer-charges/:chargeId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), chargeValidation, updateCharge);
apiRouter.patch("/customer-charges/:chargeId/status", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), chargeStatusValidation, updateChargeStatus);
apiRouter.post("/customer-payments", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), paymentValidation, createPayment);
apiRouter.get("/customer-payments", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listPayments);
apiRouter.get("/customer-payments/:paymentId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), getPayment);
apiRouter.post("/customer-payments/:paymentId/cancel", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner"), cancellationValidation, cancelPayment);
apiRouter.get("/customers/:customerId/account-statement", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), accountStatement);
apiRouter.get("/customers/:customerId/balance", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), balance);
apiRouter.get("/customer-payments/:paymentId/receipt", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), receipt);
apiRouter.get("/collections/summary", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), collectionsSummary);
apiRouter.get("/collections/alerts", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), collectionAlerts);
apiRouter.get("/cash/registers", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listCashRegisters);
apiRouter.post("/cash/registers", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), cashRegisterValidation, createCashRegisterController);
apiRouter.get("/cash/sessions/current", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), getCurrentCashSessionController);
apiRouter.get("/cash/sessions", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listCashSessions);
apiRouter.get("/cash/sessions/:sessionId/movements", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listCashSessionMovements);
apiRouter.post("/cash/sessions/open", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), cashSessionOpenValidation, openCashSessionController);
apiRouter.post("/cash/sessions/:sessionId/movements", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), cashMovementValidation, createCashMovementController);
apiRouter.post("/cash/sessions/:sessionId/close", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), cashSessionCloseValidation, closeCashSessionController);
apiRouter.get("/admin/dashboard", requireApiAuth, requireApiSuperAdmin, adminDashboard);
apiRouter.get("/admin/businesses", requireApiAuth, requireApiSuperAdmin, adminBusinesses);
apiRouter.get("/admin/businesses/form-options", requireApiAuth, requireApiSuperAdmin, adminBusinessFormOptions);
apiRouter.post("/admin/businesses", requireApiAuth, requireApiSuperAdmin, createAdminBusiness);
apiRouter.get("/admin/businesses/:businessId/edit", requireApiAuth, requireApiSuperAdmin, getAdminBusinessEdit);
apiRouter.put("/admin/businesses/:businessId", requireApiAuth, requireApiSuperAdmin, updateAdminBusiness);
apiRouter.get("/admin/businesses/:businessId/change-owner/options", requireApiAuth, requireApiSuperAdmin, adminBusinessOwnerOptions);
apiRouter.post("/admin/businesses/:businessId/change-owner", requireApiAuth, requireApiSuperAdmin, changeAdminBusinessOwner);
apiRouter.post("/admin/businesses/:businessId/suspend", requireApiAuth, requireApiSuperAdmin, (req, res, next) => {
  req.params.action = "suspend";
  transitionAdminBusiness(req, res, next);
});
apiRouter.post("/admin/businesses/:businessId/reactivate", requireApiAuth, requireApiSuperAdmin, (req, res, next) => {
  req.params.action = "reactivate";
  transitionAdminBusiness(req, res, next);
});
apiRouter.post("/admin/businesses/:businessId/archive", requireApiAuth, requireApiSuperAdmin, (req, res, next) => {
  req.params.action = "archive";
  transitionAdminBusiness(req, res, next);
});
apiRouter.get("/admin/businesses/:businessId", requireApiAuth, requireApiSuperAdmin, adminBusinessDetail);
apiRouter.get("/alerts/stock", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager", "viewer"), listStockAlerts);
apiRouter.patch("/alerts/stock/:thresholdId/review", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), reviewStockAlert);
apiRouter.get("/reports/inventory", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner","manager","viewer"), inventoryReportApi);
apiRouter.get("/reports/movements", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner","manager","viewer"), movementReportApi);
apiRouter.get("/movements", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner","manager","viewer"), movementReportApi);
apiRouter.get("/reports/inventory.csv", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner","manager","viewer"), inventoryCsvApi);
apiRouter.get("/reports/movements.csv", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner","manager","viewer"), movementCsvApi);
apiRouter.get("/products/:productId/thresholds", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), getThresholds);
apiRouter.put("/products/:productId/thresholds/:locationId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), apiThresholdValidation, saveThreshold);
apiRouter.delete("/products/:productId/thresholds/:locationId", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner", "manager"), removeThreshold);
apiRouter.get(
  "/members",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  getMembers
);
apiRouter.post(
  "/members/invitations",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  invitationLimiter,
  apiInvitationValidation,
  createInvitation
);
apiRouter.post(
  "/members/invitations/:invitationId/revoke",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  invitationLimiter,
  apiInvitationActionValidation,
  revokeInvitation
);
apiRouter.put("/members/:membershipId/role", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner"), apiMemberRoleValidation, changeApiMemberRole);
apiRouter.post("/members/:membershipId/suspend", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner"), apiMemberActionValidation, suspendApiMember);
apiRouter.post("/members/:membershipId/reactivate", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner"), apiMemberActionValidation, reactivateApiMember);
apiRouter.post("/members/:membershipId/remove", requireApiAuth, requireApiActiveBusiness, requireApiBusinessRole("owner"), apiMemberActionValidation, removeApiMember);
apiRouter.get(
  "/categories",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager", "viewer"),
  listCategories
);
apiRouter.post(
  "/categories",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  apiCategoryValidation,
  createCategory
);
apiRouter.get(
  "/categories/:categoryId/edit",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  getCategoryForEdit
);
apiRouter.put(
  "/categories/:categoryId",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  apiCategoryValidation,
  updateCategory
);
apiRouter.delete(
  "/categories/:categoryId",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  removeCategory
);
apiRouter.get(
  "/categories/:categoryId",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager", "viewer"),
  getCategoryDetails
);
apiRouter.get(
  "/locations",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager", "viewer"),
  listLocations
);
apiRouter.post(
  "/locations",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  apiLocationValidation,
  createLocation
);
apiRouter.get(
  "/locations/:locationId/edit",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  getLocationForEdit
);
apiRouter.put(
  "/locations/:locationId",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  apiLocationValidation,
  updateLocation
);
apiRouter.post(
  "/locations/:locationId/make-default",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  makeDefaultLocation
);
apiRouter.post(
  "/locations/:locationId/deactivate",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  deactivateLocation
);
apiRouter.post(
  "/locations/:locationId/reactivate",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  reactivateLocation
);
apiRouter.get(
  "/locations/:locationId",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager", "viewer"),
  getLocationDetails
);
apiRouter.get(
  "/suppliers",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager", "viewer"),
  listSuppliers
);
apiRouter.post(
  "/suppliers",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  apiSupplierValidation,
  createSupplier
);
apiRouter.get(
  "/suppliers/:supplierId/edit",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  getSupplierForEdit
);
apiRouter.put(
  "/suppliers/:supplierId",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  apiSupplierValidation,
  updateSupplier
);
apiRouter.post(
  "/suppliers/:supplierId/deactivate",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  deactivateSupplier
);
apiRouter.post(
  "/suppliers/:supplierId/reactivate",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  reactivateSupplier
);
apiRouter.get(
  "/suppliers/:supplierId",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager", "viewer"),
  getSupplierDetails
);
apiRouter.get(
  "/transfers/form-options",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  getTransferFormOptions
);
apiRouter.post(
  "/transfers",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  apiTransferValidation,
  createTransfer
);
apiRouter.get(
  "/transfers",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager", "viewer"),
  listTransfers
);
apiRouter.get(
  "/transfers/:transferId",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager", "viewer"),
  getTransferDetails
);
apiRouter.get("/products", requireApiAuth, requireApiActiveBusiness, listProducts);
apiRouter.get(
  "/products/archived",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  listArchivedProducts
);
apiRouter.get(
  "/products/form-options",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  getProductFormOptions
);
apiRouter.post(
  "/products",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  apiItemValidation,
  createProduct
);
apiRouter.post(
  "/products/import/preview",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false }),
  productImportUpload,
  handleProductImportUploadError,
  previewProductImport
);
apiRouter.get("/products/import/template", downloadProductImportTemplate);
apiRouter.post(
  "/products/import/confirm",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  confirmProductImport
);
apiRouter.get(
  "/products/:productId/edit",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  getProductForEdit
);
apiRouter.put(
  "/products/:productId",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  apiItemUpdateValidation,
  updateProduct
);
apiRouter.post(
  "/products/:productId/archive",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  apiArchiveItemValidation,
  archiveProduct
);
apiRouter.get(
  "/products/:productId/archived",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  getArchivedProductDetails
);
apiRouter.post(
  "/products/:productId/restore",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner"),
  restoreArchivedProduct
);
apiRouter.get(
  "/products/:productId/movements/form-options",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  getProductMovementFormOptions
);
apiRouter.post(
  "/products/:productId/movements",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager"),
  apiMovementValidation,
  createProductMovement
);
apiRouter.get(
  "/products/:productId/movements",
  requireApiAuth,
  requireApiActiveBusiness,
  requireApiBusinessRole("owner", "manager", "viewer"),
  getProductMovements
);
apiRouter.post(
  "/onboarding/business",
  requireApiAuth,
  onboardingBusinessValidation,
  createOnboardingBusiness
);
apiRouter.get("/products/:productId", requireApiAuth, requireApiActiveBusiness, getProductDetails);

apiRouter.use((req, res) => {
  res.status(404).json({
    error: {
      code: "RESOURCE_NOT_FOUND",
      message: "Recurso no encontrado."
    }
  });
});

apiRouter.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.code === "EBADCSRFTOKEN") {
    return res.status(403).json({
      error: {
        code: "CSRF_INVALID",
        message: "El token CSRF es inválido."
      }
    });
  }

  if (error.statusCode === 429) {
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Demasiados intentos. Espera 15 minutos antes de volver a intentarlo."
      }
    });
  }

  if (process.env.NODE_ENV !== "production") {
    console.error("[API ERROR]", {
      method: req.method,
      path: req.originalUrl,
      code: error.code,
      message: error.message,
      stack: error.stack
    });
  }

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Ocurrió un error interno."
    }
  });
});

export default apiRouter;
