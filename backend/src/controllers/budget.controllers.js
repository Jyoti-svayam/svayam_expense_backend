// /**
//  * GET BUDGET BY MONTH & YEAR
//  * Query params se month aur year lekar specific budget details return karta hai.
//  */
// export const getBudgetByPeriod = async (req, res) => {
//     // URL se query parameters lenge: /api/budgets/search?month=6&year=2026
//     const { month, year } = req.query;

//     if (!month || !year) {
//         return res.status(400).json({ message: "Please provide both month and year." });
//     }

//     try {
//         const rows = await pool.query(
//             `SELECT b.*, c.name as category_name, 
//              (SELECT SUM(amount) FROM expenses e 
//               WHERE e.category_id = b.category_id 
//               AND MONTH(e.created_at) = b.month 
//               AND YEAR(e.created_at) = b.year) as total_spent
//              FROM monthly_budgets b
//              JOIN categories c ON b.category_id = c.id
//              WHERE b.month = ? AND b.year = ?`,
//             [month, year]
//         );

//         if (rows.length === 0) {
//             return res.status(404).json({ message: "No budget found for the selected period." });
//         }

//         // Response mein total budget aur us waqt ka kharcha dono dikhayenge
//         res.json({
//             period: { month, year },
//             budgets: rows
//         });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// };


import { pool } from "../db/index.js";

/**
 * 1. ADMIN: Set category wise budget
 * POST /api/budget/set
 * Body: { budgets: [{ category_id, allocated_amount }], month, year }
 */
export const setCategoryBudgets = async (req, res) => {
  const { budgets, month, year } = req.body;
  const adminId = req.user.id;

  if (!budgets || !Array.isArray(budgets) || budgets.length === 0) {
    return res.status(400).json({ message: "Budgets array is required" });
  }
  if (!month || !year) {
    return res.status(400).json({ message: "Month and year are required" });
  }

  try {
    for (const b of budgets) {
      if (!b.category_id || b.allocated_amount === undefined) {
        return res.status(400).json({
          message: "Each entry must have category_id and allocated_amount"
        });
      }
      if (b.allocated_amount < 0) {
        return res.status(400).json({
          message: "Amount cannot be negative"
        });
      }

      // If exists update, otherwise insert
      const existing = await pool.query(
        `SELECT id FROM monthly_budgets 
         WHERE category_id = ? AND month = ? AND year = ?`,
        [b.category_id, month, year]
      );

      if (existing.length > 0) {
        await pool.query(
          `UPDATE monthly_budgets 
           SET allocated_amount = ?, created_by = ?
           WHERE category_id = ? AND month = ? AND year = ?`,
          [b.allocated_amount, adminId, b.category_id, month, year]
        );
      } else {
        await pool.query(
          `INSERT INTO monthly_budgets 
           (category_id, month, year, allocated_amount, currency, created_by)
           VALUES (?, ?, ?, ?, 'INR', ?)`,
          [b.category_id, month, year, b.allocated_amount, adminId]
        );
      }
    }

    const saved = await pool.query(
      `SELECT mb.*, c.name as category_name
       FROM monthly_budgets mb
       JOIN categories c ON mb.category_id = c.id
       WHERE mb.month = ? AND mb.year = ?`,
      [month, year]
    );

    res.status(200).json({
      success: true,
      message: `Budget set successfully for ${month}/${year}!`,
      data: saved
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * 2. Category wise budget summary — spent + remaining
 * GET /api/budget/summary?month=5&year=2026
 */
export const getBudgetSummary = async (req, res) => {
  const now = new Date();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);
  const year  = parseInt(req.query.year)  || now.getFullYear();

  try {
    const summary = await pool.query(
      `SELECT 
         c.id         AS category_id,
         c.name       AS category_name,
         mb.allocated_amount AS budget,
         COALESCE(SUM(e.amount), 0) AS spent,
         mb.allocated_amount - COALESCE(SUM(e.amount), 0) AS remaining,
         ROUND(COALESCE(SUM(e.amount), 0) / mb.allocated_amount * 100, 1) AS percentage
       FROM monthly_budgets mb
       JOIN categories c ON mb.category_id = c.id
       LEFT JOIN expenses e 
         ON e.category_id = mb.category_id
         AND MONTH(e.created_at) = mb.month
         AND YEAR(e.created_at)  = mb.year
       WHERE mb.month = ? AND mb.year = ?
       GROUP BY c.id, c.name, mb.allocated_amount`,
      [month, year]
    );

    if (summary.length === 0) {
      return res.status(404).json({
        message: "No budget found for this month"
      });
    }

    const data = summary.map(row => ({
      ...row,
      status: row.percentage >= 100 ? 'exceeded'
            : row.percentage >= 80  ? 'warning'
            : 'safe'
    }));

    res.json({ success: true, month, year, data });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * 3. Auto-copy previous month budget to next month
 * POST /api/budget/copy-to-next
 */
export const copyBudgetToNextMonth = async (req, res) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();

  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear  = currentMonth === 12 ? currentYear + 1 : currentYear;
  const adminId   = req.user.id;

  try {
    const current = await pool.query(
      `SELECT category_id, allocated_amount 
       FROM monthly_budgets 
       WHERE month = ? AND year = ?`,
      [currentMonth, currentYear]
    );

    if (current.length === 0) {
      return res.status(404).json({
        message: "No budget found for current month to copy"
      });
    }

    let copied = 0;
    for (const b of current) {
      const exists = await pool.query(
        `SELECT id FROM monthly_budgets 
         WHERE category_id = ? AND month = ? AND year = ?`,
        [b.category_id, nextMonth, nextYear]
      );

      if (exists.length === 0) {
        await pool.query(
          `INSERT INTO monthly_budgets 
           (category_id, month, year, allocated_amount, currency, created_by)
           VALUES (?, ?, ?, ?, 'INR', ?)`,
          [b.category_id, nextMonth, nextYear, b.allocated_amount, adminId]
        );
        copied++;
      }
    }

    res.json({
      success: true,
      message: `${copied} categories copied successfully for ${nextMonth}/${nextYear}!`
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * 4. GET budget by month & year
 */
export const getBudgetByPeriod = async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ message: "Both month and year are required" });
  }

  try {
    const rows = await pool.query(
      `SELECT mb.*, c.name AS category_name,
         COALESCE(SUM(e.amount), 0) AS total_spent,
         mb.allocated_amount - COALESCE(SUM(e.amount), 0) AS remaining
       FROM monthly_budgets mb
       JOIN categories c ON mb.category_id = c.id
       LEFT JOIN expenses e
         ON e.category_id = mb.category_id
         AND MONTH(e.created_at) = mb.month
         AND YEAR(e.created_at)  = mb.year
       WHERE mb.month = ? AND mb.year = ?
       GROUP BY mb.id, c.name`,
      [month, year]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "No budget found for this period" });
    }

    res.json({ period: { month, year }, budgets: rows });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

