import { Router } from "express";
import {
  setCategoryBudgets,
  getBudgetSummary,
  copyBudgetToNextMonth,
  getBudgetByPeriod
} from "../controllers/budget.controllers.js";
import { auth } from "../middlewares/auth.middleware.js";
import { adminOnly } from "../middlewares/admin.middleware.js";

const router = Router();

// Admin routes — sirf admin access kar sakta hai
router.post("/set", auth, adminOnly, setCategoryBudgets);
router.post("/copy-to-next", auth, adminOnly, copyBudgetToNextMonth);

// Common routes — admin aur user dono
router.get("/summary", auth, getBudgetSummary);
router.get("/search", auth, getBudgetByPeriod);

export default router;