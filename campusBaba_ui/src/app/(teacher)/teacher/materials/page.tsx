"use client";

import { Header } from "@/components/layout/Header";
import { StudyLibraryView } from "@/components/bd/StudyLibraryView";

export default function TeacherMaterialsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Lecture Sheets & Study Materials" />
      <main className="p-5 flex-1">
        <StudyLibraryView canUpload={true} showPhysicalCatalog={false} />
      </main>
    </div>
  );
}
