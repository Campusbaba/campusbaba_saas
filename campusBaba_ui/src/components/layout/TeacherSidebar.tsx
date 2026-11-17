"use client";
import { LayoutDashboard, Clock, CalendarCheck, FilePen, Users, ClipboardCheck, Bell, FileText, CheckSquare, ClipboardList } from "lucide-react";
import { AppSidebar } from "./Sidebar";

export function TeacherSidebar() {
    return (
        <AppSidebar
            role="teacher"
            navItems={[
                { labelKey: "common.pages.dashboard", href: "/teacher/dashboard", icon: LayoutDashboard },
                {
                    labelKey: "sidebar.groups.academics",
                    icon: Users,
                    items: [
                        { labelKey: "sidebar.items.myRoutines", href: "/teacher/routines", icon: Clock },
                        { labelKey: "common.pages.attendance", href: "/teacher/attendance", icon: CalendarCheck },
                        { labelKey: "sidebar.items.lectureSheets", href: "/teacher/materials", icon: FileText },
                        { labelKey: "sidebar.items.assignments", href: "/teacher/assignments", icon: ClipboardList },
                    ],
                },
                {
                    labelKey: "sidebar.groups.examManagement",
                    icon: FilePen,
                    items: [
                        { labelKey: "common.pages.exams", href: "/teacher/exams", icon: FilePen },
                        { labelKey: "common.pages.exammarks", href: "/teacher/exams/marks", icon: ClipboardCheck },
                        { labelKey: "sidebar.items.mcqTests", href: "/teacher/mcq", icon: CheckSquare },
                    ],
                },
                { labelKey: "common.pages.notices", href: "/teacher/notices", icon: Bell },
            ]}
        />
    );
}
