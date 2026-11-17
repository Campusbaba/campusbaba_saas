import { Request, Response } from "express";
import { Payment, Expense } from "../models";
import { asyncHandler } from "../middlewares/asyncHandler";
import { fromPaisa, toPaisa } from "../domain/finance/FeeAllocationPolicy";

/**
 * Financial Reports Controller (Fixes P0-5):
 * - All Payment aggregations now filter on `{ paymentStatus: "paid" }` instead of `{ status: "paid" }`.
 * - Profit/Loss monthly breakdown merges both income months AND expense-only months so zero-income months with expenses are never dropped.
 */
export const getIncomeReport = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate, groupBy = "month" } = req.query;

    // P0-5 Fix: Payment uses `paymentStatus`, not `status`
    const filter: any = { paymentStatus: "paid" };
    if (startDate || endDate) {
      filter.paidDate = {};
      if (startDate) filter.paidDate.$gte = new Date(startDate as string);
      if (endDate) filter.paidDate.$lte = new Date(endDate as string);
    }

    let groupByFormat: any;
    if (groupBy === "day") {
      groupByFormat = {
        $dateToString: { format: "%Y-%m-%d", date: "$paidDate" },
      };
    } else if (groupBy === "month") {
      groupByFormat = { $dateToString: { format: "%Y-%m", date: "$paidDate" } };
    } else {
      groupByFormat = { $year: "$paidDate" };
    }

    const incomeData = await Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: groupByFormat,
          totalIncome: { $sum: "$amount" },
          count: { $sum: 1 },
          byType: {
            $push: {
              type: "$paymentType",
              amount: "$amount",
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const byType = await Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$paymentType",
          totalIncome: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalIncomePaisa = incomeData.reduce(
      (sum, item) => sum + toPaisa(item.totalIncome),
      0
    );

    res.status(200).json({
      success: true,
      data: {
        timeline: incomeData,
        byType,
        totalIncome: fromPaisa(totalIncomePaisa),
      },
    });
  }
);

export const getExpenseReport = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate, groupBy = "month" } = req.query;

    const filter: any = { status: "paid" };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate as string);
      if (endDate) filter.date.$lte = new Date(endDate as string);
    }

    let groupByFormat: any;
    if (groupBy === "day") {
      groupByFormat = { $dateToString: { format: "%Y-%m-%d", date: "$date" } };
    } else if (groupBy === "month") {
      groupByFormat = { $dateToString: { format: "%Y-%m", date: "$date" } };
    } else {
      groupByFormat = { $year: "$date" };
    }

    const expenseData = await Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: groupByFormat,
          totalExpense: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const byCategory = await Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$category",
          totalExpense: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalExpensePaisa = expenseData.reduce(
      (sum, item) => sum + toPaisa(item.totalExpense),
      0
    );

    res.status(200).json({
      success: true,
      data: {
        timeline: expenseData,
        byCategory,
        totalExpense: fromPaisa(totalExpensePaisa),
      },
    });
  }
);

export const getBusinessProjection = asyncHandler(
  async (req: Request, res: Response) => {
    const { months = 6 } = req.query;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - Number(months));

    const [incomeHistory, expenseHistory] = await Promise.all([
      Payment.aggregate([
        {
          // P0-5 Fix: paymentStatus: "paid"
          $match: {
            paymentStatus: "paid",
            paidDate: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$paidDate" } },
            amount: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([
        {
          $match: {
            status: "paid",
            date: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
            amount: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const avgIncome =
      incomeHistory.reduce((sum, item) => sum + item.amount, 0) /
        incomeHistory.length || 0;
    const avgExpense =
      expenseHistory.reduce((sum, item) => sum + item.amount, 0) /
        expenseHistory.length || 0;

    const projections = [];
    for (let i = 1; i <= 3; i++) {
      const projectionDate = new Date();
      projectionDate.setMonth(projectionDate.getMonth() + i);
      const monthStr = projectionDate.toISOString().substring(0, 7);

      projections.push({
        month: monthStr,
        projectedIncome: Math.round(avgIncome),
        projectedExpense: Math.round(avgExpense),
        projectedProfit: Math.round(avgIncome - avgExpense),
      });
    }

    res.status(200).json({
      success: true,
      data: {
        historical: {
          income: incomeHistory,
          expense: expenseHistory,
        },
        projections,
      },
    });
  }
);

export const getProfitLossReport = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    const expenseFilter: any = { status: "paid" };
    if (startDate || endDate) {
      expenseFilter.date = {};
      if (startDate) expenseFilter.date.$gte = new Date(startDate as string);
      if (endDate) expenseFilter.date.$lte = new Date(endDate as string);
    }

    // P0-5 Fix: paymentStatus: "paid"
    const paymentFilter: any = { paymentStatus: "paid" };
    if (startDate || endDate) {
      paymentFilter.paidDate = {};
      if (startDate)
        paymentFilter.paidDate.$gte = new Date(startDate as string);
      if (endDate) paymentFilter.paidDate.$lte = new Date(endDate as string);
    }

    const [incomeByMonth, expenseByMonth] = await Promise.all([
      Payment.aggregate([
        { $match: paymentFilter },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$paidDate" } },
            income: { $sum: "$amount" },
          },
        },
      ]),
      Expense.aggregate([
        { $match: expenseFilter },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
            expense: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    // Merge all months present in either income OR expenses (fixes missing expense-only months)
    const monthSet = new Set<string>();
    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();

    for (const row of incomeByMonth) {
      if (row._id) {
        monthSet.add(row._id);
        incomeMap.set(row._id, toPaisa(row.income));
      }
    }
    for (const row of expenseByMonth) {
      if (row._id) {
        monthSet.add(row._id);
        expenseMap.set(row._id, toPaisa(row.expense));
      }
    }

    let totalIncomePaisa = 0;
    let totalExpensePaisa = 0;

    const monthlyBreakdown = Array.from(monthSet)
      .sort()
      .map((month) => {
        const incPaisa = incomeMap.get(month) ?? 0;
        const expPaisa = expenseMap.get(month) ?? 0;
        totalIncomePaisa += incPaisa;
        totalExpensePaisa += expPaisa;
        return {
          month,
          income: fromPaisa(incPaisa),
          expense: fromPaisa(expPaisa),
          profit: fromPaisa(incPaisa - expPaisa),
        };
      });

    const income = fromPaisa(totalIncomePaisa);
    const expense = fromPaisa(totalExpensePaisa);
    const profit = fromPaisa(totalIncomePaisa - totalExpensePaisa);
    const profitMargin =
      income > 0 ? ((profit / income) * 100).toFixed(2) : "0.00";

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalIncome: income,
          totalExpense: expense,
          netProfit: profit,
          profitMargin: `${profitMargin}%`,
        },
        monthlyBreakdown,
      },
    });
  }
);
