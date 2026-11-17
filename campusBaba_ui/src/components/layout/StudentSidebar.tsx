"use client";
import { LayoutDashboard, CreditCard, CalendarCheck, Clock, FilePen, ClipboardCheck, BookOpen, Library, CheckSquare, ClipboardList, Smartphone } from "lucide-react";
import { AppSidebar } from "./Sidebar";

export function StudentSidebar() {
    return (
        <AppSidebar
            role="student"
            navItems={[
                { labelKey: "common.pages.dashboard", href: "/student/dashboard", icon: LayoutDashboard },
                { labelKey: "common.pages.payments", href: "/student/payments", icon: CreditCard },
                { labelKey: "sidebar.items.mfsPay", href: "/student/mfs-pay", icon: Smartphone },
                {
                    labelKey: "sidebar.groups.academics",
                    icon: BookOpen,
                    items: [
                        { labelKey: "sidebar.items.myRoutines", href: "/student/routines", icon: Clock },
                        { labelKey: "common.pages.attendance", href: "/student/attendance", icon: CalendarCheck },
                        { labelKey: "sidebar.items.studyLibrary", href: "/student/library", icon: Library },
                        { labelKey: "sidebar.items.assignments", href: "/student/assignments", icon: ClipboardList },
                    ],
                },
                {
                    labelKey: "sidebar.groups.examManagement",
                    icon: FilePen,
                    items: [
                        { labelKey: "sidebar.items.examSchedule", href: "/student/exams", icon: FilePen },
                        { labelKey: "common.pages.exammarks", href: "/student/exams/marks", icon: ClipboardCheck },
                        { labelKey: "sidebar.items.mcqTests", href: "/student/mcq", icon: CheckSquare },
                    ],
                },
            ]}
        />
    );
}
