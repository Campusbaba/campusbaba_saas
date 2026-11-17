import { Request, Response } from "express";
import { Student, ClassRoom, nextSequence } from "../models";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../middlewares/errorHandler";
import {
  getPaginationParams,
  createPaginationResult,
} from "../utils/pagination";
import { container } from "../composition/container";

export const createStudent = asyncHandler(
  async (req: Request, res: Response) => {
    const targetStatus = req.body.status || "active";

    // P0-9 Fix: Atomic quota enforcement
    if (req.tenant && targetStatus === "active") {
      const activeStudentsCount = await Student.countDocuments({
        status: "active",
      });
      try {
        container.platformSaas.reserveQuotaSlot({
          tenantKey: req.tenant.subdomain,
          resource: "students",
          currentCountInDb: activeStudentsCount,
          limit: req.tenant.maxStudents,
        });
      } catch (err: any) {
        throw new AppError(403, err.message);
      }
    }

    // D-16 Fix: Check classroom capacity and increment currentEnrollment
    if (req.body.classRoomId) {
      const classRoom = await ClassRoom.findById(req.body.classRoomId);
      if (classRoom && classRoom.currentEnrollment >= classRoom.capacity) {
        throw new AppError(
          400,
          `Classroom '${classRoom.name}' has reached maximum capacity (${classRoom.capacity})`
        );
      }
    }

    const seq = await nextSequence("student");
    const studentId = `STU-${String(seq).padStart(4, "0")}`;
    const student = await Student.create({ ...req.body, studentId });

    if (student.classRoomId) {
      await ClassRoom.findByIdAndUpdate(student.classRoomId, {
        $inc: { currentEnrollment: 1 },
      });
    }

    res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: student,
    });
  }
);

export const getAllStudents = asyncHandler(
  async (req: Request, res: Response) => {
    const { page, limit, sortBy, sortOrder } = getPaginationParams(req.query);
    const { status, classRoomId, search } = req.query;

    const filter: any = {};
    if (status) filter.status = status;
    if (classRoomId) filter.classRoomId = classRoomId;
    if (search) {
      filter.$or = [
        { studentId: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const sortOptions: any = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [students, total] = await Promise.all([
      Student.find(filter)
        .populate("parentId", "firstName lastName email phone")
        .populate("classRoomId", "name roomNumber")
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);

    const result = createPaginationResult(students, total, page, limit);

    res.status(200).json({
      success: true,
      ...result,
    });
  }
);

export const getStudentById = asyncHandler(
  async (req: Request, res: Response) => {
    const student = await Student.findById(req.params.id)
      .populate("parentId", "firstName lastName email phone relationship")
      .populate("classRoomId", "name roomNumber departmentId courseId");

    if (!student) {
      throw new AppError(404, "Student not found");
    }

    res.status(200).json({
      success: true,
      data: student,
    });
  }
);

export const updateStudent = asyncHandler(
  async (req: Request, res: Response) => {
    const existing = await Student.findById(req.params.id);
    if (!existing) {
      throw new AppError(404, "Student not found");
    }

    // P0-9 Fix: Prevent bypassing maxStudents by creating inactive and updating to active
    if (
      req.tenant &&
      existing.status !== "active" &&
      req.body.status === "active"
    ) {
      const activeStudentsCount = await Student.countDocuments({
        status: "active",
      });
      try {
        container.platformSaas.reserveQuotaSlot({
          tenantKey: req.tenant.subdomain,
          resource: "students",
          currentCountInDb: activeStudentsCount,
          limit: req.tenant.maxStudents,
        });
      } catch (err: any) {
        throw new AppError(403, err.message);
      }
    }

    const student = await Student.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Student updated successfully",
      data: student,
    });
  }
);

export const deleteStudent = asyncHandler(
  async (req: Request, res: Response) => {
    const student = await Student.findByIdAndDelete(req.params.id);

    if (!student) {
      throw new AppError(404, "Student not found");
    }

    if (student.classRoomId) {
      await ClassRoom.findByIdAndUpdate(student.classRoomId, {
        $inc: { currentEnrollment: -1 },
      });
    }

    res.status(200).json({
      success: true,
      message: "Student deleted successfully",
    });
  }
);

export const getStudentStats = asyncHandler(
  async (_req: Request, res: Response) => {
    const stats = await Student.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalStudents = await Student.countDocuments();
    const activeStudents = await Student.countDocuments({ status: "active" });

    res.status(200).json({
      success: true,
      data: {
        total: totalStudents,
        active: activeStudents,
        byStatus: stats,
      },
    });
  }
);
