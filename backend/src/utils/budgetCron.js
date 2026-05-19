import cron from "node-cron";
import { pool } from "../db/index.js";

export const startBudgetCronJob = () => {

  // Runs on 1st of every month at midnight
  cron.schedule("0 0 0 1 * *", async () => {
    console.log("⏰ Cron job started — copying budget to next month...");

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear  = now.getFullYear();
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear  = currentMonth === 12 ? currentYear + 1 : currentYear;

    try {
      // Fetch current month budget
      const currentBudgets = await pool.query(
        `SELECT category_id, allocated_amount, created_by 
         FROM monthly_budgets 
         WHERE month = ? AND year = ?`,
        [currentMonth, currentYear]
      );

      if (currentBudgets.length === 0) {
        console.log("⚠️ No budget found for current month — skipping copy");
        return;
      }

      let copied = 0;
      let skipped = 0;

      for (const b of currentBudgets) {
        // Check if next month budget already exists
        const exists = await pool.query(
          `SELECT id FROM monthly_budgets 
           WHERE category_id = ? AND month = ? AND year = ?`,
          [b.category_id, nextMonth, nextYear]
        );

        if (exists.length === 0) {
          // Insert new record
          await pool.query(
            `INSERT INTO monthly_budgets 
             (category_id, month, year, allocated_amount, currency, created_by)
             VALUES (?, ?, ?, ?, 'INR', ?)`,
            [b.category_id, nextMonth, nextYear, b.allocated_amount, b.created_by]
          );
          copied++;
        } else {
          // Already set by admin — skip
          skipped++;
        }
      }

      console.log(`✅ Cron job complete!`);
      console.log(`   Copied: ${copied} categories`);
      console.log(`   Skipped: ${skipped} categories (already set)`);

    } catch (error) {
      console.error("❌ Cron job error:", error.message);
    }
  });

  console.log("✅ Budget cron job registered — runs on 1st of every month!");
};