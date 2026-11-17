"use client";

import { Header } from "@/components/layout/Header";
import { StudyLibraryView } from "@/components/bd/StudyLibraryView";

export default function AdminLibraryPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Digital Library & Lecture Sheets" />
      <main className="p-5 flex-1">
        <StudyLibraryView canUpload={true} showPhysicalCatalog={true} />
      </main>
    </div>
  );
}
