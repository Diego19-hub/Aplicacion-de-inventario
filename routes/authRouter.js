import { Router } from "express";

import {
  showRegisterForm,
  registerUser,
  showLoginForm,
  loginUser,
  logoutUser
} from "../controllers/authController.js";

import {
  registerValidation,
  loginValidation
} from "../middleware/authValidation.js";

import {
  authLimiter
} from "../middleware/securityMiddleware.js";

const authRouter = Router();


authRouter.get("/register", showRegisterForm);
authRouter.post("/register", registerValidation, authLimiter, registerUser);
authRouter.get("/login", showLoginForm);
authRouter.post("/login", loginValidation, authLimiter, loginUser);
authRouter.post("/logout", logoutUser);

export default authRouter;
