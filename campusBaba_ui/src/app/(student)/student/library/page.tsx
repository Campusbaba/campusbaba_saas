"use client";

import { Header } from "@/components/layout/Header";
import { StudyLibraryView } from "@/components/bd/StudyLibraryView";

export default function StudentLibraryPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Study Library & Lecture Sheets" />
      <main className="p-5 flex-1">
        <StudyLibraryView canUpload={false} showPhysicalCatalog={true} />
      </main>
    </div>
  );
}
