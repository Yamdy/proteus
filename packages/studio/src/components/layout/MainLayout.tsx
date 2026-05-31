import type { ReactNode } from "react";
import Sidebar from "./Sidebar";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="relative flex h-screen overflow-hidden bg-surface text-gray-100">
      {/* Deep ocean gradient mesh */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-[20%] -top-[30%] h-[70vh] w-[70vh] rounded-full bg-cyan-500/[0.03] blur-[100px]" />
        <div className="absolute -bottom-[20%] -right-[15%] h-[60vh] w-[60vh] rounded-full bg-teal-400/[0.025] blur-[80px]" />
        <div className="absolute bottom-[10%] left-[40%] h-[40vh] w-[40vh] rounded-full bg-purple-500/[0.02] blur-[90px]" />
      </div>

      <Sidebar />
      <main className="relative z-10 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
