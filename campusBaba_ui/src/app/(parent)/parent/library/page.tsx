"use client";

import { Header } from "@/components/layout/Header";
import { StudyLibraryView } from "@/components/bd/StudyLibraryView";

export default function ParentLibraryPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Study Materials & Lecture Sheets" />
      <main className="p-5 flex-1">
        <StudyLibraryView canUpload={false} showPhysicalCatalog={false} />
      </main>
    </div>
  );
}
