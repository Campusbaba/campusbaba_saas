import api from "@/lib/axios";

export interface StudyMaterial {
  id: string;
  title: string;
  subject: string;
  batch_name?: string;
  course_name?: string;
  description?: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by_name?: string;
  createdAt?: string;
}

export interface CoachingBatch {
  id: string;
  batch_code: string;
  name: string;
  course_name: string;
  monthly_fee: number;
  max_capacity: number;
  activeCount: number;
  waitlistCount: number;
  status: string;
  enrollments?: any[];
}

export interface McqQuiz {
  id: string;
  title: string;
  subject: string;
  batch_name?: string;
  duration_minutes: number;
  negative_mark_per_wrong: number;
  created_by_name?: string;
  questions: {
    questionId: string;
    questionText: string;
    options: string[];
    correctOptionIndex?: number;
    marks: number;
  }[];
  createdAt?: string;
}

export interface AssignmentItem {
  id: string;
  title: string;
  subject: string;
  batch_name?: string;
  due_date: string;
  max_marks: number;
  description: string;
  teacher_name?: string;
  submissionCount?: number;
  mySubmission?: any;
  submissions?: any[];
  createdAt?: string;
}

export const bdApi = {
  // Study Materials (Subject-Wise PDF Lecture Sheets)
  listMaterials: async (params?: { subject?: string; batchName?: string; search?: string }) => {
    const res = await api.get<{ success: boolean; data: StudyMaterial[] }>("/bd/materials", {
      params,
    });
    return res.data.data;
  },
  uploadMaterial: async (payload: {
    title: string;
    subject: string;
    batchName?: string;
    courseName?: string;
    description?: string;
    originalName: string;
    mimeType: string;
    base64Content: string;
  }) => {
    const res = await api.post<{ success: boolean; data: StudyMaterial }>("/bd/materials", payload);
    return res.data.data;
  },
  deleteMaterial: async (id: string) => {
    const res = await api.delete(`/bd/materials/${id}`);
    return res.data;
  },
  fetchMaterialBlobUrl: async (id: string, download = false): Promise<string> => {
    const res = await api.get(`/bd/materials/${id}/view`, {
      params: download ? { download: "1" } : undefined,
      responseType: "blob",
    });
    return URL.createObjectURL(res.data);
  },

  // Physical Library Books & Loans
  listBooks: async () => {
    const res = await api.get<{ success: boolean; data: any[] }>("/bd/library/books");
    return res.data.data;
  },
  createBook: async (payload: any) => {
    const res = await api.post("/bd/library/books", payload);
    return res.data.data;
  },

  // Coaching Batches
  listBatches: async () => {
    const res = await api.get<{ success: boolean; data: CoachingBatch[] }>("/bd/batches");
    return res.data.data;
  },
  createBatch: async (payload: {
    batchCode: string;
    name: string;
    courseName: string;
    monthlyFee: number;
    maxCapacity: number;
  }) => {
    const res = await api.post("/bd/batches", payload);
    return res.data.data;
  },
  enrollInBatch: async (
    batchId: string,
    payload: { studentId: string; joinDate?: string; monthlyFee?: number }
  ) => {
    const res = await api.post(`/bd/batches/${batchId}/enroll`, payload);
    return res.data.data;
  },

  // MCQ Quizzes
  listMcqQuizzes: async () => {
    const res = await api.get<{ success: boolean; data: McqQuiz[] }>("/bd/mcq");
    return res.data.data;
  },
  createMcqQuiz: async (payload: {
    title: string;
    subject: string;
    batchName?: string;
    durationMinutes: number;
    negativeMarkPerWrong: number;
    questions: {
      questionText: string;
      options: string[];
      correctOptionIndex: number;
      marks: number;
    }[];
  }) => {
    const res = await api.post("/bd/mcq", payload);
    return res.data.data;
  },
  submitMcqAttempt: async (
    quizId: string,
    answers: { questionId: string; selectedOptionIndex: number | null }[]
  ) => {
    const res = await api.post(`/bd/mcq/${quizId}/submit`, { answers });
    return res.data.data;
  },
  listMcqSubmissions: async () => {
    const res = await api.get<{ success: boolean; data: any[] }>("/bd/mcq/submissions");
    return res.data.data;
  },

  // Assignments / Homework
  listAssignments: async () => {
    const res = await api.get<{ success: boolean; data: AssignmentItem[] }>("/bd/assignments");
    return res.data.data;
  },
  createAssignment: async (payload: {
    title: string;
    subject: string;
    batchName?: string;
    dueDate: string;
    maxMarks: number;
    description: string;
  }) => {
    const res = await api.post("/bd/assignments", payload);
    return res.data.data;
  },
  submitAssignment: async (
    id: string,
    payload: { submissionText: string; attachmentUrl?: string }
  ) => {
    const res = await api.post(`/bd/assignments/${id}/submit`, payload);
    return res.data.data;
  },

  // BTRC SMS
  listSmsLogs: async () => {
    const res = await api.get<{ success: boolean; data: any[] }>("/bd/sms/logs");
    return res.data.data;
  },
  sendSms: async (payload: {
    to: string;
    message: string;
    senderId?: string;
    isPromotional?: boolean;
    tenantSmsCreditsAvailable?: number;
  }) => {
    const res = await api.post("/bd/sms/send", payload);
    return res.data.data;
  },

  // MFS Manual TrxID Payments
  listMfsPayments: async () => {
    const res = await api.get<{ success: boolean; data: any[] }>("/bd/mfs-payments");
    return res.data.data;
  },
  submitMfsPayment: async (payload: {
    invoiceId: string;
    studentId: string;
    amountBdt: number;
    gateway: "bkash" | "nagad" | "rocket" | "upay" | "manual";
    transactionId: string;
    senderPhone: string;
  }) => {
    const res = await api.post("/bd/mfs-payments/submit", payload);
    return res.data.data;
  },
  verifyMfsPayment: async (
    paymentId: string,
    payload: { decision: "verified" | "rejected" }
  ) => {
    const res = await api.post(`/bd/mfs-payments/${paymentId}/verify`, payload);
    return res.data.data;
  },
};
